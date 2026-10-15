"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const pool = require("../config/db");
const heritageRouter = require("../modules/heritage");

const timelineSource = {
  id: 90,
  heritage_id: 1,
  source_name: "Museum archive",
  source_title: "Official history",
  publisher: "Museum",
  source_url: "https://museum.example/history",
  source_note: "Official museum history page",
  accessed_on: "2026-10-11",
  claims_supported: ["timeline_event"],
};

const sites = new Map([
  [1, {
    id: 1,
    slug: "museum-one",
    name: "Indian Museum, Kolkata",
    description: "First site",
    history: "History one",
    cultural_significance: "Significance one",
    architecture: "Recorded architecture one",
    historical_period: "Recorded period one",
    category_id: 2,
    category: { id: 2, name: "Museum", slug: "museum" },
    state: "West Bengal",
    district: "Kolkata",
    locality: "Kolkata",
    address: null,
    latitude: null,
    longitude: null,
    coordinates_verified: false,
    publication_status: "published",
    media: [],
    timeline_events: [{
      id: 11,
      heritage_id: 1,
      title: "Museum established",
      description: "The museum was established on this date.",
      event_period: "2 February 1814",
      event_date: "1814-02-02",
      display_order: 1,
      source_id: 90,
    }],
    artifacts: [],
    architectural_layers: [],
    sources: [timelineSource],
  }],
  [2, {
    id: 2,
    slug: "museum-two",
    name: "Museum Two",
    description: "Second site",
    history: "History two",
    cultural_significance: "Significance two",
    architecture: "",
    historical_period: "",
    category_id: 2,
    category: { id: 2, name: "Museum", slug: "museum" },
    state: "Delhi",
    district: null,
    locality: "New Delhi",
    address: null,
    latitude: null,
    longitude: null,
    coordinates_verified: false,
    publication_status: "published",
    media: [],
    timeline_events: [],
    artifacts: [],
    architectural_layers: [],
    sources: [],
  }],
]);

test("heritage APIs provide site-specific feature data and safe empty, invalid, and failure responses", async (t) => {
  const previousQuery = pool.query;
  let failDetail = false;
  let listQuery = "";
  let listValues = [];
  let detailQuery = "";
  let detailValues = [];
  pool.query = async (sql, values = []) => {
    const statement = String(sql);
    if (statement.includes("FROM heritage_slug_aliases")) return { rows: [{ id: null }] };
    if (statement.includes("SELECT COUNT(*) AS total")) return { rows: [{ total: values.length ? 1 : 2 }] };
    if (statement.startsWith("WITH requested_record AS (")) {
      detailQuery = statement;
      detailValues = values;
      if (failDetail) {
        const error = new Error("private database connection details");
        error.code = "08006";
        throw error;
      }
      return { rows: sites.has(values[0]) ? [sites.get(values[0])] : [] };
    }
    if (statement.includes("selected_image.url AS image_url")) {
      listQuery = statement;
      listValues = values;
      const queryTerms = values.slice(1, -2).map((pattern) => pattern.replaceAll("%", "").toLowerCase());
      const requiresTimeline = /EXISTS\s*\(\s*SELECT 1 FROM heritage_timeline_events timeline/i.test(statement);
      return { rows: [...sites.values()].filter((site) => !requiresTimeline || site.timeline_events.length > 0).filter((site) => queryTerms.length === 0 || queryTerms.every((term) => site.name.toLowerCase().includes(term))).map(({ id, slug, name, description, history, cultural_significance, architecture, historical_period, category_id, category, state, district, locality, address, latitude, longitude, coordinates_verified, publication_status }) => ({
        id, slug, name, description, history, cultural_significance, architecture, historical_period, category_id, category, state, district, locality, address, latitude, longitude, coordinates_verified, publication_status,
      })) };
    }
    throw new Error(`Unexpected feature API query: ${statement.slice(0, 120)}`);
  };

  const app = express();
  app.use("/api", heritageRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = previousQuery;
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const searchResponse = await fetch(`${origin}/api/heritage?q=Indian%20Museum%20Kolkata&limit=100`);
  const search = await searchResponse.json();
  assert.equal(searchResponse.status, 200);
  assert.match(listQuery, /CONCAT_WS\(' ', h\.name, h\.description, h\.history, h\.cultural_significance\)/);
  assert.deepEqual(listValues, ["%Indian Museum Kolkata%", "%Indian%", "%Museum%", "%Kolkata%", 100, 0]);
  assert.deepEqual(search.items.map((site) => site.id), [1]);
  assert.match(listQuery, /heritage_catalog_membership/);
  assert.match(listQuery, /ORDER BY membership\.display_order ASC/);

  const timelineResponse = await fetch(origin + "/api/heritage?hasTimeline=true&limit=100");
  const timeline = await timelineResponse.json();
  assert.equal(timelineResponse.status, 200);
  assert.match(listQuery, /EXISTS\s*\(\s*SELECT 1 FROM heritage_timeline_events timeline/i);
  assert.deepEqual(timeline.items.map((site) => site.id), [1]);

  const firstResponse = await fetch(`${origin}/api/heritage/1`);
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(first.heritage.timeline_events[0].title, "Museum established");
  assert.equal(first.heritage.timeline_events[0].event_date, "1814-02-02");
  assert.equal(first.heritage.timeline_events[0].source_id, 90);
  assert.equal(first.heritage.sources[0].claims_supported.includes("timeline_event"), true);
  assert.equal(first.heritage.architectural_layers.length, 0);
  assert.deepEqual(detailValues, [1, null]);
  assert.match(detailQuery, /heritage_catalog_membership/);
  assert.match(detailQuery, /favorites f WHERE f\.heritage_id = h\.id AND f\.user_id = \$2/);

  const invalidTokenResponse = await fetch(`${origin}/api/heritage/1`, { headers: { Authorization: "Bearer invalid-token" } });
  assert.equal(invalidTokenResponse.status, 401, "optional authentication must reject an invalid token rather than treating it as anonymous");

  const secondResponse = await fetch(`${origin}/api/heritage/2`);
  const second = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.equal(second.heritage.name, "Museum Two");
  assert.deepEqual(second.heritage.timeline_events, []);
  assert.deepEqual(second.heritage.architectural_layers, []);
  assert.notEqual(second.heritage.name, first.heritage.name);

  const invalid = await fetch(`${origin}/api/heritage/not_a_site`);
  assert.equal(invalid.status, 400);
  const invalidId = await fetch(`${origin}/api/heritage/0`);
  assert.equal(invalidId.status, 400);
  const missing = await fetch(`${origin}/api/heritage/999`);
  assert.equal(missing.status, 404);

  const missingSlug = await fetch(`${origin}/api/heritage/not-a-site`);
  assert.equal(missingSlug.status, 404);

  failDetail = true;
  const failure = await fetch(`${origin}/api/heritage/1`);
  const failureBody = await failure.json();
  assert.equal(failure.status, 500);
  assert.equal(failureBody.message, "Failed to load heritage record");
  assert.equal(JSON.stringify(failureBody).includes("private database connection details"), false);
});
