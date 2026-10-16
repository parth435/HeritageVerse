"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const pool = require("../config/db");
const heritageRouter = require("../modules/heritage");

const media = {
  id: 8,
  heritage_id: 1,
  media_type: "image",
  url: "https://upload.wikimedia.org/wikipedia/commons/a/original.jpg",
  caption: "Taj Mahal",
  alt_text: "Taj Mahal photograph",
  credit: "Photographer (CC BY-SA 4.0)",
  license: "CC BY-SA 4.0",
  display_order: 0,
  source_url: "https://commons.wikimedia.org/wiki/File:original.jpg",
  creator: "Photographer",
  documented_date: null,
  license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
  media_role: "gallery",
  media_context: "Sourced photo",
  verification_status: "verified",
  is_illustrative: false,
  source_accessed_on: "2026-10-11",
  thumbnail_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/original.jpg/1000px-original.jpg",
  provider: "wikimedia",
  wikimedia_filename: "original.jpg",
  match_confidence: 0.98,
};

const baseHeritage = {
  id: 1,
  slug: "taj-mahal",
  name: "Taj Mahal",
  description: "Description",
  history: "History",
  cultural_significance: "Significance",
  architecture: "Architecture",
  historical_period: "Mughal",
  category_id: 1,
  category: { id: 1, name: "Monument", slug: "monument" },
  state: "Uttar Pradesh",
  district: "Agra",
  locality: "Agra",
  address: null,
  latitude: 27.175,
  longitude: 78.042,
  coordinates_verified: true,
  publication_status: "published",
  media: [media],
  timeline_events: [],
  artifacts: [],
  architectural_layers: [],
  sources: [],
};

test("heritage list and detail APIs preserve existing fields and add image metadata", async (t) => {
  const previousQuery = pool.query;
  let detailSql = "";
  let listSql = "";
  let omitImages = false;
  let noPhotoCatalogue = false;
  pool.query = async (sql) => {
    const statement = String(sql);
    if (statement.includes("SELECT COUNT(*) AS total")) return { rows: [{ total: noPhotoCatalogue ? 30 : 1 }] };
    if (statement.startsWith("WITH requested_record AS (")) detailSql = statement;
    if (statement.includes("LEFT JOIN LATERAL")) {
      if (statement.includes("selected_image.url")) listSql = statement;
      if (omitImages && noPhotoCatalogue) {
        return { rows: Array.from({ length: 30 }, (_, index) => ({
          ...baseHeritage,
          id: index + 1,
          slug: `maharashtra-heritage-${index + 1}`,
          name: `Maharashtra Heritage ${index + 1}`,
          state: "Maharashtra",
          image_url: null,
          media: [],
        })) };
      }
      return { rows: [{
        ...baseHeritage,
        image_url: omitImages ? null : media.url,
        media: omitImages ? [] : [media],
      }] };
    }
    throw new Error(`Unexpected heritage API query: ${statement.slice(0, 80)}`);
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
  const listResponse = await fetch(`${origin}/api/heritage?limit=10`);
  const list = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(list.items[0].id, 1);
  assert.equal(list.items[0].name, "Taj Mahal");
  assert.equal(list.items[0].media[0].url, media.url);
  assert.equal(list.items[0].media[0].credit, media.credit);
  assert.equal(list.items[0].media[0].license, media.license);
  assert.equal(list.items[0].media[0].thumbnail_url, media.thumbnail_url);
  assert.equal(list.items[0].media[0].match_confidence, media.match_confidence);
  assert.equal(list.items[0].media[0].verification_status, "verified");
  assert.equal(list.items[0].media[0].is_illustrative, false);
  assert.match(listSql, /m\.media_role IN \('gallery', 'current'\)/);
  assert.match(listSql, /m\.verification_status = 'verified'/);
  assert.match(listSql, /m\.is_illustrative = FALSE/);

  omitImages = true;
  noPhotoCatalogue = true;
  const noPhotoResponse = await fetch(`${origin}/api/heritage?state=Maharashtra&limit=100&offset=0`);
  const noPhotoList = await noPhotoResponse.json();
  assert.equal(noPhotoResponse.status, 200);
  assert.equal(noPhotoList.items.length, 30, "all published Maharashtra catalogue records remain available without verified images");
  assert.equal(noPhotoList.pagination.total, 30);
  assert.ok(noPhotoList.items.every((item) => item.state === "Maharashtra"));
  assert.ok(noPhotoList.items.every((item) => item.image_url === null && item.media.length === 0));

  omitImages = false;
  noPhotoCatalogue = false;
  const detailResponse = await fetch(`${origin}/api/heritage/1`);
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.heritage.slug, "taj-mahal");
  assert.equal(detail.heritage.category.slug, "monument");
  assert.equal(detail.heritage.media[0].provider, "wikimedia");
  assert.equal(detail.heritage.media[0].wikimedia_filename, "original.jpg");
  assert.equal(detail.heritage.media[0].verification_status, "verified");
  assert.match(detailSql, /COALESCE\(media_owner\.wikidata_qid, owner_acquisition\.matched_qid\)/);
  assert.match(detailSql, /current_acquisition\.matched_qid/);
  assert.match(detailSql, /m\.verification_status = 'verified'/);
  assert.match(detailSql, /m\.is_illustrative = FALSE/);
});
