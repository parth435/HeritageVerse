"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateDrivingRoute } = require("../integrations/routing");

test("routing stays unavailable without an explicitly configured provider", async () => {
  const result = await calculateDrivingRoute([
    { latitude: 28.6, longitude: 77.2 },
    { latitude: 27.2, longitude: 78.0 },
  ], { baseUrl: "", fetchImpl: () => { throw new Error("network should not be called"); } });
  assert.deepEqual(result, { configured: false });
});

test("OSRM adapter returns provider distance, estimated time, geometry, and steps", async () => {
  let requestedUrl;
  const payload = {
    code: "Ok",
    routes: [{
      distance: 1734,
      duration: 600,
      geometry: { type: "LineString", coordinates: [[77.2, 28.6], [78.0, 27.2]] },
      legs: [{
        distance: 1734,
        duration: 600,
        steps: [{ name: "MG Road", distance: 1734, duration: 600, maneuver: { type: "turn", modifier: "left" } }],
      }],
    }],
  };
  const result = await calculateDrivingRoute([
    { latitude: 28.6, longitude: 77.2 },
    { latitude: 27.2, longitude: 78.0 },
  ], {
    baseUrl: "https://routing.example/",
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => payload };
    },
  });

  assert.equal(requestedUrl.pathname, "/route/v1/driving/77.2,28.6;78,27.2");
  assert.equal(requestedUrl.searchParams.get("geometries"), "geojson");
  assert.equal(requestedUrl.searchParams.get("steps"), "true");
  assert.equal(result.route.distance_meters, 1734);
  assert.equal(result.route.duration_kind, "estimated");
  assert.equal(result.route.live_traffic, false);
  assert.deepEqual(result.route.geometry.coordinates[1], [78, 27.2]);
  assert.equal(result.route.legs[0].steps[0].instruction, "turn left onto MG Road");
});

test("routing rejects invalid provider configuration without making a request", async () => {
  await assert.rejects(
    calculateDrivingRoute([{ latitude: 28.6, longitude: 77.2 }, { latitude: 27.2, longitude: 78 }], {
      baseUrl: "file:///tmp/provider",
      fetchImpl: () => { throw new Error("network should not be called"); },
    }),
    (error) => error.code === "ROUTING_CONFIGURATION_INVALID" && error.status === 503,
  );
  await assert.rejects(
    calculateDrivingRoute([{ latitude: 28.6, longitude: 77.2 }, { latitude: 27.2, longitude: 78 }], {
      baseUrl: "https://routing.example/path",
      fetchImpl: () => { throw new Error("network should not be called"); },
    }),
    (error) => error.code === "ROUTING_CONFIGURATION_INVALID" && error.status === 503,
  );
  await assert.rejects(
    calculateDrivingRoute([{ latitude: 28.6, longitude: 77.2 }, { latitude: 27.2, longitude: 78 }], {
      baseUrl: "http://routing.example",
      fetchImpl: () => { throw new Error("network should not be called"); },
    }),
    (error) => error.code === "ROUTING_CONFIGURATION_INVALID" && error.status === 503,
  );
});

test("routing reports provider HTTP and network failures without leaking provider details", async () => {
  const points = [{ latitude: 28.6, longitude: 77.2 }, { latitude: 27.2, longitude: 78 }];
  await assert.rejects(
    calculateDrivingRoute(points, {
      baseUrl: "https://routing.example",
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    (error) => error.code === "ROUTE_PROVIDER_UNAVAILABLE" && error.status === 502 && !error.message.includes("429"),
  );
  await assert.rejects(
    calculateDrivingRoute(points, {
      baseUrl: "https://routing.example",
      fetchImpl: async () => { throw new Error("private endpoint detail"); },
    }),
    (error) => error.code === "ROUTE_PROVIDER_UNAVAILABLE" && !error.message.includes("private endpoint detail"),
  );
});

test("routing rejects malformed provider data and routes with invalid geometry", async () => {
  const points = [{ latitude: 28.6, longitude: 77.2 }, { latitude: 27.2, longitude: 78 }];
  const options = (payload) => ({
    baseUrl: "https://routing.example",
    fetchImpl: async () => ({ ok: true, json: async () => payload }),
  });

  await assert.rejects(
    calculateDrivingRoute(points, { ...options(null), fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } }) }),
    (error) => error.code === "ROUTE_PROVIDER_INVALID_RESPONSE" && error.status === 502,
  );
  await assert.rejects(
    calculateDrivingRoute(points, options({ code: "NoRoute", routes: [] })),
    (error) => error.code === "ROUTE_NOT_FOUND" && error.status === 422,
  );
  await assert.rejects(
    calculateDrivingRoute(points, options({ code: "Ok", routes: [{ distance: 12, duration: 4, geometry: { type: "LineString", coordinates: [[200, 91], [77, 28]] } }] })),
    (error) => error.code === "ROUTE_PROVIDER_INVALID_RESPONSE" && error.status === 502,
  );
  await assert.rejects(
    calculateDrivingRoute(points, options({ code: "Ok", routes: [{ distance: 12, duration: 4, geometry: { type: "LineString", coordinates: [[77.2, 28.6], [78, 27.2]] }, legs: [] }] })),
    (error) => error.code === "ROUTE_PROVIDER_INVALID_RESPONSE" && error.status === 502,
  );
});
