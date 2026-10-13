"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const heritageRouter = require("../modules/heritage");
const favoritesRouter = require("../modules/favorites");
const reviewsRouter = require("../modules/reviews");

const backendDirectory = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(backendDirectory, "database/selected-catalogue.json"), "utf8"));

test("selected catalogue manifest and migration use stable identity keys and preserve existing data", () => {
  const migration = fs.readFileSync(path.join(backendDirectory, "database/migrations/009_selected_30_catalogue_data.sql"), "utf8");
  const canonicalSchema = fs.readFileSync(path.join(backendDirectory, "database/schema.sql"), "utf8");
  const sourceReviewMigration = fs.readFileSync(path.join(backendDirectory, "database/migrations/005_verified_media_and_coordinate_review.sql"), "utf8");
  const schemaMigration = fs.readFileSync(path.join(backendDirectory, "database/migrations/008_selected_catalogue_membership.sql"), "utf8");
  const manifestText = fs.readFileSync(path.join(backendDirectory, "database/selected-catalogue.json"), "utf8");
  assert.equal(manifest.places.length, 30);
  assert.deepEqual(manifest.places.map((place) => place.order), Array.from({ length: 30 }, (_, index) => index + 1));
  assert.equal(new Set(manifest.places.map((place) => place.slug)).size, 30);
  assert.equal(manifest.places.filter((place) => place.state === "Maharashtra").length, 22);
  assert.ok(manifest.places.every((place) => !Object.hasOwn(place, "recordId")));
  assert.deepEqual(manifest.duplicateAliases.map((alias) => alias.canonicalSlug), ["ajanta-caves", "ellora-caves"]);
  assert.ok(manifest.duplicateAliases.every((alias) => alias.identity.name && alias.identity.locality && alias.identity.category));
  assert.doesNotMatch(manifestText, /recordId|aliasRecordId|canonicalRecordId|record-\d+/);
  assert.match(schemaMigration, /ON DELETE RESTRICT/);
  assert.match(schemaMigration, /heritage_catalog_membership \([\s\S]*?heritage_id INTEGER PRIMARY KEY[\s\S]*?REFERENCES heritage\(id\) ON UPDATE CASCADE ON DELETE RESTRICT/);
  assert.match(schemaMigration, /catalogue_key TEXT NOT NULL UNIQUE/);
  assert.match(schemaMigration, /display_order SMALLINT NOT NULL UNIQUE[\s\S]*?BETWEEN 1 AND 30/);
  assert.match(schemaMigration, /heritage_catalog_aliases \([\s\S]*?alias_heritage_id INTEGER PRIMARY KEY[\s\S]*?canonical_heritage_id INTEGER NOT NULL/);
  assert.match(schemaMigration, /heritage_slug_aliases \([\s\S]*?slug_alias TEXT PRIMARY KEY[\s\S]*?heritage_id INTEGER NOT NULL[\s\S]*?REFERENCES heritage\(id\) ON UPDATE CASCADE ON DELETE RESTRICT/);
  assert.match(migration, /heritage_catalog_aliases/);
  assert.match(migration, /heritage_slug_aliases/);
  assert.match(migration, /selected_catalogue_legacy_identity/);
  assert.match(migration, /legacy\.slug=expected\.old_slug/);
  assert.match(migration, /lower\(h\.name\) <> ALL\(expected\.expected_names\)/);
  assert.match(migration, /legacy variant and canonical slug both exist as different records/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /possible_alias\.name=expected\.expected_name/);
  assert.doesNotMatch(migration, /\b(?:1169|1171|1199|1210|1212|1214|1220|1221|1263|1264|1267|1334)\b/);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+heritage\b/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(?:users|favorites|visited_places|reviews|journeys|journey_stops)\b/i);
  assert.match(migration, /WITH required_categories\(slug, name\) AS/);
  assert.match(migration, /LEFT JOIN heritage_categories category ON category\.slug=required\.slug[\s\S]*?category\.name IS DISTINCT FROM required\.name/);
  for (const category of ["architectural-landmark", "cave-rock-cut", "fort-palace", "mausoleum-tomb", "buddhist-monument", "archaeological", "temple-religious"]) {
    assert.match(migration, new RegExp(`\\('${category}'\\)`));
  }
  const sourceConflicts = [...migration.matchAll(/INSERT INTO heritage_sources[\s\S]*?ON CONFLICT \(heritage_id, source_url\)([\s\S]*?);/gi)];
  assert.equal(sourceConflicts.length, 3);
  assert.ok(sourceConflicts.every(([, clause]) => /DO NOTHING/i.test(clause)));
  assert.ok(sourceConflicts.every(([, clause]) => !/review_status\s*=/i.test(clause)));
  assert.match(migration, /e\.source_note, CURRENT_DATE, e\.claims_supported::TEXT\[\], 'pending'/);
  assert.match(migration, /ARRAY\['coordinates'\]::TEXT\[\], 'approved'/);
  assert.match(migration, /WHERE h\.latitude=e\.latitude AND h\.longitude=e\.longitude/);
  assert.match(migration, /expected_coordinate_evidence[\s\S]*?s\.source_url=expected\.source_url[\s\S]*?s\.review_status='approved'/);
  const konarkSourceCorrection = migration.match(/UPDATE heritage_sources[\s\S]*?WHERE heritage_id=\(SELECT id FROM heritage WHERE slug='konark-sun-temple'\)[\s\S]*?;/)?.[0] ?? "";
  assert.match(konarkSourceCorrection, /source_url='https:\/\/whc\.unesco\.org\/en\/list\/246\//);
  assert.doesNotMatch(konarkSourceCorrection, /review_status\s*=/i);
  assert.doesNotMatch(canonicalSchema, /UPDATE heritage_sources[\s\S]*?SET review_status\s*=\s*'approved'/i);
  assert.doesNotMatch(sourceReviewMigration, /UPDATE heritage_sources[\s\S]*?SET review_status\s*=\s*'approved'/i);
});

test("catalogue migrations follow the schema, data, then address dependency order", () => {
  const migrationsDirectory = path.join(backendDirectory, "database/migrations");
  const migrationFiles = fs.readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const schemaMigration = fs.readFileSync(path.join(migrationsDirectory, "008_selected_catalogue_membership.sql"), "utf8");
  const dataMigration = fs.readFileSync(path.join(migrationsDirectory, "009_selected_30_catalogue_data.sql"), "utf8");
  const addressMigration = fs.readFileSync(path.join(migrationsDirectory, "010_selected_catalogue_addresses.sql"), "utf8");
  const smoke = fs.readFileSync(path.join(backendDirectory, "database/migration-smoke.js"), "utf8");
  const canonicalSchema = fs.readFileSync(path.join(backendDirectory, "database/schema.sql"), "utf8");
  const canonicalSeed = fs.readFileSync(path.join(backendDirectory, "database/seed.sql"), "utf8");

  assert.deepEqual(migrationFiles.slice(-3), [
    "008_selected_catalogue_membership.sql",
    "009_selected_30_catalogue_data.sql",
    "010_selected_catalogue_addresses.sql",
  ]);
  assert.match(schemaMigration, /CREATE TABLE IF NOT EXISTS heritage_catalog_membership/);
  assert.match(schemaMigration, /display_order SMALLINT NOT NULL UNIQUE[\s\S]*?CHECK \(display_order BETWEEN 1 AND 30\)/);
  assert.match(schemaMigration, /CREATE TABLE IF NOT EXISTS heritage_catalog_aliases[\s\S]*?CHECK \(alias_heritage_id <> canonical_heritage_id\)/);
  assert.match(schemaMigration, /CREATE TABLE IF NOT EXISTS heritage_slug_aliases[\s\S]*?slug_alias TEXT PRIMARY KEY[\s\S]*?REFERENCES heritage\(id\) ON UPDATE CASCADE ON DELETE RESTRICT/);
  assert.match(dataMigration, /INSERT INTO heritage_catalog_membership/);
  assert.match(dataMigration, /FROM heritage_catalog_membership[\s\S]*?member_count <> 30/);
  assert.match(dataMigration, /'pandavleni-caves'/);
  assert.match(dataMigration, /'bhaja-caves'/);
  assert.match(dataMigration, /'shivneri-fort'/);
  assert.match(dataMigration, /'karla-caves'/);
  assert.match(dataMigration, /'aga-khan-palace'/);
  assert.match(dataMigration, /'shaniwar-wada'/);
  assert.match(dataMigration, /'raigad-fort'/);
  assert.match(dataMigration, /'murud-janjira-fort'/);
  assert.match(addressMigration, /FROM heritage_catalog_membership membership[\s\S]*?NULLIF\(BTRIM\(h\.address\), ''\) IS NULL/);

  const addressUpdates = [...addressMigration.matchAll(/UPDATE heritage SET address='([^']+)'[\s\S]*?WHERE slug='([^']+)'/g)]
    .map(([, address, slug]) => ({ slug, address }));
  assert.deepEqual(addressUpdates.map(({ slug }) => slug), [
    "khajuraho-monuments", "konark-sun-temple", "red-fort", "taj-mahal", "hampi",
  ]);
  assert.match(addressMigration, /expected\(slug, name, state, district, category_slug\)/);
  assert.match(addressMigration, /h\.name IS DISTINCT FROM expected\.name/);
  assert.match(addressMigration, /h\.state IS DISTINCT FROM expected\.state/);
  assert.match(addressMigration, /category\.slug IS DISTINCT FROM expected\.category_slug/);
  assert.doesNotMatch(addressMigration, /WHERE id\s*=/i);
  assert.doesNotMatch(addressMigration, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(?:users|favorites|visited_places|reviews|journeys|journey_stops|heritage_sources)\b/i);

  assert.match(smoke, /sort\(\(left, right\) => left\.localeCompare\(right, "en", \{ numeric: true \}\)\)/);
  assert.match(smoke, /const localHosts = new Set\(\["localhost", "127\.0\.0\.1", "::1"\]\)/);
  assert.match(smoke, /process\.env\.NODE_ENV === "production" \|\| !localHosts\.has\(host\)/);
  assert.match(smoke, /await client\.query\(readSql\(path\.join\(databaseDirectory, "schema\.sql"\)\)\);[\s\S]*?await client\.query\(readSql\(path\.join\(databaseDirectory, "seed\.sql"\)\)\)/);
  assert.match(smoke, /async function applyNumberedMigrations\(client\)[\s\S]*?for \(const filename of listMigrations\(\)\)[\s\S]*?await client\.query\(readSql\(path\.join\(migrationsDirectory, filename\)\)\)/);
  assert.match(smoke, /runFreshInitialization/);
  assert.match(smoke, /runLegacyCompatibility/);
  assert.doesNotMatch(smoke, /\b(?:1169|1171|1199|1210|1212|1214|1220|1221|1263|1264|1267|1334)\b/);
  assert.match(smoke, /asi-aga-khan-palace-building-pune-pune-maharashtra-4137c6ffce/);
  assert.match(smoke, /await client\.query\("BEGIN"\)/);
  assert.match(smoke, /current_schema\(\)/);
  assert.match(smoke, /if \(transactionOpen\) await client\.query\("ROLLBACK"\)/);
  assert.match(smoke, /to_regnamespace\(\$1\) IS NULL AS fresh_rolled_back/);
  assert.match(canonicalSchema, /CREATE TABLE IF NOT EXISTS heritage_catalog_membership/);
  assert.match(canonicalSeed, /INSERT INTO heritage \(name,slug/);
});

test("public catalogue APIs filter to membership while personal records and the Elephanta review remain reachable", async (t) => {
  const originalQuery = pool.query;
  const originalSecret = process.env.JWT_SECRET;
  const secret = "selected-catalogue-isolated-test-secret-value";
  process.env.JWT_SECRET = secret;
  const calls = [];
  const selectedDetail = {
    id: 4,
    slug: "ajanta-caves",
    name: "Ajanta Caves",
    publication_status: "published",
    category: { id: 2, slug: "cave-rock-cut" },
    state: "Maharashtra",
    district: "Chhatrapati Sambhajinagar",
    latitude: 20.553111,
    longitude: 75.70025,
    coordinates_verified: true,
    media: [],
    timeline_events: [],
    artifacts: [],
    architectural_layers: [],
    sources: [],
  };
  const ensembleDetail = {
    ...selectedDetail,
    id: 22,
    slug: "mumbai-heritage-ensemble",
    name: "Victorian Gothic and Art Deco Ensembles of Mumbai",
    category: { id: 7, slug: "historic-urban" },
  };
  const media = [];

  pool.query = async (sql, values = []) => {
    const statement = String(sql);
    calls.push({ sql: statement, values });
    if (statement.includes("FROM users WHERE id = $1")) return { rows: [{ role: "user", status: "ACTIVE" }] };
    if (statement.includes("FROM heritage_slug_aliases")) return { rows: [{ id: null }] };
    if (statement.includes("FROM heritage_categories c")) return { rows: [{ id: 2, name: "Cave and rock-cut site", slug: "cave-rock-cut" }] };
    if (statement.includes("SELECT DISTINCT state")) return { rows: [{ state: "Maharashtra" }] };
    if (statement.includes("SELECT DISTINCT district")) return { rows: [{ district: "Chhatrapati Sambhajinagar" }] };
    if (statement.includes("SELECT COUNT(*) AS total")) {
      return { rows: [{ total: statement.includes("h.latitude IS NOT NULL") ? 8 : 30 }] };
    }
    if (statement.includes("selected_image.url AS image_url")) {
      return { rows: [{ ...selectedDetail, image_url: null, media }] };
    }
    if (statement.includes("TRUE AS coordinates_verified, selected_image.media")) {
      return { rows: [{ id: 4, slug: "ajanta-caves", name: "Ajanta Caves", state: "Maharashtra", district: "Chhatrapati Sambhajinagar", latitude: 20.553111, longitude: 75.70025, coordinates_verified: true, media }] };
    }
    if (statement.startsWith("WITH requested_record AS (")) {
      const recordId = Number(values[0]);
      const userId = values[1] === null ? null : Number(values[1]);
      if (recordId === 1169) return { rows: [selectedDetail] };
      if (recordId === 4) return { rows: [selectedDetail] };
      if (recordId === 22 && userId === 7) return { rows: [ensembleDetail] };
      return { rows: [] };
    }
    if (statement.includes("FROM favorites f") && statement.includes("selected_image")) {
      assert.equal(values[0], 7);
      assert.doesNotMatch(statement, /heritage_catalog_membership/);
      return { rows: [{ id: 22, slug: "mumbai-heritage-ensemble", name: ensembleDetail.name, state: "Maharashtra", district: "Mumbai City", category: ensembleDetail.category, media: [] }] };
    }
    if (statement.includes("SELECT id FROM heritage WHERE id = $1")) return { rows: [{ id: Number(values[0]) }] };
    if (statement.includes("SELECT r.id, r.heritage_id")) {
      assert.equal(values[0], 2);
      return { rows: [{ id: 5, heritage_id: 2, rating: 5, comment: "Existing review", author: { id: 9, name: "Reviewer" } }] };
    }
    if (statement.includes("AVG(rating)")) return { rows: [{ count: 1, average_rating: "5.0" }] };
    throw new Error(`Unexpected catalogue test query: ${statement.slice(0, 140)}`);
  };

  const app = express();
  app.use("/api", heritageRouter);
  app.use("/api", favoritesRouter);
  app.use("/api", reviewsRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const categories = await fetch(`${origin}/api/categories`).then((response) => response.json());
  assert.deepEqual(categories.categories.map((category) => category.slug), ["cave-rock-cut"]);

  const facets = await fetch(`${origin}/api/heritage-facets?state=Maharashtra`).then((response) => response.json());
  assert.deepEqual(facets.states, ["Maharashtra"]);
  assert.deepEqual(facets.districts, ["Chhatrapati Sambhajinagar"]);
  assert.ok(calls.filter((call) => call.sql.includes("SELECT DISTINCT")).every((call) => call.sql.includes("heritage_catalog_membership")));

  const list = await fetch(`${origin}/api/heritage`).then((response) => response.json());
  assert.equal(list.pagination.total, 30);
  const listSql = calls.find((call) => call.sql.includes("selected_image.url AS image_url")).sql;
  assert.match(listSql, /JOIN heritage_catalog_membership membership ON membership\.heritage_id = h\.id/);
  assert.match(listSql, /ORDER BY membership\.display_order ASC/);

  const map = await fetch(`${origin}/api/heritage-map`).then((response) => response.json());
  assert.equal(map.pagination.total, 8);
  assert.match(calls.find((call) => call.sql.includes("selected_image.media")).sql, /heritage_catalog_membership/);

  const selected = await fetch(`${origin}/api/heritage/4`).then((response) => response.json());
  assert.equal(selected.heritage.id, 4);
  const duplicate = await fetch(`${origin}/api/heritage/1169`).then((response) => response.json());
  assert.equal(duplicate.heritage.id, 4);
  const privateOutsideDetail = await fetch(`${origin}/api/heritage/22`);
  assert.equal(privateOutsideDetail.status, 404);

  const userToken = jwt.sign({}, secret, { algorithm: "HS256", subject: "7", expiresIn: "5m" });
  const ownedOutsideDetail = await fetch(`${origin}/api/heritage/22`, { headers: { Authorization: `Bearer ${userToken}` } }).then((response) => response.json());
  assert.equal(ownedOutsideDetail.heritage.id, 22);

  const favorites = await fetch(`${origin}/api/favorites`, { headers: { Authorization: `Bearer ${userToken}` } }).then((response) => response.json());
  assert.equal(favorites.favorites[0].heritage.id, 22, JSON.stringify({ favorites, lastQueries: calls.slice(-3).map((call) => call.sql.slice(0, 110)) }));
  const elephantaReviews = await fetch(`${origin}/api/heritage/2/reviews`).then((response) => response.json());
  assert.equal(elephantaReviews.reviews.length, 1);
  assert.equal(elephantaReviews.summary.count, 1);
});
