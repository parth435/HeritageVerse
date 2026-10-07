const express = require("express");
const pool = require("./db");

const router = express.Router();
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1000000;
const MAX_FILTER_LENGTH = 200;

function readTextQuery(req, res, key) {
  const raw = req.query[key];

  if (raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") {
    res.status(400).json({
      success: false,
      message: `Query parameter '${key}' must be a single string`,
    });
    return { ok: false };
  }

  const value = raw.trim();
  if (value.length > MAX_FILTER_LENGTH) {
    res.status(400).json({
      success: false,
      message: `Query parameter '${key}' is too long`,
    });
    return { ok: false };
  }

  return { ok: true, value: value || null };
}

function readPaginationValue(req, res, key, fallback, maximum) {
  const raw = req.query[key];
  if (raw === undefined) return fallback;

  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    res.status(400).json({
      success: false,
      message: `Query parameter '${key}' must be an integer`,
    });
    return null;
  }

  const value = Number(raw);
  const minimum = key === "limit" ? 1 : 0;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    res.status(400).json({
      success: false,
      message: key === "limit"
        ? `Query parameter 'limit' must be between 1 and ${MAX_LIMIT}`
        : `Query parameter 'offset' must be between 0 and ${MAX_OFFSET}`,
    });
    return null;
  }

  return value;
}

function addExactFilter(conditions, values, column, value) {
  if (value === null) return;
  values.push(value);
  conditions.push(`${column} = $${values.length}`);
}

router.get("/categories", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, slug FROM heritage_categories ORDER BY name ASC, id ASC"
    );

    return res.json({ success: true, categories: result.rows });
  } catch (error) {
    console.error("Category query failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to load categories",
    });
  }
});

router.get("/heritage", async (req, res) => {
  const q = readTextQuery(req, res, "q");
  if (!q.ok) return;
  const category = readTextQuery(req, res, "category");
  if (!category.ok) return;
  const state = readTextQuery(req, res, "state");
  if (!state.ok) return;
  const district = readTextQuery(req, res, "district");
  if (!district.ok) return;

  const limit = readPaginationValue(req, res, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  if (limit === null) return;
  const offset = readPaginationValue(req, res, "offset", 0, MAX_OFFSET);
  if (offset === null) return;

  const values = [];
  const conditions = ["h.publication_status = 'published'"];

  if (q.value !== null) {
    values.push(`%${q.value}%`);
    const placeholder = `$${values.length}`;
    conditions.push(`(
      h.name ILIKE ${placeholder}
      OR h.description ILIKE ${placeholder}
      OR h.history ILIKE ${placeholder}
      OR h.cultural_significance ILIKE ${placeholder}
    )`);
  }

  addExactFilter(conditions, values, "c.slug", category.value);
  addExactFilter(conditions, values, "h.state", state.value);
  addExactFilter(conditions, values, "h.district", district.value);

  const whereClause = conditions.join(" AND ");
  const filterValues = [...values];
  values.push(limit, offset);

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM heritage h
       JOIN heritage_categories c ON c.id = h.category_id
       WHERE ${whereClause}`,
      filterValues
    );

    const result = await pool.query(
      `SELECT
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
         h.latitude,
         h.longitude,
         h.publication_status,
         h.created_at,
         h.updated_at,
         selected_image.url AS image_url,
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
             'display_order', selected_image.display_order
           ))
         END AS media
       FROM heritage h
       JOIN heritage_categories c ON c.id = h.category_id
       LEFT JOIN LATERAL (
         SELECT m.id, m.heritage_id, m.media_type, m.url, m.caption,
                m.alt_text, m.credit, m.license, m.display_order
         FROM heritage_media m
         WHERE m.heritage_id = h.id AND m.media_type = 'image'
         ORDER BY m.display_order ASC, m.id ASC
         LIMIT 1
       ) selected_image ON TRUE
       WHERE ${whereClause}
       ORDER BY h.name ASC, h.id ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({
      success: true,
      items: result.rows,
      pagination: {
        limit,
        offset,
        total: Number(countResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error("Heritage collection query failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to load heritage collection",
    });
  }
});

router.get("/heritage/:id", async (req, res) => {
  const rawId = req.params.id;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "Heritage ID must be a positive integer",
    });
  }

  try {
    const result = await pool.query(
      `SELECT
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
         h.latitude,
         h.longitude,
         h.publication_status,
         h.created_at,
         h.updated_at,
         COALESCE(media.items, '[]'::jsonb) AS media,
         COALESCE(events.items, '[]'::jsonb) AS timeline_events,
         COALESCE(artifacts.items, '[]'::jsonb) AS artifacts,
         COALESCE(layers.items, '[]'::jsonb) AS architectural_layers,
         COALESCE(sources.items, '[]'::jsonb) AS sources
       FROM heritage h
       JOIN heritage_categories c ON c.id = h.category_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', m.id,
           'heritage_id', m.heritage_id,
           'media_type', m.media_type,
           'url', m.url,
           'caption', m.caption,
           'alt_text', m.alt_text,
           'credit', m.credit,
           'license', m.license,
           'display_order', m.display_order
         ) ORDER BY m.display_order ASC, m.id ASC) AS items
         FROM heritage_media m
         WHERE m.heritage_id = h.id
       ) media ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', e.id,
           'heritage_id', e.heritage_id,
           'title', e.title,
           'description', e.description,
           'event_period', e.event_period,
           'event_date', e.event_date,
           'display_order', e.display_order,
           'source_id', e.source_id
         ) ORDER BY e.display_order ASC, e.id ASC) AS items
         FROM heritage_timeline_events e
         WHERE e.heritage_id = h.id
       ) events ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', a.id,
           'heritage_id', a.heritage_id,
           'name', a.name,
           'description', a.description,
           'period', a.period,
           'material', a.material,
           'source_id', a.source_id
         ) ORDER BY a.id ASC) AS items
         FROM heritage_artifacts a
         WHERE a.heritage_id = h.id
       ) artifacts ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', l.id,
           'heritage_id', l.heritage_id,
           'name', l.name,
           'description', l.description,
           'display_order', l.display_order,
           'source_id', l.source_id
         ) ORDER BY l.display_order ASC, l.id ASC) AS items
         FROM heritage_architectural_layers l
         WHERE l.heritage_id = h.id
       ) layers ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', s.id,
           'heritage_id', s.heritage_id,
           'source_name', s.source_name,
           'source_url', s.source_url,
           'source_note', s.source_note
         ) ORDER BY s.id ASC) AS items
         FROM heritage_sources s
         WHERE s.heritage_id = h.id
       ) sources ON TRUE
       WHERE h.id = $1 AND h.publication_status = 'published'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Published heritage record was not found",
      });
    }

    return res.json({ success: true, heritage: result.rows[0] });
  } catch (error) {
    console.error("Heritage detail query failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to load heritage record",
    });
  }
});

module.exports = router;
