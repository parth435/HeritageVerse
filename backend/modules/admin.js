const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/auth");
const pool = require("../config/db");
const { readCoordinate, readPositiveId, readText } = require("../middleware/validation");

const router = express.Router();

router.get("/admin/dashboard", authenticate, requireAdmin, async (req, res) => {
  try {
    const [heritage, users, reviews, categories, images] = await Promise.all([
      pool.query("SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE publication_status = 'published')::INTEGER AS published, COUNT(*) FILTER (WHERE publication_status = 'draft')::INTEGER AS draft FROM heritage"),
      pool.query("SELECT COUNT(*)::INTEGER AS total FROM users"),
      pool.query("SELECT COUNT(*)::INTEGER AS total FROM reviews"),
      pool.query("SELECT COUNT(*)::INTEGER AS total FROM heritage_categories"),
      pool.query(`SELECT
        (SELECT COUNT(*) FROM heritage_media m WHERE m.media_type='image' AND m.verification_status='verified' AND m.is_illustrative=FALSE)::INTEGER AS verified,
        (SELECT COUNT(*) FROM heritage h WHERE h.publication_status='published' AND NOT EXISTS (
          SELECT 1 FROM heritage_media m WHERE m.heritage_id=h.id AND m.media_type='image' AND m.verification_status='verified' AND m.is_illustrative=FALSE
        ))::INTEGER AS missing,
        (SELECT COUNT(DISTINCT h.id) FROM heritage h
          LEFT JOIN heritage_image_acquisition a ON a.heritage_id=h.id
          WHERE a.status IN ('needs_review','failed') OR EXISTS (
            SELECT 1 FROM heritage_media m WHERE m.heritage_id=h.id AND m.media_type='image' AND m.verification_status='unverified' AND m.is_illustrative=FALSE
          ))::INTEGER AS needs_review,
        (SELECT COUNT(*) FROM heritage_image_acquisition WHERE status='failed' AND error_code='provider_network_error')::INTEGER AS provider_network_errors`),
    ]);
    return res.json({ success: true, dashboard: { heritage: heritage.rows[0], users: users.rows[0].total, reviews: reviews.rows[0].total, categories: categories.rows[0].total, images: images.rows[0] } });
  } catch (error) {
    console.error("Admin dashboard failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load admin dashboard" });
  }
});

function readAdminPagination(query) {
  const read = (key, fallback, maximum) => {
    const raw = query[key];
    if (raw === undefined) return { value: fallback, valid: true };
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) return { value: null, valid: false };
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > maximum) return { value: null, valid: false };
    return { value, valid: true };
  };
  const limit = read("limit", 25, 100);
  const offset = read("offset", 0, 1_000_000);
  if (!limit.valid || limit.value < 1 || !offset.valid) return null;
  return { limit: limit.value, offset: offset.value };
}

router.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const pagination = readAdminPagination(req.query);
  if (!pagination) return res.status(400).json({ success: false, message: "Pagination must use a limit from 1 to 100 and an offset from 0 to 1000000" });
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const role = typeof req.query.role === "string" ? req.query.role : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (role && !["user", "admin"].includes(role)) return res.status(400).json({ success: false, message: "Role filter must be user or admin" });
  if (status && !["ACTIVE", "SUSPENDED"].includes(status)) return res.status(400).json({ success: false, message: "Status filter must be ACTIVE or SUSPENDED" });

  const filters = [];
  const values = [];
  if (q) {
    values.push(`%${q}%`);
    filters.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }
  if (role) { values.push(role); filters.push(`role = $${values.length}`); }
  if (status) { values.push(status); filters.push(`status = $${values.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, status, created_at FROM users ${where}
       ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    );
    const count = await pool.query(`SELECT COUNT(*)::INTEGER AS total FROM users ${where}`, values);
    return res.json({
      success: true,
      users: result.rows,
      pagination: { total: count.rows[0].total, ...pagination },
    });
  } catch (error) {
    console.error("Admin user list failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

router.get("/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  const userId = readPositiveId(req.params.userId);
  if (userId === null) return res.status(400).json({ success: false, message: "User ID must be a positive integer" });
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
              (SELECT COUNT(*)::INTEGER FROM favorites f WHERE f.user_id=u.id) AS favorites_count,
              (SELECT COUNT(*)::INTEGER FROM visited_places v WHERE v.user_id=u.id) AS visits_count,
              (SELECT COUNT(*)::INTEGER FROM reviews r WHERE r.user_id=u.id) AS reviews_count,
              (SELECT COUNT(*)::INTEGER FROM journeys j WHERE j.user_id=u.id) AS journeys_count
         FROM users u WHERE u.id=$1`,
      [userId],
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "User was not found" });
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Admin user lookup failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load user details" });
  }
});

