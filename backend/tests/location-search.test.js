"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createLocationSearchRouter, parseResults } = require("../modules/location-search");

async function withServer(t, options = {}) {
  const app = express();
  app.use("/api", createLocationSearchRouter({
    minIntervalMs: 0,
    wait: async () => {},
    perMinuteLimiter: { check: () => 0 },
    upstreamLimiter: { check: () => 0 },
    ...options,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}/api/locations/search`;
}

test("manual location search validates query bounds before calling its provider", async (t) => {
  let calls = 0;
  const url = await withServer(t, { fetchImpl: async () => { calls += 1; return Response.json([]); } });
  for (const query of ["", "x", "a".repeat(121), "bad\nquery"]) {
    const response = await fetch(`${url}?q=${encodeURIComponent(query)}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "LOCATION_QUERY_INVALID");
  }
  assert.equal(calls, 0);
});

test("manual location search proxies bounded India results, validates coordinates, and labels attribution", async (t) => {
  let requestUrl;
  let requestHeaders;
  const url = await withServer(t, {
    searchUrl: "https://nominatim.openstreetmap.org/search",
    userAgent: "HeritageVerse-test/1.0 contact@example.test",
    fetchImpl: async (input, options) => {
      requestUrl = new URL(input);
      requestHeaders = options.headers;
      return Response.json([
        { lat: "18.5204", lon: "73.8567", display_name: "Pune, Maharashtra, India", osm_type: "relation", osm_id: 123, category: "place", type: "city" },
        { lat: "91", lon: "20", display_name: "Invalid latitude" },
        { lat: "19", lon: "74", display_name: "" },
      ]);
    },
  });
  const response = await fetch(`${url}?q=${encodeURIComponent("Pune, Maharashtra")}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(requestUrl.searchParams.get("q"), "Pune, Maharashtra");
  assert.equal(requestUrl.searchParams.get("format"), "jsonv2");
  assert.equal(requestUrl.searchParams.get("countrycodes"), "in");
  assert.equal(requestUrl.searchParams.get("limit"), "5");
  assert.equal(requestHeaders["User-Agent"], "HeritageVerse-test/1.0 contact@example.test");
  assert.equal(payload.results.length, 1);
  assert.deepEqual(payload.results[0], {
    label: "Pune, Maharashtra, India",
    latitude: 18.5204,
    longitude: 73.8567,
    osm_type: "relation",
    osm_id: "123",
    category: "place",
    type: "city",
  });
  assert.equal(payload.attribution, "Location search by OpenStreetMap contributors (ODbL).");
});

test("location search caches repeated queries and bounds cached entries", async (t) => {
  let calls = 0;
  const url = await withServer(t, {
    fetchImpl: async () => { calls += 1; return Response.json([{ lat: "19", lon: "73", display_name: "Nashik, India" }]); },
  });
  const first = await fetch(`${url}?q=Nashik`);
  const second = await fetch(`${url}?q=%20nashik%20`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
  assert.equal((await second.json()).results[0].label, "Nashik, India");
});

test("provider URLs must be HTTPS and parsed results never retain invalid coordinates", async (t) => {
  let calls = 0;
  const url = await withServer(t, {
    searchUrl: "http://nominatim.example.test/search",
    fetchImpl: async () => { calls += 1; return Response.json([]); },
  });
  const response = await fetch(`${url}?q=Pune`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "LOCATION_SEARCH_UNAVAILABLE");
  assert.equal(calls, 0);
  assert.deepEqual(parseResults([
    { lat: "-90", lon: "180", display_name: "Valid edge" },
    { lat: "NaN", lon: "20", display_name: "Invalid" },
    { lat: "20", lon: "181", display_name: "Invalid longitude" },
  ]).map(({ label }) => label), ["Valid edge"]);
});

test("location search rejects unsupported providers and Nominatim URL variants", async (t) => {
  let calls = 0;
  for (const searchUrl of [
    "https://geocoder.example.test/search",
    "https://nominatim.openstreetmap.org.evil.test/search",
    "https://nominatim.openstreetmap.org/reverse",
    "https://nominatim.openstreetmap.org/search?provider=other",
  ]) {
    const url = await withServer(t, {
      searchUrl,
      fetchImpl: async () => { calls += 1; return Response.json([]); },
    });
    const response = await fetch(`${url}?q=Pune`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "LOCATION_SEARCH_UNAVAILABLE");
  }
  assert.equal(calls, 0);
});

test("production location search refuses unidentified provider requests", async (t) => {
  let calls = 0;
  const url = await withServer(t, {
    requireConfiguredUserAgent: true,
    userAgentIsConfigured: false,
    fetchImpl: async () => { calls += 1; return Response.json([]); },
  });
  const response = await fetch(`${url}?q=Pune`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "LOCATION_SEARCH_UNAVAILABLE");
  assert.equal(calls, 0);
});

test("location search applies per-client and provider request limits", async (t) => {
  let minuteChecks = 0;
  let providerChecks = 0;
  let calls = 0;
  const url = await withServer(t, {
    perMinuteLimiter: { check: () => (++minuteChecks === 1 ? 0 : 30) },
    upstreamLimiter: { check: () => (++providerChecks === 1 ? 0 : 1) },
    fetchImpl: async () => { calls += 1; return Response.json([]); },
  });
  const first = await fetch(`${url}?q=Pune`);
  const minuteLimited = await fetch(`${url}?q=Mumbai`);
  assert.equal(first.status, 200);
  assert.equal(minuteLimited.status, 429);
  assert.equal(minuteLimited.headers.get("retry-after"), "30");

  const providerLimitedUrl = await withServer(t, {
    perMinuteLimiter: { check: () => 0 },
    upstreamLimiter: { check: () => 1 },
    fetchImpl: async () => { calls += 1; return Response.json([]); },
  });
  const providerLimited = await fetch(`${providerLimitedUrl}?q=Nagpur`);
  assert.equal(providerLimited.status, 429);
  assert.equal((await providerLimited.json()).code, "LOCATION_SEARCH_RATE_LIMITED");
  assert.equal(calls, 1);
});
