"use strict";

const express = require("express");
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");
const { readPositiveId } = require("../middleware/validation");
const { createHistoricalIllustration, getReconstructionStatus, ReconstructionError } = require("../integrations/reconstruction");

const router = express.Router();
const recentGenerationRequests = new Map();
const GENERATION_WINDOW_MS = 15 * 60 * 1000;
const GENERATION_LIMIT = 3;

function reserveGenerationSlot(userId, now = Date.now()) {
  const recent = (recentGenerationRequests.get(userId) ?? []).filter((timestamp) => now - timestamp < GENERATION_WINDOW_MS);
  if (recent.length >= GENERATION_LIMIT) {
    recentGenerationRequests.set(userId, recent);
    return Math.max(1, Math.ceil((recent[0] + GENERATION_WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  recentGenerationRequests.set(userId, recent);
  return 0;
}

router.get("/reconstruction/status", (req, res) => {
  return res.json({ success: true, reconstruction: getReconstructionStatus() });
});

router.post("/heritage/:heritageId/reconstruction", authenticate, async (req, res) => {
  const heritageId = readPositiveId(req.params.heritageId);
  if (heritageId === null) return res.status(400).json({ success: false, message: "Heritage ID must be a positive integer" });
  const retryAfter = reserveGenerationSlot(req.user.id);
  if (retryAfter) {
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ success: false, code: "reconstruction_rate_limited", message: "You have reached the image-generation limit. Try again later." });
  }
  try {
    const site = await pool.query(`SELECT id, name, history, architecture, historical_period
      FROM heritage WHERE id=$1 AND publication_status='published'`, [heritageId]);
    if (!site.rows.length) return res.status(404).json({ success: false, message: "Published heritage record was not found" });
    const source = await pool.query(`SELECT url, source_url, creator, documented_date, license, license_url, media_context,
        verification_status, is_illustrative
      FROM heritage_media
      WHERE heritage_id=$1 AND media_type='image' AND media_role='historical'
        AND verification_status='verified' AND is_illustrative=FALSE
        AND source_url IS NOT NULL AND creator IS NOT NULL AND license IS NOT NULL
      ORDER BY display_order, id LIMIT 1`, [heritageId]);
    if (!source.rows.length) return res.status(422).json({ success: false, code: "verified_historical_reference_required", message: "A verified, attributed historical image is not available for this site." });
    const illustration = await createHistoricalIllustration(site.rows[0], source.rows[0]);
    return res.json({ success: true, illustration });
  } catch (error) {
    if (error instanceof ReconstructionError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    console.error("Historical illustration request failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to request an illustrative reconstruction" });
  }
});

module.exports = router;
