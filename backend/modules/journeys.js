const express = require("express");
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");
const { readPositiveId, readText } = require("../middleware/validation");
const { calculateDrivingRoute, RoutingError } = require("../integrations/routing");

const router = express.Router();

function journeyInput(body) {
  const name = readText(body?.name, { required: true, maximum: 120 });
  const description = readText(body?.description, { maximum: 2000 });
  return name ? { name, description: description || null } : null;
}

router.get("/journeys", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, description, created_at, updated_at FROM journeys WHERE user_id = $1 ORDER BY updated_at DESC, id DESC", [req.user.id]);
    return res.json({ success: true, journeys: result.rows });
  } catch (error) {
    console.error("Journey list failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load journeys" });
  }
});

router.post("/journeys", authenticate, async (req, res) => {
  const input = journeyInput(req.body);
  if (!input) return res.status(400).json({ success: false, message: "Journey name is required and must be at most 120 characters" });
  try {
    const result = await pool.query("INSERT INTO journeys (user_id, name, description) VALUES ($1, $2, $3) RETURNING id, name, description, created_at, updated_at", [req.user.id, input.name, input.description]);
    return res.status(201).json({ success: true, message: "Journey created", journey: result.rows[0] });
  } catch (error) {
    console.error("Journey creation failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to create journey" });
  }
});

router.get("/journeys/:journeyId", authenticate, async (req, res) => {
  const journeyId = readPositiveId(req.params.journeyId);
  if (journeyId === null) return res.status(400).json({ success: false, message: "Journey ID must be a positive integer" });
  try {
    const journey = await pool.query("SELECT id, name, description, created_at, updated_at FROM journeys WHERE id = $1 AND user_id = $2", [journeyId, req.user.id]);
    if (!journey.rows.length) return res.status(404).json({ success: false, message: "Journey was not found" });
    const stops = await pool.query(`SELECT s.id, s.heritage_id, s.stop_order, s.notes, s.created_at, h.name, h.slug, h.state, h.district, h.locality, h.latitude, h.longitude
                                    FROM journey_stops s JOIN heritage h ON h.id = s.heritage_id
                                    WHERE s.journey_id = $1 ORDER BY s.stop_order ASC`, [journeyId]);
    return res.json({ success: true, journey: { ...journey.rows[0], stops: stops.rows } });
  } catch (error) {
    console.error("Journey lookup failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load journey" });
  }
});

router.get("/journeys/:journeyId/route", authenticate, async (req, res) => {
  const journeyId = readPositiveId(req.params.journeyId);
  if (journeyId === null) return res.status(400).json({ success: false, message: "Journey ID must be a positive integer" });
  if (req.query.mode !== undefined && req.query.mode !== "driving") {
    return res.status(400).json({ success: false, message: "The configured route adapter currently supports driving mode only" });
  }
  try {
    const journey = await pool.query("SELECT id FROM journeys WHERE id=$1 AND user_id=$2", [journeyId, req.user.id]);
    if (!journey.rows.length) return res.status(404).json({ success: false, message: "Journey was not found" });
    const stops = await pool.query(`SELECT s.heritage_id, s.stop_order, h.name, h.state, h.district, h.locality, h.latitude, h.longitude,
      EXISTS (SELECT 1 FROM heritage_sources coordinate_source
               WHERE coordinate_source.heritage_id = h.id
                 AND 'coordinates' = ANY(coordinate_source.claims_supported)
                 AND coordinate_source.review_status = 'approved') AS coordinates_verified
      FROM journey_stops s JOIN heritage h ON h.id=s.heritage_id
      WHERE s.journey_id=$1 ORDER BY s.stop_order`, [journeyId]);
    if (stops.rows.length < 2) return res.status(422).json({ success: false, code: "ROUTE_REQUIRES_TWO_STOPS", message: "Add at least two stops before calculating a route." });
    if (stops.rows.length > 20) return res.status(422).json({ success: false, code: "ROUTE_STOP_LIMIT", message: "Route calculation supports up to 20 stops." });
    const missing = stops.rows.filter((stop) => stop.latitude === null || stop.longitude === null);
    if (missing.length) {
      return res.status(422).json({
        success: false,
        code: "ROUTE_COORDINATES_MISSING",
        message: "Verified coordinates are required for every stop before a calculated route is available.",
        missing_stops: missing.map(({ heritage_id, name }) => ({ heritage_id, name })),
      });
    }
    const unverified = stops.rows.filter((stop) => stop.coordinates_verified !== true);
    if (unverified.length) {
      return res.status(422).json({
        success: false,
        code: "ROUTE_COORDINATES_UNVERIFIED",
        message: "A source citation supporting each stop's coordinates is required before routing.",
        unverified_stops: unverified.map(({ heritage_id, name }) => ({ heritage_id, name })),
      });
    }
    const coordinates = stops.rows.map((stop) => ({ latitude: Number(stop.latitude), longitude: Number(stop.longitude) }));
    if (coordinates.some((point) => !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90 || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180)) {
      return res.status(422).json({ success: false, code: "ROUTE_COORDINATES_INVALID", message: "A stop has invalid coordinates. Correct the record before routing." });
    }
    const result = await calculateDrivingRoute(coordinates);
    if (!result.configured) return res.status(503).json({ success: false, code: "ROUTING_PROVIDER_NOT_CONFIGURED", message: "Calculated routes are unavailable until the backend routing provider is configured. Use the external directions link meanwhile." });
    return res.json({ success: true, route: result.route, stops: stops.rows.map(({ heritage_id, stop_order, name, state, district, locality, latitude, longitude }) => ({ heritage_id, stop_order, name, state, district, locality, latitude, longitude })) });
  } catch (error) {
    if (error instanceof RoutingError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    console.error("Journey route calculation failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to calculate journey route" });
  }
});

