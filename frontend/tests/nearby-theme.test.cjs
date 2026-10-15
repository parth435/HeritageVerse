"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const nearbyModule = import("../src/lib/nearby.js");
const themeModule = import("../src/lib/theme.js");

test("Haversine distances handle equatorial points, identical coordinates, and invalid pairs", async () => {
  const { haversineDistanceKm } = await nearbyModule;
  assert.ok(Math.abs(haversineDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111.195) < 0.02);
  assert.equal(haversineDistanceKm({ latitude: 19, longitude: 73 }, { latitude: 19, longitude: 73 }), 0);
  assert.equal(haversineDistanceKm({ latitude: null, longitude: 73 }, { latitude: 19, longitude: 73 }), null);
  assert.equal(haversineDistanceKm({ latitude: 91, longitude: 73 }, { latitude: 19, longitude: 73 }), null);
});

test("nearby selection excludes unverified or missing coordinates, filters radius, and sorts nearest first", async () => {
  const { findNearbyPlaces } = await nearbyModule;
  const records = [
    { id: 1, slug: "far", name: "Far", latitude: 0, longitude: 1, coordinates_verified: true },
    { id: 2, slug: "near", name: "Near", latitude: 0, longitude: 0.01, coordinates_verified: true },
    { id: 3, slug: "unverified", name: "Unverified", latitude: 0, longitude: 0.001, coordinates_verified: false },
    { id: 4, slug: "missing", name: "Missing", latitude: null, longitude: null, coordinates_verified: true },
  ];
  const results = findNearbyPlaces(records, { latitude: 0, longitude: 0 }, 5);
  assert.deepEqual(results.map(({ place }) => place.name), ["Near"]);
  assert.ok(results[0].distanceKm < 2);
  assert.deepEqual(findNearbyPlaces(records, { latitude: 0, longitude: 0 }, 101), []);
  assert.deepEqual(findNearbyPlaces(records, null, 25), []);
});

test("nearby distance formatting names metres and kilometres and maps never claim driving distance", async () => {
  const { formatApproxDistance } = await nearbyModule;
  assert.equal(formatApproxDistance(0.456), "460 m");
  assert.equal(formatApproxDistance(4.56), "4.6 km");
  const page = await readFile(path.resolve(__dirname, "../src/pages/NearbyPage.tsx"), "utf8");
  const app = await readFile(path.resolve(__dirname, "../src/App.tsx"), "utf8");
  assert.match(page, /straight-line distance/);
  assert.match(page, /Find near me/i);
  assert.match(page, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(page, /onClick=\{findNearMe\}/);
  assert.match(page, /Precise GPS coordinates stay in this browser/);
  assert.match(page, /viewMode === "map"/);
  assert.match(app, /pathname === "\/nearby"/);
});

test("theme preference restores stored values, supports system preference, and tolerates blocked storage", async () => {
  const { applyTheme, readTheme, resolveTheme } = await themeModule;
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(readTheme({ getItem: () => { throw new Error("storage disabled"); } }, true), "dark");
  const values = new Map();
  const documentElement = { dataset: {}, style: {}, setAttribute(_name, value) { this.dataset.theme = value; } };
  assert.equal(applyTheme("dark", { documentElement }, { setItem: (key, value) => values.set(key, value) }), "dark");
  assert.equal(documentElement.dataset.theme, "dark");
  assert.equal(documentElement.style.colorScheme, "dark");
  assert.equal(values.get("heritageverse-theme"), "dark");
  assert.equal(applyTheme("light", { documentElement }, { setItem: () => { throw new Error("storage disabled"); } }), "light");
});
