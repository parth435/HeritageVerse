const express = require("express");
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");
const { readPositiveId, readText } = require("../middleware/validation");

const router = express.Router();

function reviewInput(body) {
  const rating = typeof body?.rating === "number" ? body.rating : Number(body?.rating);
  const comment = readText(body?.comment, { maximum: 2000 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment === null) return null;
  return { rating, comment: comment || null };
}

async function publishedHeritage(id) {
  return pool.query("SELECT id FROM heritage WHERE id = $1 AND publication_status = 'published'", [id]);
}

router.get("/heritage/:heritageId/reviews", async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  if (heritageId === null) return res.status(400).json({ success: false, message: "Heritage ID must be a positive integer" });
  try {
    const heritage = await publishedHeritage(heritageId);
    if (!heritage.rows.length) return res.status(404).json({ success: false, message: "Published heritage record was not found" });
    const [reviews, summary] = await Promise.all([
      pool.query(`SELECT r.id, r.heritage_id, r.rating, r.comment, r.created_at, r.updated_at,
                         jsonb_build_object('id', u.id, 'name', u.name) AS author
                  FROM reviews r JOIN users u ON u.id = r.user_id
                  WHERE r.heritage_id = $1 ORDER BY r.created_at DESC, r.id DESC`, [heritageId]),
      pool.query("SELECT COUNT(*)::INTEGER AS count, COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating FROM reviews WHERE heritage_id = $1", [heritageId]),
    ]);
    return res.json({ success: true, reviews: reviews.rows, summary: summary.rows[0] });
  } catch (error) {
    console.error("Review query failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
});

router.post("/heritage/:heritageId/reviews", authenticate, async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  const input = reviewInput(req.body);
  if (heritageId === null || !input) return res.status(400).json({ success: false, message: "Provide a heritage ID, rating from 1 to 5, and a review up to 2000 characters" });
  try {
    const heritage = await publishedHeritage(heritageId);
    if (!heritage.rows.length) return res.status(404).json({ success: false, message: "Published heritage record was not found" });
    const result = await pool.query(
      `INSERT INTO reviews (user_id, heritage_id, rating, comment) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, heritage_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
       RETURNING id, heritage_id, rating, comment, created_at, updated_at`,
      [req.user.id, heritageId, input.rating, input.comment],
    );
    return res.status(201).json({ success: true, message: "Review saved", review: result.rows[0] });
  } catch (error) {
    console.error("Review save failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to save review" });
  }
});

router.patch("/reviews/:reviewId", authenticate, async (req, res, next) => {
  const reviewId = readPositiveId(req.params.reviewId);
  const input = reviewInput(req.body);
  if (reviewId === null || !input) return res.status(400).json({ success: false, message: "Provide a rating from 1 to 5 and a review up to 2000 characters" });
  req.reviewId = reviewId;
  req.reviewInput = input;
  return requireAdminOrOwner(req, res, next);
}, async (req, res) => {
  try {
    const result = await pool.query("UPDATE reviews SET rating = $1, comment = $2 WHERE id = $3 AND ($4::boolean OR user_id = $5) RETURNING id, heritage_id, rating, comment, created_at, updated_at", [req.reviewInput.rating, req.reviewInput.comment, req.reviewId, req.isAdmin, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Review was not found" });
    return res.json({ success: true, message: "Review updated", review: result.rows[0] });
  } catch (error) {
    console.error("Review update failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to update review" });
  }
});

router.delete("/reviews/:reviewId", authenticate, async (req, res, next) => {
  const reviewId = readPositiveId(req.params.reviewId);
  if (reviewId === null) return res.status(400).json({ success: false, message: "Review ID must be a positive integer" });
  req.reviewId = reviewId;
  return requireAdminOrOwner(req, res, next);
}, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM reviews WHERE id = $1 AND ($2::boolean OR user_id = $3) RETURNING id", [req.reviewId, req.isAdmin, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Review was not found" });
    return res.json({ success: true, message: "Review deleted" });
  } catch (error) {
    console.error("Review deletion failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to delete review" });
  }
});

async function requireAdminOrOwner(req, res, next) {
  try {
    const role = await pool.query("SELECT COALESCE(to_jsonb(users) ->> 'role', 'user') AS role FROM users WHERE id = $1", [req.user.id]);
    req.isAdmin = role.rows[0]?.role === "admin";
    return next();
  } catch (error) {
    console.error("Review authorization failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to authorize review request" });
  }
}

module.exports = router;
