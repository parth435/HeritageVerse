const express = require("express");
const pool = require("../config/db");
const { authenticateOptional } = require("../middleware/auth");

const router = express.Router();
const DEFAULT_LIMIT = 20;
const MAP_DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1000000;
const MAX_FILTER_LENGTH = 200;
const MAX_TOKENIZED_QUERY_TERMS = 10;

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

function readBooleanQuery(req, res, key) {
  const raw = req.query[key];
  if (raw === undefined) return { ok: true, value: null };
  if (raw !== "true" && raw !== "false") {
    res.status(400).json({
      success: false,
      message: `Query parameter '${key}' must be true or false`,
    });
    return { ok: false };
  }
  return { ok: true, value: raw === "true" };
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
      `SELECT c.id, c.name, c.slug
         FROM heritage_categories c
        WHERE EXISTS (
          SELECT 1 FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.category_id = c.id AND h.publication_status = 'published'
        )
        ORDER BY c.name ASC, c.id ASC`
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

router.get("/heritage-facets", async (req, res) => {
  const state = readTextQuery(req, res, "state");
  if (!state.ok) return;
  try {
    const [states, districts] = await Promise.all([
      pool.query(`SELECT DISTINCT state FROM heritage
        WHERE publication_status='published'
          AND EXISTS (SELECT 1 FROM heritage_catalog_membership membership WHERE membership.heritage_id=heritage.id)
          AND NULLIF(BTRIM(state), '') IS NOT NULL
        ORDER BY state`),
      state.value
        ? pool.query(`SELECT DISTINCT district FROM heritage
            WHERE publication_status='published' AND state=$1
              AND EXISTS (SELECT 1 FROM heritage_catalog_membership membership WHERE membership.heritage_id=heritage.id)
              AND NULLIF(BTRIM(district), '') IS NOT NULL
            ORDER BY district`, [state.value])
        : Promise.resolve({ rows: [] }),
    ]);
    return res.json({
      success: true,
      states: states.rows.map((row) => row.state),
      districts: districts.rows.map((row) => row.district),
    });
  } catch (error) {
    console.error("Heritage filter options failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load heritage filter options" });
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
  const hasTimeline = readBooleanQuery(req, res, "hasTimeline");
  if (!hasTimeline.ok) return;

  const limit = readPaginationValue(req, res, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  if (limit === null) return;
  const offset = readPaginationValue(req, res, "offset", 0, MAX_OFFSET);
  if (offset === null) return;

  const values = [];
  const conditions = [
    "h.publication_status = 'published'",
    "EXISTS (SELECT 1 FROM heritage_catalog_membership membership WHERE membership.heritage_id = h.id)",
  ];

  if (q.value !== null) {
    const searchableText = "CONCAT_WS(' ', h.name, h.description, h.history, h.cultural_significance)";
    values.push(`%${q.value}%`);
    const phrasePlaceholder = `$${values.length}`;
    const normalizedQuery = q.value.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const terms = [...new Set(normalizedQuery.split(/\s+/).filter(Boolean))];
    let tokenizedCondition = "";

    if (terms.length > 1 && terms.length <= MAX_TOKENIZED_QUERY_TERMS) {
      const termConditions = terms.map((term) => {
        values.push(`%${term}%`);
        return `${searchableText} ILIKE $${values.length}`;
      });
      tokenizedCondition = ` OR (${termConditions.join(" AND ")})`;
    }

    conditions.push(`(${searchableText} ILIKE ${phrasePlaceholder}${tokenizedCondition})`);
  }

  addExactFilter(conditions, values, "c.slug", category.value);
  addExactFilter(conditions, values, "h.state", state.value);
  addExactFilter(conditions, values, "h.district", district.value);
  if (hasTimeline.value !== null) {
    conditions.push(`${hasTimeline.value ? "" : "NOT "}EXISTS (
      SELECT 1 FROM heritage_timeline_events timeline
      WHERE timeline.heritage_id = h.id
    )`);
  }

  const whereClause = conditions.join(" AND ");
  const filterValues = [...values];
  values.push(limit, offset);

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM heritage h
       JOIN heritage_categories c ON c.id = h.category_id
       JOIN heritage_catalog_membership membership ON membership.heritage_id = h.id
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
         h.locality,
         h.address,
         h.latitude,
         h.longitude,
         EXISTS (
           SELECT 1 FROM heritage_sources coordinate_source
            WHERE coordinate_source.heritage_id = h.id
              AND 'coordinates' = ANY(coordinate_source.claims_supported)
              AND coordinate_source.review_status = 'approved'
         ) AS coordinates_verified,
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
       FROM heritage h
       JOIN heritage_categories c ON c.id = h.category_id
       JOIN heritage_catalog_membership membership ON membership.heritage_id = h.id
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
           AND m.verification_status IN ('verified', 'unverified')
         ORDER BY (m.verification_status = 'verified') DESC, m.display_order ASC, m.id ASC
         LIMIT 1
       ) selected_image ON TRUE
       WHERE ${whereClause}
       ORDER BY membership.display_order ASC
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

router.get("/heritage-map", async (req, res) => {
  const q = readTextQuery(req, res, "q");
  if (!q.ok) return;
  const category = readTextQuery(req, res, "category");
  if (!category.ok) return;
  const state = readTextQuery(req, res, "state");
  if (!state.ok) return;
  const district = readTextQuery(req, res, "district");
  if (!district.ok) return;

  const limit = readPaginationValue(req, res, "limit", MAP_DEFAULT_LIMIT, MAX_LIMIT);
  if (limit === null) return;
  const offset = readPaginationValue(req, res, "offset", 0, MAX_OFFSET);
  if (offset === null) return;

  const values = [];
  const conditions = [
    "h.publication_status = 'published'",
    "EXISTS (SELECT 1 FROM heritage_catalog_membership membership WHERE membership.heritage_id = h.id)",
    "h.latitude IS NOT NULL",
    "h.longitude IS NOT NULL",
    "h.latitude BETWEEN -90 AND 90",
    "h.longitude BETWEEN -180 AND 180",
    "EXISTS (" +
      "SELECT 1 FROM heritage_sources coordinate_source " +
      "WHERE coordinate_source.heritage_id = h.id " +
      "AND 'coordinates' = ANY(coordinate_source.claims_supported) " +
      "AND coordinate_source.review_status = 'approved')",
  ];

  if (q.value !== null) {
    const searchableText = "CONCAT_WS(' ', h.name, h.description, h.history, h.cultural_significance)";
    values.push("%" + q.value + "%");
    const phrasePlaceholder = "$" + values.length;
    const normalizedQuery = q.value.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const terms = [...new Set(normalizedQuery.split(/\s+/).filter(Boolean))];
    let tokenizedCondition = "";

    if (terms.length > 1 && terms.length <= MAX_TOKENIZED_QUERY_TERMS) {
      const termConditions = terms.map((term) => {
        values.push("%" + term + "%");
        return searchableText + " ILIKE $" + values.length;
      });
      tokenizedCondition = " OR (" + termConditions.join(" AND ") + ")";
    }

    conditions.push("(" + searchableText + " ILIKE " + phrasePlaceholder + tokenizedCondition + ")");
  }

  addExactFilter(conditions, values, "c.slug", category.value);
  addExactFilter(conditions, values, "h.state", state.value);
  addExactFilter(conditions, values, "h.district", district.value);
  const whereClause = conditions.join(" AND ");
  const filterValues = [...values];
  values.push(limit, offset);

  try {
    const countResult = await pool.query(
      "SELECT COUNT(*) AS total\n" +
        "FROM heritage h\n" +
        "JOIN heritage_categories c ON c.id = h.category_id\n" +
        "JOIN heritage_catalog_membership membership ON membership.heritage_id = h.id\n" +
        "WHERE " + whereClause,
      filterValues
    );
    const mapQuery = [
      "SELECT h.id, h.slug, h.name, h.description, h.state, h.district, h.locality,",
      "       h.latitude, h.longitude, TRUE AS coordinates_verified, selected_image.media",
      "FROM heritage h",
      "JOIN heritage_categories c ON c.id = h.category_id",
      "JOIN heritage_catalog_membership membership ON membership.heritage_id = h.id",
      "LEFT JOIN LATERAL (",
      "  SELECT jsonb_build_array(jsonb_build_object(",
      "    'id', m.id, 'heritage_id', m.heritage_id, 'media_type', m.media_type,",
      "    'url', m.url, 'caption', m.caption, 'alt_text', m.alt_text,",
      "    'credit', m.credit, 'license', m.license, 'display_order', m.display_order,",
      "    'source_url', m.source_url, 'creator', m.creator, 'documented_date', m.documented_date,",
      "    'license_url', m.license_url, 'media_role', m.media_role, 'media_context', m.media_context,",
      "    'verification_status', m.verification_status, 'is_illustrative', m.is_illustrative,",
      "    'source_accessed_on', m.source_accessed_on, 'thumbnail_url', m.thumbnail_url",
      "  )) AS media",
      "  FROM heritage_media m",
      "  WHERE m.heritage_id = h.id",
      "    AND m.media_type = 'image'",
      "    AND m.media_role IN ('gallery', 'current')",
      "    AND m.verification_status IN ('verified', 'unverified')",
      "  ORDER BY (m.verification_status = 'verified') DESC, m.display_order ASC, m.id ASC",
      "  LIMIT 1",
      ") selected_image ON TRUE",
      "WHERE " + whereClause,
      "ORDER BY membership.display_order ASC",
      "LIMIT $" + (values.length - 1) + " OFFSET $" + values.length,
    ].join("\n");
    const result = await pool.query(mapQuery, values);

    return res.json({
      success: true,
      items: result.rows.map((row) => ({ ...row, media: row.media ?? [] })),
      pagination: {
        limit,
        offset,
        total: Number(countResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error("Heritage map query failed:", error.code || "unknown error");
    return res.status(500).json({
      success: false,
      message: "Failed to load heritage map locations",
    });
  }
});

router.get("/heritage/:id", authenticateOptional, async (req, res) => {
  const rawId = req.params.id;
  const isNumericId = /^\d+$/.test(rawId);
  const id = isNumericId ? Number(rawId) : NaN;
  const isSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawId);

  if ((isNumericId && (!Number.isSafeInteger(id) || id < 1)) || (!isNumericId && !isSlug)) {
    return res.status(400).json({
      success: false,
      message: "Heritage identifier must be a positive integer or slug",
    });
  }

  try {
    let requestedId = id;
    if (!isNumericId) {
      const slugResult = await pool.query(
        `SELECT COALESCE(
           (SELECT h.id FROM heritage h WHERE h.slug = $1),
           (SELECT alias.heritage_id FROM heritage_slug_aliases alias WHERE alias.slug_alias = $1)
         ) AS id`,
        [rawId]
      );
      requestedId = Number(slugResult.rows[0]?.id);
      if (!Number.isSafeInteger(requestedId) || requestedId < 1) {
        return res.status(404).json({ success: false, message: "Published heritage record was not found" });
      }
    }

    const result = await pool.query(
      `WITH requested_record AS (
         SELECT COALESCE(
           CASE WHEN $2::INTEGER IS NOT NULL AND EXISTS (
             SELECT 1 FROM favorites f WHERE f.heritage_id = $1 AND f.user_id = $2
             UNION ALL
             SELECT 1 FROM visited_places v WHERE v.heritage_id = $1 AND v.user_id = $2
             UNION ALL
             SELECT 1 FROM reviews r WHERE r.heritage_id = $1 AND r.user_id = $2
             UNION ALL
             SELECT 1 FROM journey_stops js JOIN journeys j ON j.id = js.journey_id
              WHERE js.heritage_id = $1 AND j.user_id = $2
           ) THEN $1 END,
           (SELECT alias.canonical_heritage_id FROM heritage_catalog_aliases alias WHERE alias.alias_heritage_id = $1),
           $1
         ) AS heritage_id
       )
       SELECT
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
         EXISTS (
           SELECT 1 FROM heritage_sources coordinate_source
            WHERE coordinate_source.heritage_id = h.id
              AND 'coordinates' = ANY(coordinate_source.claims_supported)
              AND coordinate_source.review_status = 'approved'
         ) AS coordinates_verified,
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
           'display_order', m.display_order,
           'source_url', m.source_url,
           'creator', m.creator,
           'documented_date', m.documented_date,
           'license_url', m.license_url,
           'media_role', m.media_role,
           'media_context', m.media_context,
           'verification_status', m.verification_status,
           'is_illustrative', m.is_illustrative,
           'source_accessed_on', m.source_accessed_on,
           'thumbnail_url', m.thumbnail_url,
           'provider', m.provider,
           'wikimedia_filename', m.wikimedia_filename,
           'match_confidence', m.match_confidence
         ) ORDER BY (m.verification_status = 'verified') DESC, m.display_order ASC, m.id ASC) AS items
         FROM heritage_media m
         WHERE m.heritage_id = h.id
            OR (
              m.heritage_id <> h.id
              AND m.media_type = 'image'
              AND m.verification_status = 'verified'
              AND m.is_illustrative = FALSE
              AND COALESCE(
                h.wikidata_qid,
                (SELECT current_acquisition.matched_qid
                   FROM heritage_image_acquisition current_acquisition
                  WHERE current_acquisition.heritage_id = h.id)
              ) IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM heritage media_owner
                LEFT JOIN heritage_image_acquisition owner_acquisition
                  ON owner_acquisition.heritage_id = media_owner.id
                 WHERE media_owner.id = m.heritage_id
                   AND COALESCE(media_owner.wikidata_qid, owner_acquisition.matched_qid) = COALESCE(
                     h.wikidata_qid,
                     (SELECT current_acquisition.matched_qid
                        FROM heritage_image_acquisition current_acquisition
                       WHERE current_acquisition.heritage_id = h.id)
                   )
              )
            )
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
           'source_title', s.source_title,
           'publisher', s.publisher,
           'source_url', s.source_url,
           'source_note', s.source_note,
           'accessed_on', s.accessed_on,
           'claims_supported', s.claims_supported,
           'confidence', s.confidence,
           'review_status', s.review_status,
           'reviewed_by', s.reviewed_by,
           'reviewed_on', s.reviewed_on
         ) ORDER BY s.id ASC) AS items
         FROM heritage_sources s
         WHERE s.heritage_id = h.id
       ) sources ON TRUE
       WHERE h.id = (SELECT heritage_id FROM requested_record)
         AND h.publication_status = 'published'
         AND (
           EXISTS (SELECT 1 FROM heritage_catalog_membership membership WHERE membership.heritage_id = h.id)
           OR ($2::INTEGER IS NOT NULL AND (
             EXISTS (SELECT 1 FROM favorites f WHERE f.heritage_id = h.id AND f.user_id = $2)
             OR EXISTS (SELECT 1 FROM visited_places v WHERE v.heritage_id = h.id AND v.user_id = $2)
             OR EXISTS (SELECT 1 FROM reviews r WHERE r.heritage_id = h.id AND r.user_id = $2)
             OR EXISTS (SELECT 1 FROM journey_stops js JOIN journeys j ON j.id = js.journey_id
                         WHERE js.heritage_id = h.id AND j.user_id = $2)
           ))
         )`,
      [requestedId, req.user?.id ?? null]
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
