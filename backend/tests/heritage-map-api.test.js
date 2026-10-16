"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const pool = require("../config/db");
const heritageRouter = require("../modules/heritage");

const mapSites = [
  { id: 1, slug: "fort-one", name: "Fort One", description: "Hill fort", state: "Maharashtra", district: "Pune", locality: "Pune", latitude: 18.5, longitude: 73.8, coordinates_verified: true, category_slug: "fort" },
  { id: 2, slug: "fort-two", name: "Fort Two", description: "Hill fort", state: "Maharashtra", district: "Pune", locality: "Pune", latitude: 18.5, longitude: 73.8, coordinates_verified: true, category_slug: "fort" },
  { id: 3, slug: "coast-temple", name: "Coast Temple", description: "Temple", state: "Goa", district: "North Goa", locality: "Coast", latitude: "19.5", longitude: "73.2", coordinates_verified: true, category_slug: "temple" },
  { id: 4, slug: "lake-temple", name: "Lake Temple", description: "Temple beside a lake", state: "Rajasthan", district: "Jaipur", locality: "Jaipur", latitude: 12, longitude: 78, coordinates_verified: true, category_slug: "temple" },
  { id: 5, slug: "missing-coordinates", name: "Missing Coordinates", description: "", state: "Delhi", district: "Delhi", locality: null, latitude: null, longitude: null, coordinates_verified: false, category_slug: "museum" },
  { id: 6, slug: "invalid-coordinates", name: "Invalid Coordinates", description: "", state: "Delhi", district: "Delhi", locality: null, latitude: 91, longitude: 0, coordinates_verified: true, category_slug: "museum" },
  { id: 7, slug: "partial-coordinates", name: "Partial Coordinates", description: "", state: "Delhi", district: "Delhi", locality: null, latitude: 22, longitude: null, coordinates_verified: true, category_slug: "museum" },
  { id: 8, slug: "unverified-coordinates", name: "Unverified Coordinates", description: "", state: "Delhi", district: "Delhi", locality: null, latitude: 17, longitude: 73, coordinates_verified: false, category_slug: "museum" },
];

function readPlaceholder(sql, column, values) {
  const match = sql.match(new RegExp(column + "\\s*=\\s*\\$(\\d+)"));
  return match ? values[Number(match[1]) - 1] : undefined;
}

function matchesMapQuery(site, sql, values) {
  if (!(site.coordinates_verified === true &&
    site.latitude !== null && site.latitude !== undefined && site.latitude !== "" &&
    site.longitude !== null && site.longitude !== undefined && site.longitude !== "" &&
    Number.isFinite(Number(site.latitude)) &&
    Number(site.latitude) >= -90 && Number(site.latitude) <= 90 &&
    Number.isFinite(Number(site.longitude)) &&
    Number(site.longitude) >= -180 && Number(site.longitude) <= 180)) return false;

  const category = readPlaceholder(sql, "c\\.slug", values);
  const state = readPlaceholder(sql, "h\\.state", values);
  const district = readPlaceholder(sql, "h\\.district", values);
  if (category && category !== site.category_slug) return false;
  if (state && state !== site.state) return false;
  if (district && district !== site.district) return false;

  const patterns = values.filter((value) => typeof value === "string" && value.startsWith("%") && value.endsWith("%"));
  if (patterns.length) {
    const text = [site.name, site.description, site.state, site.district].join(" ").toLowerCase();
    const phrase = patterns[0].slice(1, -1).toLowerCase();
    const termsMatch = patterns.length > 1 && patterns.slice(1).every((pattern) => text.includes(pattern.slice(1, -1).toLowerCase()));
    if (!text.includes(phrase) && !termsMatch) return false;
  }
  return true;
}

test("heritage map API returns all verified valid sites through pages and honors filters", async (t) => {
  const previousQuery = pool.query;
  let failQueries = false;
  let lastCountSql = "";
  let lastCountValues = [];
  pool.query = async (sql, values = []) => {
    const statement = String(sql);
    if (failQueries) {
      const error = new Error("private database details");
      error.code = "08006";
      throw error;
    }
    const matches = mapSites.filter((site) => matchesMapQuery(site, statement, values));
    if (statement.includes("SELECT COUNT(*) AS total")) {
      lastCountSql = statement;
      lastCountValues = values;
      return { rows: [{ total: matches.length }] };
    }
    if (statement.includes("selected_image.media")) {
      const limit = values.at(-2);
      const offset = values.at(-1);
      return { rows: matches.slice(offset, offset + limit).map((site) => ({
        id: site.id,
        slug: site.slug,
        name: site.name,
        description: site.description,
        state: site.state,
        district: site.district,
        locality: site.locality,
        latitude: site.latitude,
        longitude: site.longitude,
        coordinates_verified: true,
        media: [],
      })) };
    }
    throw new Error("Unexpected heritage map query: " + statement.slice(0, 100));
  };

  const app = express();
  app.use("/api", heritageRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = previousQuery;
  });

  const origin = "http://127.0.0.1:" + server.address().port;
  const firstResponse = await fetch(origin + "/api/heritage-map?limit=2&offset=0");
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(first.items.map((site) => site.id), [1, 2]);
  assert.equal(first.pagination.total, 4);
  assert.equal(first.items[0].latitude, 18.5);
  assert.deepEqual(first.items[0].media, []);
  assert.match(lastCountSql, /h\.latitude BETWEEN -90 AND 90/);
  assert.match(lastCountSql, /h\.longitude BETWEEN -180 AND 180/);
  assert.match(lastCountSql, /coordinate_source\.review_status = 'approved'/);
  assert.match(lastCountSql, /heritage_catalog_membership/);
  assert.doesNotMatch(lastCountSql, /FROM heritage_media verified_photo/);

  const secondResponse = await fetch(origin + "/api/heritage-map?limit=2&offset=2");
  const second = await secondResponse.json();
  assert.deepEqual(second.items.map((site) => site.id), [3, 4]);
  assert.equal(second.items[0].latitude, "19.5");
  assert.equal(second.items[0].longitude, "73.2");
  assert.equal(second.pagination.total, 4);

  const filteredResponse = await fetch(origin + "/api/heritage-map?q=Lake%20Temple&category=temple&state=Rajasthan&district=Jaipur&limit=10");
  const filtered = await filteredResponse.json();
  assert.equal(filteredResponse.status, 200);
  assert.deepEqual(filtered.items.map((site) => site.id), [4]);
  assert.match(lastCountSql, /CONCAT_WS\(' ', h\.name, h\.description, h\.history, h\.cultural_significance\)/);
  assert.match(lastCountSql, /c\.slug = \$4/);
  assert.match(lastCountSql, /h\.state = \$5/);
  assert.match(lastCountSql, /h\.district = \$6/);
  assert.match(lastCountSql, /heritage_catalog_membership/);
  assert.deepEqual(lastCountValues, ["%Lake Temple%", "%Lake%", "%Temple%", "temple", "Rajasthan", "Jaipur"]);

  const invalidPage = await fetch(origin + "/api/heritage-map?limit=0");
  assert.equal(invalidPage.status, 400);

  failQueries = true;
  const failure = await fetch(origin + "/api/heritage-map");
  const failureBody = await failure.json();
  assert.equal(failure.status, 500);
  assert.equal(failureBody.message, "Failed to load heritage map locations");
  assert.equal(JSON.stringify(failureBody).includes("private database details"), false);
});