async function updateAdminUser(req, res, field, value) {
  const userId = readPositiveId(req.params.userId);
  if (userId === null) return res.status(400).json({ success: false, message: "User ID must be a positive integer" });

  let client;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    // Serialize admin membership changes so concurrent requests cannot remove the last active admin.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [1246350413, 1]);
    const targetResult = await client.query(
      "SELECT id, name, email, role, status, created_at FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ success: false, message: "User was not found" });
    }

    const currentRole = String(target.role).toLowerCase();
    const currentStatus = String(target.status).toUpperCase();
    if ((field === "role" && currentRole === value) || (field === "status" && currentStatus === value)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({ success: false, message: `User already has ${field} ${value}` });
    }
    if (field === "role" && value === "admin" && currentStatus !== "ACTIVE") {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({ success: false, message: "Reactivate the account before promoting it" });
    }
    if (Number(target.id) === req.user.id && ((field === "role" && value === "user") || (field === "status" && value === "SUSPENDED"))) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({ success: false, message: "Administrators cannot demote or suspend their own account" });
    }

    const removesActiveAdmin = currentRole === "admin" && currentStatus === "ACTIVE" &&
      ((field === "role" && value === "user") || (field === "status" && value === "SUSPENDED"));
    if (removesActiveAdmin) {
      const admins = await client.query("SELECT COUNT(*)::INTEGER AS total FROM users WHERE role='admin' AND status='ACTIVE'");
      if (admins.rows[0].total <= 1) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return res.status(409).json({ success: false, message: "The last active administrator cannot be demoted or suspended" });
      }
    }

    const column = field === "role" ? "role" : "status";
    const result = await client.query(
      `UPDATE users SET ${column}=$1 WHERE id=$2 RETURNING id, name, email, role, status, created_at`,
      [value, userId],
    );
    const action = field === "role" ? `role changed from ${currentRole} to ${value}` : `account status changed from ${currentStatus} to ${value}`;
    await client.query(
      "INSERT INTO activity_logs (title, entity_type, entity_id, user_id) VALUES ($1, 'user', $2, $3)",
      [`User ${userId} ${action}`, userId, req.user.id],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return res.json({ success: true, message: `User ${field} updated`, user: result.rows[0] });
  } catch (error) {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure response. */ }
    }
    console.error("Admin user update failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to update user" });
  } finally {
    client?.release();
  }
}

router.patch("/admin/users/:userId/role", authenticate, requireAdmin, (req, res) => {
  const role = req.body?.role;
  if (typeof role !== "string" || !["user", "admin"].includes(role)) {
    return res.status(400).json({ success: false, message: "Role must be user or admin" });
  }
  return updateAdminUser(req, res, "role", role);
});

router.patch("/admin/users/:userId/status", authenticate, requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (typeof status !== "string" || !["ACTIVE", "SUSPENDED"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be ACTIVE or SUSPENDED" });
  }
  return updateAdminUser(req, res, "status", status);
});

