const express = require("express");
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");
const { readPositiveId } = require("../middleware/validation");

const router = express.Router();

function invalidId(res) {
  return res.status(400).json({ success: false, message: "Heritage ID must be a positive integer" });
}

router.get("/visited", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.created_at AS visited_at, h.id, h.slug, h.name, h.description,
              h.history, h.cultural_significance, h.architecture, h.historical_period,
              h.category_id, jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
              h.state, h.district, h.locality, h.address, h.latitude, h.longitude, h.publication_status, h.created_at, h.updated_at,
              '[]'::jsonb AS media
       FROM visited_places v
       JOIN heritage h ON h.id = v.heritage_id
       JOIN heritage_categories c ON c.id = h.category_id
       WHERE v.user_id = $1 AND h.publication_status = 'published'
       ORDER BY v.created_at DESC, h.id DESC`,
      [req.user.id],
    );
    return res.json({ success: true, visited: result.rows.map(({ visited_at, ...heritage }) => ({ heritage, created_at: visited_at })) });
  } catch (error) {
    console.error("Visited places query failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load visited places" });
  }
});

router.post("/visited", authenticate, async (req, res) => {
  const heritageId = readPositiveId(req.body?.heritage_id);
  if (heritageId === null) return invalidId(res);
  try {
    const heritage = await pool.query("SELECT id FROM heritage WHERE id = $1 AND publication_status = 'published'", [heritageId]);
    if (heritage.rows.length === 0) return res.status(404).json({ success: false, message: "Published heritage record was not found" });
    const result = await pool.query(
      `INSERT INTO visited_places (user_id, heritage_id) VALUES ($1, $2)
       ON CONFLICT (user_id, heritage_id) DO NOTHING RETURNING heritage_id, created_at`,
      [req.user.id, heritageId],
    );
    return res.status(result.rows.length ? 201 : 200).json({ success: true, message: result.rows.length ? "Marked as visited" : "Already marked as visited", visited: result.rows[0] ?? { heritage_id: heritageId } });
  } catch (error) {
    console.error("Visited place creation failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to save visited place" });
  }
});

router.delete("/visited/:heritageId", authenticate, async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  if (heritageId === null) return invalidId(res);
  try {
    const result = await pool.query("DELETE FROM visited_places WHERE user_id = $1 AND heritage_id = $2 RETURNING heritage_id", [req.user.id, heritageId]);
    return res.json({ success: true, message: result.rows.length ? "Removed from visited places" : "Place was not marked as visited", removed: Boolean(result.rows.length) });
  } catch (error) {
    console.error("Visited place deletion failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to remove visited place" });
  }
});

module.exports = router;
