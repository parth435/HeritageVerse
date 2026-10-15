"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const pool = require("../config/db");
const heritageRouter = require("../modules/heritage");

test("verified-photo public scope includes outside-catalogue places without leaking candidates", async (t) => {
  const originalQuery = pool.query;
  const calls = [];
  const outsideCataloguePlace = {
    id: 900,
    slug: "outside-catalogue-photo-place",
    name: "Outside Catalogue Photo Place",
    publication_status: "published",
    category: { id: 1, name: "Monument", slug: "monument" },
    media: [{
      id: 901,
      heritage_id: 900,
      media_type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/verified.jpg",
      source_url: "https://commons.wikimedia.org/wiki/File:verified.jpg",
      credit: "Photographer",
      creator: "Photographer",
      license: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      media_role: "gallery",
      verification_status: "verified",
      is_illustrative: false,
    }],
  };

  pool.query = async (sql, values = []) => {
    const statement = String(sql);
    calls.push({ statement, values });
    if (statement.includes("FROM heritage_categories c")) {
      return { rows: [{ id: 1, name: "Monument", slug: "monument" }] };
    }
    if (statement.includes("SELECT DISTINCT state")) return { rows: [{ state: "Maharashtra" }] };
    if (statement.includes("SELECT DISTINCT district")) return { rows: [{ district: "Pune" }] };
    if (statement.includes("SELECT COUNT(*) AS total")) return { rows: [{ total: 24 }] };
    if (statement.includes("selected_image.url AS image_url")) {
      return { rows: [{ ...outsideCataloguePlace, image_url: outsideCataloguePlace.media[0].url }] };
    }
    if (statement.includes("TRUE AS coordinates_verified, selected_image.media")) {
      return { rows: [{ ...outsideCataloguePlace, latitude: 18.52, longitude: 73.85, coordinates_verified: true }] };
    }
    if (statement.startsWith("WITH requested_record AS (")) {
      return Number(values[0]) === 900 ? { rows: [outsideCataloguePlace] } : { rows: [] };
    }
    throw new Error(`Unexpected verified-photo API query: ${statement.slice(0, 120)}`);
  };

  const app = express();
  app.use("/api", heritageRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
  });

  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const invalid = await fetch(`${origin}/heritage?withVerifiedPhoto=yes`);
  assert.equal(invalid.status, 400);

  const categories = await fetch(`${origin}/categories?withVerifiedPhoto=true`).then((response) => response.json());
  assert.deepEqual(categories.categories.map((category) => category.slug), ["monument"]);
  const facets = await fetch(`${origin}/heritage-facets?state=Maharashtra&withVerifiedPhoto=true`).then((response) => response.json());
  assert.deepEqual(facets.states, ["Maharashtra"]);
  assert.deepEqual(facets.districts, ["Pune"]);

  const listResponse = await fetch(`${origin}/heritage?withVerifiedPhoto=true&limit=10&offset=20`);
  const list = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(list.pagination.total, 24);
  assert.equal(list.items[0].id, 900);
  assert.equal(list.items[0].media[0].verification_status, "verified");
  assert.equal(list.items[0].media[0].license_url, "https://creativecommons.org/licenses/by-sa/4.0/");

  const listQuery = calls.find(({ statement }) => statement.includes("selected_image.url AS image_url")).statement;
  assert.match(listQuery, /verified_photo\.media_role IN \('gallery', 'current'\)/);
  assert.match(listQuery, /verified_photo\.verification_status = 'verified'/);
  assert.match(listQuery, /verified_photo\.is_illustrative = FALSE/);
  assert.match(listQuery, /LEFT JOIN heritage_catalog_membership membership/);
  assert.match(listQuery, /ORDER BY m\.display_order ASC, m\.id ASC\s+LIMIT 1/);
  assert.doesNotMatch(listQuery, /JOIN heritage_media verified_photo/);

  const mapResponse = await fetch(`${origin}/heritage-map?withVerifiedPhoto=true`);
  const map = await mapResponse.json();
  assert.equal(map.pagination.total, 24);
  assert.equal(map.items[0].id, 900);
  const mapQuery = calls.find(({ statement }) => statement.includes("TRUE AS coordinates_verified, selected_image.media")).statement;
  assert.match(mapQuery, /verified_photo\.verification_status = 'verified'/);
  assert.match(mapQuery, /coordinate_source\.review_status = 'approved'/);

  const detail = await fetch(`${origin}/heritage/900`);
  assert.equal(detail.status, 200);
  const detailQuery = calls.find(({ statement }) => statement.startsWith("WITH requested_record AS (")).statement;
  assert.match(detailQuery, /verified_photo\.media_role IN \('gallery', 'current'\)/);
  assert.match(detailQuery, /verified_photo\.verification_status = 'verified'/);
  assert.match(detailQuery, /verified_photo\.is_illustrative = FALSE/);
  assert.equal((await fetch(`${origin}/heritage/901`)).status, 404);
});