router.get("/admin/heritage", authenticate, requireAdmin, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim().slice(0, 120) : "";
  const categoryId = req.query.category ? readPositiveId(req.query.category) : null;
  const status = typeof req.query.status === "string" && ["published", "draft", "archived"].includes(req.query.status) ? req.query.status : "";
  if (req.query.category && categoryId === null) return res.status(400).json({ success: false, message: "Category must be a positive integer" });
  const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit ?? "25"), 10) || 25, 100));
  const offset = Math.max(0, Math.min(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 1_000_000));
  const filters = [];
  const values = [];
  if (q) { values.push(`%${q}%`); filters.push(`(h.name ILIKE $${values.length} OR h.slug ILIKE $${values.length} OR COALESCE(h.locality,'') ILIKE $${values.length})`); }
  if (state) { values.push(state); filters.push(`h.state = $${values.length}`); }
  if (categoryId !== null) { values.push(categoryId); filters.push(`h.category_id = $${values.length}`); }
  if (status) { values.push(status); filters.push(`h.publication_status = $${values.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const queryValues = [...values, limit, offset];
    const result = await pool.query(`SELECT h.id, h.name, h.slug, h.state, h.district, h.locality, h.address, h.historical_period, h.publication_status, h.updated_at,
                                            jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
                                            image.media AS image,
                                            CASE WHEN image.media->>'verification_status'='verified' THEN 'verified'
                                                 WHEN acquisition.status IS NOT NULL THEN acquisition.status
                                                 WHEN image.media->>'verification_status'='unverified' THEN 'unverified'
                                                 ELSE 'missing' END AS image_status
                                     FROM heritage h JOIN heritage_categories c ON c.id = h.category_id
                                     LEFT JOIN LATERAL (
                                       SELECT jsonb_build_object('id',m.id,'url',m.url,'thumbnail_url',m.thumbnail_url,'alt_text',m.alt_text,'verification_status',m.verification_status,'creator',m.creator,'credit',m.credit,'license',m.license,'license_url',m.license_url,'source_url',m.source_url,'provider',m.provider,'is_illustrative',m.is_illustrative) AS media
                                         FROM heritage_media m WHERE m.heritage_id=h.id AND m.media_type='image' AND m.is_illustrative=FALSE
                                        ORDER BY (m.verification_status='verified') DESC, m.display_order, m.id LIMIT 1
                                     ) image ON TRUE
                                     LEFT JOIN heritage_image_acquisition acquisition ON acquisition.heritage_id=h.id
                                     ${where}
                                     ORDER BY h.updated_at DESC, h.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, queryValues);
    const count = await pool.query(`SELECT COUNT(*)::INTEGER AS total FROM heritage h ${where}`, values);
    const states = await pool.query("SELECT DISTINCT state FROM heritage WHERE NULLIF(BTRIM(state),'') IS NOT NULL ORDER BY state");
    return res.json({ success: true, heritage: result.rows, pagination: { total: count.rows[0].total, limit, offset }, states: states.rows.map((row) => row.state) });
  } catch (error) {
    console.error("Admin heritage list failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load heritage entries" });
  }
});

router.get("/admin/images", authenticate, requireAdmin, async (req, res) => {
  const view = typeof req.query.view === "string" ? req.query.view : "verified";
  if (!["verified", "missing", "review"].includes(view)) return res.status(400).json({ success: false, message: "Image view must be verified, missing, or review" });
  const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit ?? "24"), 10) || 24, 100));
  const offset = Math.max(0, Math.min(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 1_000_000));
  const condition = view === "verified"
    ? "m.media_type='image' AND m.verification_status='verified' AND m.is_illustrative=FALSE"
    : view === "missing"
      ? "h.publication_status='published' AND NOT EXISTS (SELECT 1 FROM heritage_media verified WHERE verified.heritage_id=h.id AND verified.media_type='image' AND verified.verification_status='verified' AND verified.is_illustrative=FALSE)"
      : "(a.status IN ('needs_review','failed') OR EXISTS (SELECT 1 FROM heritage_media pending WHERE pending.heritage_id=h.id AND pending.media_type='image' AND pending.verification_status='unverified' AND pending.is_illustrative=FALSE))";
  try {
    const result = view === "verified"
      ? await pool.query(`SELECT h.id AS heritage_id,h.name,h.slug,h.state,h.district,
          m.id AS media_id,m.url,m.thumbnail_url,m.alt_text,m.caption,m.credit,m.creator,m.license,m.license_url,m.source_url,m.provider,m.verification_status,m.match_confidence
        FROM heritage_media m JOIN heritage h ON h.id=m.heritage_id
        WHERE ${condition} ORDER BY h.name,m.display_order,m.id LIMIT $1 OFFSET $2`, [limit, offset])
      : await pool.query(`SELECT h.id AS heritage_id,h.name,h.slug,h.state,h.district,h.publication_status,
          a.status AS acquisition_status,a.error_code,a.error_message,a.last_checked_at,a.retry_count,a.candidates,
          COALESCE(pending.images,'[]'::jsonb) AS unverified_images
        FROM heritage h LEFT JOIN heritage_image_acquisition a ON a.heritage_id=h.id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id',m.id,'url',m.url,'thumbnail_url',m.thumbnail_url,'alt_text',m.alt_text,'caption',m.caption,'credit',m.credit,'creator',m.creator,'license',m.license,'license_url',m.license_url,'source_url',m.source_url,'provider',m.provider,'verification_status',m.verification_status)) AS images
          FROM heritage_media m WHERE m.heritage_id=h.id AND m.media_type='image' AND m.verification_status='unverified' AND m.is_illustrative=FALSE
        ) pending ON TRUE
        WHERE ${condition}
        ORDER BY CASE a.status WHEN 'needs_review' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END,h.name,h.id LIMIT $1 OFFSET $2`, [limit, offset]);
    const countResult = await pool.query(view === "verified"
      ? `SELECT COUNT(*)::INTEGER AS total FROM heritage_media m JOIN heritage h ON h.id=m.heritage_id WHERE ${condition}`
      : `SELECT COUNT(*)::INTEGER AS total FROM heritage h LEFT JOIN heritage_image_acquisition a ON a.heritage_id=h.id WHERE ${condition}`);
    return res.json({ success: true, view, images: result.rows, pagination: { total: countResult.rows[0].total, limit, offset } });
  } catch (error) {
    console.error("Admin image library failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load image library" });
  }
});

