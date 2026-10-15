"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const pool = require("../config/db");
const heritageRouter = require("../modules/heritage");
const {
  CURATED_IMAGES,
  applyCuratedImageFallback,
  hasVerifiedPublicImage,
} = require("../utilities/curated-heritage-images");

test("curated public image records keep exact source, credit, license, and site mapping", () => {
  const imageUrls = new Set();
  for (const [slug, image] of Object.entries(CURATED_IMAGES)) {
    const record = applyCuratedImageFallback({ id: slug, slug, image_url: null, media: [] });
    assert.equal(record.image_url, image.url, slug);
    assert.equal(record.media.length, 1, slug);
    assert.equal(record.media[0].media_type, "image", slug);
    assert.equal(record.media[0].media_role, "current", slug);
    assert.equal(record.media[0].verification_status, "verified", slug);
    assert.equal(record.media[0].is_illustrative, false, slug);
    assert.equal(record.media[0].source_url, image.source_url, slug);
    assert.equal(record.media[0].license_url, image.license_url, slug);
    assert.match(record.image_url, /^https:\/\/upload\.wikimedia\.org\//, slug);
    assert.equal(imageUrls.has(record.image_url), false, `duplicate photo URL for ${slug}`);
    imageUrls.add(record.image_url);
  }
});

test("curated fallback leaves unlisted records image-less and preserves database verified media", () => {
  const unlisted = { id: 900, slug: "unlisted-place", image_url: null, media: [] };
  const unchanged = applyCuratedImageFallback(unlisted);
  assert.equal(unchanged.image_url, null);
  assert.deepEqual(unchanged.media, []);

  const existing = {
    id: 901,
    slug: "gateway-of-india",
    image_url: "https://images.example/gateway.jpg",
    media: [{ media_type: "image", media_role: "gallery", url: "https://images.example/gateway.jpg", verification_status: "verified", is_illustrative: false }],
  };
  const preserved = applyCuratedImageFallback(existing);
  assert.equal(preserved.image_url, existing.image_url);
  assert.equal(preserved.media, existing.media);
  assert.equal(hasVerifiedPublicImage([{ ...existing.media[0], url: " " }]), false);
  assert.equal(hasVerifiedPublicImage([{ ...existing.media[0], url: "http://images.example/gateway.jpg" }]), false);
  assert.equal(hasVerifiedPublicImage([{ ...existing.media[0], media_role: "historical" }]), false);
});

test("public catalogue and verified-photo map return curated image_url and media fields", async (t) => {
  const previousQuery = pool.query;
  const queries = [];
  const row = {
    id: 12,
    slug: "ajanta-caves",
    name: "Ajanta Caves",
    image_url: null,
    media: [],
    latitude: 20.55,
    longitude: 75.7,
    coordinates_verified: true,
  };
  pool.query = async (sql) => {
    const statement = String(sql);
    queries.push(statement);
    if (statement.includes("SELECT COUNT(*) AS total")) return { rows: [{ total: 1 }] };
    if (statement.includes("selected_image.url AS image_url")) return { rows: [row] };
    if (statement.includes("TRUE AS coordinates_verified, selected_image.media")) return { rows: [row] };
    throw new Error(`Unexpected curated media test query: ${statement.slice(0, 120)}`);
  };

  const app = express();
  app.use("/api", heritageRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = previousQuery;
  });

  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const catalogue = await fetch(`${origin}/heritage?withVerifiedPhoto=true&limit=10`).then((response) => response.json());
  assert.equal(catalogue.pagination.total, 1);
  assert.equal(catalogue.items[0].image_url, CURATED_IMAGES["ajanta-caves"].url);
  assert.equal(catalogue.items[0].media[0].source_url, CURATED_IMAGES["ajanta-caves"].source_url);
  assert.match(queries[0], /slug = ANY\(ARRAY\[[\s\S]*'ajanta-caves'/);

  const map = await fetch(`${origin}/heritage-map?withVerifiedPhoto=true`).then((response) => response.json());
  assert.equal(map.pagination.total, 1);
  assert.equal(map.items[0].image_url, CURATED_IMAGES["ajanta-caves"].url);
  assert.equal(map.items[0].media[0].verification_status, "verified");
  assert.ok(queries.some((query) => query.includes("coordinate_source.review_status = 'approved'")));
});
