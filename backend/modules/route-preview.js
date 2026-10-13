"use strict";

const express = require("express");
const { createAttemptLimiter } = require("../middleware/rate-limit");
const { calculateDrivingRoute, RoutingError } = require("../integrations/routing");
const { readPositiveId } = require("../middleware/validation");
const defaultPool = require("../config/db");

function readCoordinatePair(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function createRoutePreviewRouter({ calculateRoute = calculateDrivingRoute, pool = defaultPool, perSecondLimiter, perMinuteLimiter, upstreamLimiter } = {}) {
  const router = express.Router();
  const perSecond = perSecondLimiter ?? createAttemptLimiter({ windowMs: 1_000, limit: 1, maxKeys: 10_000 });
  const perMinute = perMinuteLimiter ?? createAttemptLimiter({ windowMs: 60_000, limit: 30, maxKeys: 10_000 });
  const upstream = upstreamLimiter ?? createAttemptLimiter({ windowMs: 1_000, limit: 1, maxKeys: 1 });

  router.post("/routes", async (req, res) => {
    if (req.body?.mode !== undefined && req.body.mode !== "driving") {
      return res.status(400).json({ success: false, code: "ROUTE_MODE_UNSUPPORTED", message: "The configured route provider supports driving directions only." });
    }
    const origin = readCoordinatePair(req.body?.origin);
    const heritageId = readPositiveId(req.body?.heritage_id);
    if (!origin || heritageId === null) {
      return res.status(400).json({ success: false, code: "ROUTE_INPUT_INVALID", message: "Provide a valid starting coordinate pair and a published heritage destination ID." });
    }

    const rateKey = req.ip || req.socket?.remoteAddress || "unknown";
    const retryAfter = perSecond.check(rateKey) || perMinute.check(rateKey);
    if (retryAfter) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, code: "ROUTE_RATE_LIMITED", message: "Please wait a moment before calculating another route." });
    }

    try {
      const destinationResult = await pool.query(`SELECT h.latitude, h.longitude,
        EXISTS (SELECT 1 FROM heritage_sources coordinate_source
                 WHERE coordinate_source.heritage_id = h.id
                   AND 'coordinates' = ANY(coordinate_source.claims_supported)
                   AND coordinate_source.review_status = 'approved') AS coordinates_verified
        FROM heritage h WHERE h.id = $1 AND h.publication_status = 'published'`, [heritageId]);
      const destinationRecord = destinationResult.rows[0];
      if (!destinationRecord) {
        return res.status(404).json({ success: false, code: "ROUTE_DESTINATION_NOT_FOUND", message: "The published heritage destination was not found." });
      }
      if (destinationRecord.latitude === null || destinationRecord.longitude === null) {
        return res.status(422).json({ success: false, code: "ROUTE_DESTINATION_COORDINATES_MISSING", message: "Verified coordinates are not available for this heritage destination." });
      }
      if (destinationRecord.coordinates_verified !== true) {
        return res.status(422).json({ success: false, code: "ROUTE_DESTINATION_COORDINATES_UNVERIFIED", message: "A reviewed source citation is required before routing to this destination." });
      }
      const destination = { latitude: Number(destinationRecord.latitude), longitude: Number(destinationRecord.longitude) };
      if (!readCoordinatePair(destination)) {
        return res.status(422).json({ success: false, code: "ROUTE_DESTINATION_COORDINATES_INVALID", message: "The heritage destination has invalid coordinates." });
      }
      const upstreamRetryAfter = upstream.check("routing-provider");
      if (upstreamRetryAfter) {
        res.setHeader("Retry-After", String(upstreamRetryAfter));
        return res.status(429).json({ success: false, code: "ROUTE_PROVIDER_RATE_LIMITED", message: "Route requests are being paced to respect the routing provider's usage limits. Try again shortly." });
      }
      const result = await calculateRoute([origin, destination]);
      if (!result.configured) {
        return res.status(503).json({ success: false, code: "ROUTING_PROVIDER_NOT_CONFIGURED", message: "Route previews are unavailable until a routing provider is configured. You can open the destination in Google Maps." });
      }
      return res.json({ success: true, route: result.route, origin, destination });
    } catch (error) {
      if (error instanceof RoutingError) {
        return res.status(error.status).json({ success: false, code: error.code, message: error.message });
      }
      console.error("Route preview failed:", error?.code || "unknown error");
      return res.status(500).json({ success: false, code: "ROUTE_PREVIEW_FAILED", message: "The route could not be calculated. Try again or open Google Maps." });
    }
  });

  return router;
}

module.exports = { createRoutePreviewRouter, readCoordinatePair };