router.get("/admin/heritage/:heritageId", authenticate, requireAdmin, async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  if (heritageId === null) return res.status(400).json({ success: false, message: "Heritage ID must be a positive integer" });
  try {
    const result = await pool.query(`SELECT h.*,
        coordinate_source.source_title AS coordinate_source_title,
        coordinate_source.publisher AS coordinate_source_publisher,
        coordinate_source.source_url AS coordinate_source_url,
        coordinate_source.confidence AS coordinate_source_confidence,
        coordinate_source.review_status AS coordinate_review_status
      FROM heritage h
      LEFT JOIN LATERAL (
        SELECT source_title, publisher, source_url, confidence, review_status
          FROM heritage_sources
         WHERE heritage_id = h.id AND 'coordinates' = ANY(claims_supported)
           AND review_status = 'approved'
         ORDER BY accessed_on DESC NULLS LAST, id DESC
         LIMIT 1
      ) coordinate_source ON TRUE
      WHERE h.id = $1`, [heritageId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Heritage entry was not found" });
    return res.json({ success: true, heritage: result.rows[0] });
  } catch (error) {
    console.error("Admin heritage lookup failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load heritage entry" });
  }
});

function categoryInput(body) {
  const name = readText(body?.name, { required: true, maximum: 100 });
  const slug = readText(body?.slug, { required: true, maximum: 100 });
  if (!name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return { name, slug };
}

function coordinateSourceInput(body) {
  const sourceTitle = readText(body?.coordinate_source_title, { required: true, maximum: 300 });
  const publisher = readText(body?.coordinate_source_publisher, { required: true, maximum: 200 });
  const sourceUrl = readText(body?.coordinate_source_url, { required: true, maximum: 2000 });
  const confidence = readCoordinate(body?.coordinate_source_confidence, { minimum: 0.95, maximum: 1 });
  if (!sourceTitle || !publisher || !sourceUrl || !confidence.valid || confidence.value === null) return null;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return { sourceTitle, publisher, sourceUrl: parsed.href, confidence: confidence.value };
  } catch {
    return null;
  }
}

