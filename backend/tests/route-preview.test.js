"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createRoutePreviewRouter } = require("../modules/route-preview");
const { RoutingError } = require("../integrations/routing");

const validRoute = {
  provider: "OSRM",
  mode: "driving",
  distance_meters: 1_734,
  duration_seconds: 600,
  duration_kind: "estimated",
  live_traffic: false,
  geometry: { type: "LineString", coordinates: [[77.2, 28.6], [77.3, 28.7]] },
  legs: [{ distance_meters: 1_734, duration_seconds: 600, steps: [{ instruction: "Head north", distance_meters: 1_734, duration_seconds: 600 }] }],
};

const verifiedDestination = { latitude: "27.2", longitude: "78", coordinates_verified: true };

async function withServer(t, calculateRoute, destinationRecord = verifiedDestination, upstreamLimiter = { check: () => 0 }) {
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutePreviewRouter({
    calculateRoute,
    pool: { query: async (_query, values) => ({ rows: destinationRecord && values[0] === 24 ? [destinationRecord] : [] }) },
    perSecondLimiter: { check: () => 0 },
    perMinuteLimiter: { check: () => 0 },
    upstreamLimiter,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}/api/routes`;
}

test("route preview validates both endpoints and returns the provider route", async (t) => {
  let receivedCoordinates;
  const url = await withServer(t, async (coordinates) => {
    receivedCoordinates = coordinates;
    return { configured: true, route: validRoute };
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: { latitude: 28.6, longitude: 77.2 }, heritage_id: 24 }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(receivedCoordinates, [
    { latitude: 28.6, longitude: 77.2 },
    { latitude: 27.2, longitude: 78 },
  ]);
  assert.deepEqual(payload.route, validRoute);
  assert.deepEqual(payload.destination, { latitude: 27.2, longitude: 78 });
});

test("route preview recalculates with a newly selected origin", async (t) => {
  const origins = [];
  const url = await withServer(t, async (coordinates) => {
    origins.push(coordinates[0]);
    return { configured: true, route: { ...validRoute, distance_meters: origins.length * 1_000 } };
  });
  for (const origin of [{ latitude: 28.6, longitude: 77.2 }, { latitude: 19.07, longitude: 72.87 }]) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin, heritage_id: 24 }) });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(origins, [{ latitude: 28.6, longitude: 77.2 }, { latitude: 19.07, longitude: 72.87 }]);
});

test("route preview rejects missing or out-of-range coordinates", async (t) => {
  let providerCalls = 0;
  const url = await withServer(t, async () => { providerCalls += 1; return { configured: true, route: validRoute }; });
  for (const body of [
    { origin: { latitude: 28.6, longitude: 77.2 } },
    { origin: { latitude: 91, longitude: 77.2 }, heritage_id: 24 },
    { origin: { latitude: 28.6, longitude: 77.2 }, heritage_id: "24x" },
  ]) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, "ROUTE_INPUT_INVALID");
  }
  assert.equal(providerCalls, 0);
});

test("route preview reports absent destination records and coordinates", async (t) => {
  const request = (url) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: { latitude: 28.6, longitude: 77.2 }, heritage_id: 24 }),
  });
  const missingUrl = await withServer(t, async () => ({ configured: true, route: validRoute }), null);
  const missing = await request(missingUrl);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "ROUTE_DESTINATION_NOT_FOUND");

  const noCoordinatesUrl = await withServer(t, async () => ({ configured: true, route: validRoute }), { latitude: null, longitude: null, coordinates_verified: false });
  const noCoordinates = await request(noCoordinatesUrl);
  assert.equal(noCoordinates.status, 422);
  assert.equal((await noCoordinates.json()).code, "ROUTE_DESTINATION_COORDINATES_MISSING");

  const unverifiedUrl = await withServer(t, async () => ({ configured: true, route: validRoute }), { latitude: "27.2", longitude: "78", coordinates_verified: false });
  const unverified = await request(unverifiedUrl);
  assert.equal(unverified.status, 422);
  assert.equal((await unverified.json()).code, "ROUTE_DESTINATION_COORDINATES_UNVERIFIED");
});

test("route preview reports missing provider configuration and provider errors", async (t) => {
  const unavailableUrl = await withServer(t, async () => ({ configured: false }));
  const request = (url) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: { latitude: 28.6, longitude: 77.2 }, heritage_id: 24 }),
  });
  const unavailable = await request(unavailableUrl);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "ROUTING_PROVIDER_NOT_CONFIGURED");

  const failedUrl = await withServer(t, async () => { throw new RoutingError("ROUTE_NOT_FOUND", 422, "The provider could not calculate a route."); });
  const failed = await request(failedUrl);
  assert.equal(failed.status, 422);
  assert.equal((await failed.json()).code, "ROUTE_NOT_FOUND");
});

test("route preview rejects unsupported travel modes", async (t) => {
  let providerCalls = 0;
  const url = await withServer(t, async () => { providerCalls += 1; return { configured: true, route: validRoute }; });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "walking", origin: { latitude: 28.6, longitude: 77.2 }, heritage_id: 24 }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "ROUTE_MODE_UNSUPPORTED");
  assert.equal(providerCalls, 0);
});

test("route preview paces calls to the upstream provider", async (t) => {
  let providerCalls = 0;
  let checks = 0;
  const url = await withServer(t, async () => { providerCalls += 1; return { configured: true, route: validRoute }; }, verifiedDestination, { check: () => (++checks === 1 ? 0 : 1) });
  const request = () => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: { latitude: 28.6, longitude: 77.2 }, heritage_id: 24 }),
  });
  assert.equal((await request()).status, 200);
  const limited = await request();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  assert.equal((await limited.json()).code, "ROUTE_PROVIDER_RATE_LIMITED");
  assert.equal(providerCalls, 1);
});