router.patch("/journeys/:journeyId", authenticate, async (req, res) => {
  const journeyId = readPositiveId(req.params.journeyId);
  const input = journeyInput(req.body);
  if (journeyId === null || !input) return res.status(400).json({ success: false, message: "Provide a valid journey ID and name" });
  try {
    const result = await pool.query("UPDATE journeys SET name = $1, description = $2 WHERE id = $3 AND user_id = $4 RETURNING id, name, description, created_at, updated_at", [input.name, input.description, journeyId, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Journey was not found" });
    return res.json({ success: true, message: "Journey updated", journey: result.rows[0] });
  } catch (error) {
    console.error("Journey update failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to update journey" });
  }
});

router.delete("/journeys/:journeyId", authenticate, async (req, res) => {
  const journeyId = readPositiveId(req.params.journeyId);
  if (journeyId === null) return res.status(400).json({ success: false, message: "Journey ID must be a positive integer" });
  try {
    const result = await pool.query("DELETE FROM journeys WHERE id = $1 AND user_id = $2 RETURNING id", [journeyId, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Journey was not found" });
    return res.json({ success: true, message: "Journey deleted" });
  } catch (error) {
    console.error("Journey deletion failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to delete journey" });
  }
});

router.post("/journeys/:journeyId/stops", authenticate, async (req, res) => {
  const journeyId = readPositiveId(req.params.journeyId);
  const heritageId = readPositiveId(req.body?.heritage_id);
  const stopOrder = readPositiveId(req.body?.stop_order);
  const notes = readText(req.body?.notes, { maximum: 2000 });
  if (journeyId === null || heritageId === null || stopOrder === null || notes === null) return res.status(400).json({ success: false, message: "Provide valid journey, heritage, stop order, and notes" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const journey = await client.query("SELECT id FROM journeys WHERE id = $1 AND user_id = $2 FOR UPDATE", [journeyId, req.user.id]);
    const heritage = await client.query("SELECT id FROM heritage WHERE id = $1 AND publication_status = 'published'", [heritageId]);
    if (!journey.rows.length || !heritage.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Journey or published heritage record was not found" }); }
    const stop = await client.query("INSERT INTO journey_stops (journey_id, heritage_id, stop_order, notes) VALUES ($1, $2, $3, $4) RETURNING id, heritage_id, stop_order, notes, created_at", [journeyId, heritageId, stopOrder, notes || null]);
    await client.query("COMMIT");
    return res.status(201).json({ success: true, message: "Journey stop added", stop: stop.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ success: false, message: "This heritage place or stop order is already in the journey" });
    console.error("Journey stop creation failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to add journey stop" });
  } finally { client.release(); }
});

router.delete("/journeys/:journeyId/stops/:stopId", authenticate, async (req, res) => {
  const journeyId = readPositiveId(req.params.journeyId); const stopId = readPositiveId(req.params.stopId);
  if (journeyId === null || stopId === null) return res.status(400).json({ success: false, message: "Journey and stop IDs must be positive integers" });
  try {
    const result = await pool.query(`DELETE FROM journey_stops s USING journeys j
                                     WHERE s.id = $1 AND s.journey_id = $2 AND j.id = s.journey_id AND j.user_id = $3 RETURNING s.id`, [stopId, journeyId, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Journey stop was not found" });
    return res.json({ success: true, message: "Journey stop removed" });
  } catch (error) {
    console.error("Journey stop deletion failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to remove journey stop" });
  }
});

module.exports = router;