function readHttpsUrl(value, { required = false, maximum = 2000 } = {}) {
  const text = readText(value, { required, maximum });
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function heritageImageInput(value) {
  if (value === undefined || value === null) return { valid: true, image: null };
  if (typeof value !== "object" || Array.isArray(value)) return { valid: false, image: null };
  const hasImageFields = Object.values(value).some((field) => field !== undefined && field !== null && !(typeof field === "string" && field.trim() === ""));
  if (!hasImageFields) return { valid: true, image: null };

  const url = readHttpsUrl(value.url, { required: true });
  const sourceUrl = readHttpsUrl(value.source_url, { required: true });
  const licenseUrl = readHttpsUrl(value.license_url, { required: true });
  const thumbnailText = readText(value.thumbnail_url, { maximum: 2000 });
  const thumbnailUrl = thumbnailText ? readHttpsUrl(thumbnailText, { required: true }) : null;
  const caption = readText(value.caption, { maximum: 1000 });
  const altText = readText(value.alt_text, { required: true, maximum: 500 });
  const creator = readText(value.creator, { required: true, maximum: 300 });
  const credit = readText(value.credit, { maximum: 500 });
  const license = readText(value.license, { required: true, maximum: 200 });
  const documentedDate = readText(value.documented_date, { maximum: 10 });
  const dateIsValid = !documentedDate || (
    /^\d{4}-\d{2}-\d{2}$/.test(documentedDate) &&
    Number.isFinite(new Date(`${documentedDate}T00:00:00.000Z`).getTime()) &&
    new Date(`${documentedDate}T00:00:00.000Z`).toISOString().slice(0, 10) === documentedDate
  );
  if (!url || !sourceUrl || !licenseUrl || (thumbnailText && !thumbnailUrl) || caption === null || credit === null || documentedDate === null || !altText || !creator || !license || !dateIsValid) {
    return { valid: false, image: null };
  }
  return {
    valid: true,
    image: {
      url,
      sourceUrl,
      licenseUrl,
      thumbnailUrl,
      caption: caption || null,
      altText,
      creator,
      credit: credit || creator,
      license,
      documentedDate: documentedDate || null,
    },
  };
}

async function attachHeritageImage(client, heritageId, image) {
  const result = await client.query(`INSERT INTO heritage_media
      (heritage_id, media_type, url, caption, alt_text, credit, license, source_url,
       creator, documented_date, license_url, media_role, verification_status,
       is_illustrative, source_accessed_on, thumbnail_url, provider, display_order)
    VALUES ($1, 'image', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gallery',
       'unverified', FALSE, CURRENT_DATE, $11, 'manual', 0)
    ON CONFLICT (heritage_id, url) DO NOTHING
    RETURNING id, heritage_id, media_type, url, thumbnail_url, caption, alt_text,
      credit, creator, license, license_url, source_url, documented_date, media_role,
      verification_status, is_illustrative, provider, display_order`, [
    heritageId, image.url, image.caption, image.altText, image.credit, image.license,
    image.sourceUrl, image.creator, image.documentedDate, image.licenseUrl,
    image.thumbnailUrl,
  ]);
  return result.rows[0] ?? null;
}

async function replaceCoordinateCitation(client, heritageId, source, reviewerId) {
  await client.query(`UPDATE heritage_sources
                         SET claims_supported = array_remove(claims_supported, 'coordinates')
                       WHERE heritage_id = $1
                         AND 'coordinates' = ANY(claims_supported)`, [heritageId]);
  if (!source) return;
  const note = "This source was supplied during administrator review as support for the stored coordinate pair.";
  await client.query(`INSERT INTO heritage_sources
      (heritage_id, source_name, source_title, publisher, source_url, source_note, accessed_on,
       claims_supported, confidence, review_status, reviewed_by, reviewed_on)
    VALUES ($1,$2,$3,$2,$4,$5,CURRENT_DATE,ARRAY['coordinates']::TEXT[],$6,'approved',$7,CURRENT_DATE)
    ON CONFLICT (heritage_id, source_url) DO UPDATE
      SET source_name = EXCLUDED.source_name,
          source_title = EXCLUDED.source_title,
          publisher = EXCLUDED.publisher,
          source_note = CASE
            WHEN POSITION('supports the stored coordinate pair' IN COALESCE(heritage_sources.source_note, '')) > 0
              THEN heritage_sources.source_note
            ELSE CONCAT_WS(' ', heritage_sources.source_note, EXCLUDED.source_note)
          END,
          accessed_on = CURRENT_DATE,
          confidence = EXCLUDED.confidence,
          review_status = 'approved',
          reviewed_by = EXCLUDED.reviewed_by,
          reviewed_on = CURRENT_DATE,
          claims_supported = ARRAY(
            SELECT DISTINCT claims.claim
              FROM UNNEST(heritage_sources.claims_supported || EXCLUDED.claims_supported) AS claims(claim)
             ORDER BY claims.claim
          )`, [heritageId, source.publisher, source.sourceTitle, source.sourceUrl, note, source.confidence, `Administrator user ${reviewerId}`]);
}

router.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  const input = categoryInput(req.body);
  if (!input) return res.status(400).json({ success: false, message: "Provide a category name and a lowercase hyphenated slug" });
  try {
    const result = await pool.query("INSERT INTO heritage_categories (name, slug) VALUES ($1, $2) RETURNING id, name, slug", [input.name, input.slug]);
    return res.status(201).json({ success: true, message: "Category created", category: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "A category with that slug already exists" });
    console.error("Admin category creation failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to create category" });
  }
});

