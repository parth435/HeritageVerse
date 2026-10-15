const express = require("express");
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

function readHeritageId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const id = Number(value.trim());
    if (Number.isSafeInteger(id) && id > 0) return id;
  }

  return null;
}

function invalidHeritageId(res) {
  return res.status(400).json({
    success: false,
    message: "Heritage ID must be a positive integer",
  });
}

router.get("/favorites", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         f.created_at AS favorited_at,
         h.id,
         h.slug,
         h.name,
         h.description,
         h.history,
         h.cultural_significance,
         h.architecture,
         h.historical_period,
         h.category_id,
         jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
         h.state,
         h.district,
         h.locality,
         h.address,
         h.latitude,
         h.longitude,
         h.publication_status,
         h.created_at,
         h.updated_at,
         CASE
           WHEN selected_image.id IS NULL THEN '[]'::jsonb
           ELSE jsonb_build_array(jsonb_build_object(
             'id', selected_image.id,
             'heritage_id', selected_image.heritage_id,
             'media_type', selected_image.media_type,
             'url', selected_image.url,
             'caption', selected_image.caption,
             'alt_text', selected_image.alt_text,
             'credit', selected_image.credit,
             'license', selected_image.license,
             'display_order', selected_image.display_order,
             'source_url', selected_image.source_url,
             'creator', selected_image.creator,
             'documented_date', selected_image.documented_date,
             'license_url', selected_image.license_url,
             'media_role', selected_image.media_role,
             'media_context', selected_image.media_context,
             'verification_status', selected_image.verification_status,
             'is_illustrative', selected_image.is_illustrative,
             'source_accessed_on', selected_image.source_accessed_on,
             'thumbnail_url', selected_image.thumbnail_url,
             'provider', selected_image.provider,
             'wikimedia_filename', selected_image.wikimedia_filename,
             'match_confidence', selected_image.match_confidence
           ))
         END AS media
       FROM favorites f
       JOIN heritage h ON h.id = f.heritage_id
       JOIN heritage_categories c ON c.id = h.category_id
       LEFT JOIN LATERAL (
         SELECT m.id, m.heritage_id, m.media_type, m.url, m.caption,
                m.alt_text, m.credit, m.license, m.display_order, m.source_url,
                m.creator, m.documented_date, m.license_url, m.media_role,
                m.media_context, m.verification_status, m.is_illustrative,
                m.source_accessed_on, m.thumbnail_url, m.provider,
                m.wikimedia_filename, m.match_confidence
         FROM heritage_media m
         WHERE m.heritage_id = h.id AND m.media_type = 'image'
           AND m.media_role IN ('gallery', 'current')
           AND m.verification_status = 'verified'
           AND m.is_illustrative = FALSE
         ORDER BY m.display_order ASC, m.id ASC
         LIMIT 1
       ) selected_image ON TRUE
       WHERE f.user_id = $1 AND h.publication_status = 'published'
       ORDER BY f.created_at DESC, h.id DESC`,
      [req.user.id],
    );

    return res.json({
      success: true,
      favorites: result.rows.map(({ favorited_at, ...heritage }) => ({
        heritage,
        created_at: favorited_at,
      })),
    });
  } catch (error) {
    console.error("Favorites query failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to load favorites",
    });
  }
});

router.post("/favorites", authenticate, async (req, res) => {
  const heritageId = readHeritageId(req.body?.heritage_id);
  if (heritageId === null) return invalidHeritageId(res);

  try {
    const heritageResult = await pool.query(
      "SELECT id FROM heritage WHERE id = $1 AND publication_status = 'published'",
      [heritageId],
    );

    if (heritageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Published heritage record was not found",
      });
    }

    const result = await pool.query(
      `INSERT INTO favorites (user_id, heritage_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, heritage_id) DO NOTHING
       RETURNING heritage_id, created_at`,
      [req.user.id, heritageId],
    );

    const favorite = result.rows[0] ?? { heritage_id: heritageId };
    return res.status(result.rows.length > 0 ? 201 : 200).json({
      success: true,
      message: result.rows.length > 0 ? "Added to favorites" : "Already in favorites",
      favorite,
    });
  } catch (error) {
    console.error("Favorite creation failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to save favorite",
    });
  }
});

router.delete("/favorites/:heritageId", authenticate, async (req, res) => {
  const heritageId = readHeritageId(req.params.heritageId);
  if (heritageId === null) return invalidHeritageId(res);

  try {
    const result = await pool.query(
      "DELETE FROM favorites WHERE user_id = $1 AND heritage_id = $2 RETURNING heritage_id",
      [req.user.id, heritageId],
    );

    return res.json({
      success: true,
      message: result.rows.length > 0 ? "Removed from favorites" : "Favorite was not saved",
      removed: result.rows.length > 0,
    });
  } catch (error) {
    console.error("Favorite deletion failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to remove favorite",
    });
  }
});

module.exports = router;