router.patch("/admin/categories/:categoryId", authenticate, requireAdmin, async (req, res) => {
  const categoryId = readPositiveId(req.params.categoryId);
  const input = categoryInput(req.body);
  if (categoryId === null || !input) return res.status(400).json({ success: false, message: "Provide a valid category ID, name, and slug" });
  try {
    const result = await pool.query("UPDATE heritage_categories SET name=$1, slug=$2 WHERE id=$3 RETURNING id, name, slug", [input.name, input.slug, categoryId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Category was not found" });
    return res.json({ success: true, message: "Category updated", category: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "A category with that slug already exists" });
    console.error("Admin category update failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to update category" });
  }
});

router.delete("/admin/categories/:categoryId", authenticate, requireAdmin, async (req, res) => {
  const categoryId = readPositiveId(req.params.categoryId);
  if (categoryId === null) return res.status(400).json({ success: false, message: "Category ID must be a positive integer" });
  try {
    const result = await pool.query(`DELETE FROM heritage_categories c
      WHERE c.id=$1 AND NOT EXISTS (SELECT 1 FROM heritage h WHERE h.category_id=c.id)
      RETURNING c.id`, [categoryId]);
    if (result.rows.length) return res.json({ success: true, message: "Unused category deleted" });
    const category = await pool.query("SELECT id FROM heritage_categories WHERE id=$1", [categoryId]);
    if (!category.rows.length) return res.status(404).json({ success: false, message: "Category was not found" });
    return res.status(409).json({ success: false, message: "Reassign heritage records before deleting this category" });
  } catch (error) {
    if (error.code === "23503") return res.status(409).json({ success: false, message: "Reassign heritage records before deleting this category" });
    console.error("Admin category deletion failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to delete category" });
  }
});

function heritageInput(body) {
  const fields = ["name", "slug", "description", "history", "cultural_significance", "architecture", "historical_period", "state"];
  const input = {};
  for (const field of fields) { const value = readText(body?.[field], { required: true, maximum: 10000 }); if (!value) return null; input[field] = value; }
  const categoryId = readPositiveId(body?.category_id);
  const district = readText(body?.district, { maximum: 160 });
  const locality = readText(body?.locality, { maximum: 200 });
  const address = readText(body?.address, { maximum: 300 });
  const latitude = readCoordinate(body?.latitude, { minimum: -90, maximum: 90 });
  const longitude = readCoordinate(body?.longitude, { minimum: -180, maximum: 180 });
  const hasLatitude = Object.prototype.hasOwnProperty.call(body ?? {}, "latitude");
  const hasLongitude = Object.prototype.hasOwnProperty.call(body ?? {}, "longitude");
  const coordinatesProvided = hasLatitude && hasLongitude;
  const hasCoordinatePair = latitude.value !== null && longitude.value !== null;
  const coordinateSource = hasCoordinatePair ? coordinateSourceInput(body) : null;
  const coordinateSourceProvided = ["coordinate_source_title", "coordinate_source_publisher", "coordinate_source_url", "coordinate_source_confidence"]
    .some((key) => typeof body?.[key] === "string" && body[key].trim() !== "");
  const status = body?.publication_status ?? "draft";
  const image = heritageImageInput(body?.image);
  if (
    categoryId === null ||
    district === null ||
    locality === null ||
    address === null ||
    hasLatitude !== hasLongitude ||
    !latitude.valid ||
    !longitude.valid ||
    (latitude.value === null) !== (longitude.value === null) ||
    (coordinateSourceProvided && !coordinateSource) ||
    !image.valid ||
    !["draft", "published", "archived"].includes(status)
  ) return null;
  return { ...input, category_id: categoryId, district: district || null, locality: locality || null, address: address || null, latitude: latitude.value, longitude: longitude.value, coordinatesProvided, coordinateSource, coordinateSourceProvided, hasCoordinatePair, image: image.image, publication_status: status };
}

router.post("/admin/heritage", authenticate, requireAdmin, async (req, res) => {
  const input = heritageInput(req.body);
  if (!input) return res.status(400).json({ success: false, message: "Check the required place fields, image provenance details, and coordinate values" });
  if (input.hasCoordinatePair && !input.coordinateSource) return res.status(400).json({ success: false, message: "Adding coordinates requires an HTTPS source and review confidence of at least 0.95" });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(`INSERT INTO heritage (name, slug, description, history, cultural_significance, architecture, historical_period, category_id, state, district, locality, address, latitude, longitude, publication_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [input.name, input.slug, input.description, input.history, input.cultural_significance, input.architecture, input.historical_period, input.category_id, input.state, input.district, input.locality, input.address, input.latitude, input.longitude, input.publication_status]);
    if (input.latitude !== null) await replaceCoordinateCitation(client, result.rows[0].id, input.coordinateSource, req.user.id);
    const image = input.image ? await attachHeritageImage(client, result.rows[0].id, input.image) : null;
    await client.query("COMMIT");
    return res.status(201).json({ success: true, message: "Heritage entry created", heritage: { ...result.rows[0], media: image ? [image] : [] } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ success: false, message: "A heritage entry with that slug already exists" });
    if (error.code === "23503") return res.status(400).json({ success: false, message: "Category was not found" });
    console.error("Admin heritage creation failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to create heritage entry" });
  } finally {
    client?.release();
  }
});

router.patch("/admin/heritage/:heritageId", authenticate, requireAdmin, async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  const input = heritageInput(req.body);
  if (heritageId === null || !input) return res.status(400).json({ success: false, message: "Provide a valid heritage ID, required place fields, image provenance details, and coordinate values" });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const previous = await client.query("SELECT latitude, longitude FROM heritage WHERE id=$1 FOR UPDATE", [heritageId]);
    if (!previous.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Heritage entry was not found" });
    }
    const previousLatitude = previous.rows[0].latitude === null ? null : Number(previous.rows[0].latitude);
    const previousLongitude = previous.rows[0].longitude === null ? null : Number(previous.rows[0].longitude);
    const coordinatesChanged = input.coordinatesProvided && (previousLatitude !== input.latitude || previousLongitude !== input.longitude);
    if (input.hasCoordinatePair && coordinatesChanged && !input.coordinateSource) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Changing coordinates requires a reviewed HTTPS source and confidence of at least 0.95" });
    }
    if (input.coordinateSourceProvided && !input.coordinateSource) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Provide all coordinate source fields and confidence of at least 0.95" });
    }
    const result = await client.query(`UPDATE heritage SET name=$1, slug=$2, description=$3, history=$4, cultural_significance=$5, architecture=$6, historical_period=$7, category_id=$8, state=$9, district=$10, locality=$11, address=$12, latitude=CASE WHEN $13 THEN $14 ELSE latitude END, longitude=CASE WHEN $13 THEN $15 ELSE longitude END, publication_status=$16
      WHERE id=$17 RETURNING *`, [input.name, input.slug, input.description, input.history, input.cultural_significance, input.architecture, input.historical_period, input.category_id, input.state, input.district, input.locality, input.address, input.coordinatesProvided, input.latitude, input.longitude, input.publication_status, heritageId]);
    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Heritage entry was not found" });
    }
    if (coordinatesChanged || input.coordinateSource) {
      await replaceCoordinateCitation(client, heritageId, input.latitude === null ? null : input.coordinateSource, req.user.id);
    }
    const image = input.image ? await attachHeritageImage(client, heritageId, input.image) : null;
    await client.query("COMMIT");
    return res.json({ success: true, message: "Heritage entry updated", heritage: { ...result.rows[0], media: image ? [image] : [] } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ success: false, message: "A heritage entry with that slug already exists" });
    console.error("Admin heritage update failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to update heritage entry" });
  } finally {
    client?.release();
  }
});

router.delete("/admin/heritage/:heritageId", authenticate, requireAdmin, async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  if (heritageId === null) return res.status(400).json({ success: false, message: "Heritage ID must be a positive integer" });
  try {
    const result = await pool.query("UPDATE heritage SET publication_status='archived', updated_at=NOW() WHERE id=$1 RETURNING id, publication_status", [heritageId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Heritage entry was not found" });
    return res.json({ success: true, message: "Heritage entry archived", heritage: result.rows[0] });
  } catch (error) {
    console.error("Admin heritage archive failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to archive heritage entry" });
  }
});

module.exports = router;
