#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../config/db");

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const databaseDirectory = __dirname;
const migrationsDirectory = path.join(databaseDirectory, "migrations");
const freshAddedSlugs = [
  "chhatrapati-shivaji-maharaj-terminus", "gateway-of-india", "kanheri-caves",
  "pandavleni-caves", "bhaja-caves", "shivneri-fort", "karla-caves",
  "aga-khan-palace", "shaniwar-wada", "raigad-fort", "murud-janjira-fort",
  "daulatabad-fort", "bibi-ka-maqbara", "sinhagad-fort", "pratapgad-fort",
  "sindhudurg-fort", "vijaydurg-fort", "kalaram-temple", "deekshabhoomi",
  "qutub-minar-tower", "sanchi-stupa-1", "amer-fort",
];
const legacyNewPlaceSlugs = [
  "chhatrapati-shivaji-maharaj-terminus", "gateway-of-india", "kanheri-caves",
  "daulatabad-fort", "bibi-ka-maqbara", "sinhagad-fort", "pratapgad-fort",
  "sindhudurg-fort", "vijaydurg-fort", "kalaram-temple", "deekshabhoomi",
  "qutub-minar-tower", "sanchi-stupa-1", "amer-fort",
];

function readSql(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/^[\t ]*(?:BEGIN|COMMIT)[\t ]*;[\t ]*$/gim, "");
}

function listMigrations() {
  return fs.readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details === undefined ? "" : `: ${JSON.stringify(details)}`;
    throw new Error(`${message}${suffix}`);
  }
}

async function createIsolatedSchema(client, schema) {
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  const activeSchema = await client.query("SELECT current_schema() AS schema");
  assert(activeSchema.rows[0]?.schema === schema, "Could not isolate the temporary schema; refusing to run database scripts");
  await client.query(readSql(path.join(databaseDirectory, "schema.sql")));
  await client.query(readSql(path.join(databaseDirectory, "seed.sql")));
}

async function addLegacyFixture(client) {
  await client.query(`
    INSERT INTO heritage (
      name, slug, description, history, cultural_significance, architecture,
      historical_period, category_id, state, district, locality, address,
      publication_status
    )
    SELECT fixture.name, fixture.slug, 'Temporary legacy fixture.',
           'Temporary legacy fixture.', 'Temporary legacy fixture.',
           'Temporary legacy fixture.', 'Fixture', category.id,
           'Maharashtra', fixture.district, fixture.locality, fixture.address,
           'published'
      FROM (VALUES
        ('Pandav Lena Caves','asi-pandav-lena-caves-pathardi-nasik-maharashtra-023c1a32cd','Nasik','Pathardi','Pathardi, Nasik'),
        ('Cave temples and Inscriptions','asi-cave-temples-and-inscriptions-bhaja-pune-maharashtra-ececf3ce0a','Pune','Bhaja','Bhaja, Pune'),
        ('Fort of Shivneri','asi-fort-of-shivneri-junnar-pune-maharashtra-647780fb7f','Pune','Junnar','Junnar, Pune'),
        ('Cave Temples and inscriptions','asi-cave-temples-and-inscriptions-karla-pune-maharashtra-42c59f0637','Pune','Karla','Karla, Pune'),
        ('Aga Khan Palace Building','asi-aga-khan-palace-building-pune-pune-maharashtra-4137c6ffce','Pune','Pune','Pune, Maharashtra'),
        ('Old citadel known as Shanwar Wada','asi-old-citadel-known-as-shanwar-wada-pune-pune-maharashtra-578a826bc6','Pune','Pune','Pune, Maharashtra'),
        ('Fort of Raygad','asi-fort-of-raygad-rajpuri-raigad-maharashtra-9f363d1af5','Raigad','Rajpuri','Rajpuri, Raigad'),
        ('Janjira Fort','asi-janjira-fort-tala-raigad-maharashtra-823878abce','Raigad','Tala','Tala, Raigad'),
        ('Tala Fort','asi-tala-fort-vijaydurg-ratnagiri-maharashtra-f9c57be64a','Ratnagiri','Vijaydurg','Vijaydurg, Ratnagiri'),
        ('Fort at Pratapgad','asi-fort-at-pratapgad-ghogra-nagpur-maharashtra-fdf3d71f08','Nagpur','Ghogra','Ghogra, Nagpur')
      ) AS fixture(name, slug, district, locality, address)
      CROSS JOIN heritage_categories category
     WHERE category.slug='asi-protected'
  `);

  await client.query(`
    INSERT INTO heritage (
      name, slug, description, history, cultural_significance, architecture,
      historical_period, category_id, state, district, locality, address
    )
    SELECT duplicate.name, duplicate.slug, 'Temporary duplicate fixture.',
           'Temporary duplicate fixture.', 'Temporary duplicate fixture.',
           'Temporary duplicate fixture.', 'Fixture', category.id,
           'Maharashtra', duplicate.district, duplicate.locality,
           duplicate.locality || ', Maharashtra'
      FROM (VALUES
        ('Ajanta Caves','legacy-ajanta-duplicate-fixture','Aurangabad','Ajanta'),
        ('Ellora Caves','legacy-ellora-duplicate-fixture','Aurangabad','Ellora')
      ) AS duplicate(name, slug, district, locality)
      CROSS JOIN heritage_categories category
     WHERE category.slug='asi-protected'
  `);

  await client.query(`
    INSERT INTO heritage_sources (
      heritage_id, source_name, source_title, publisher, source_url,
      source_note, accessed_on, claims_supported, review_status
    )
    SELECT h.id, 'Fixture source', fixture.source_title, 'Fixture publisher',
           fixture.source_url, 'Preserve this review decision.',
           DATE '2026-10-12', ARRAY['location']::TEXT[], fixture.review_status
      FROM (VALUES
        ('asi-aga-khan-palace-building-pune-pune-maharashtra-4137c6ffce','https://maharashtratourism.gov.in/districts/pune/','Preserve pending title','pending'),
        ('asi-fort-of-shivneri-junnar-pune-maharashtra-647780fb7f','https://maharashtratourism.gov.in/fort/shivneri/','Preserve unreviewed title','unreviewed'),
        ('asi-fort-of-raygad-rajpuri-raigad-maharashtra-9f363d1af5','https://aai-portal.maharashtratourism.gov.in/tourist-intrests/forts/','Preserve rejected title','rejected')
      ) AS fixture(slug, source_url, source_title, review_status)
      JOIN heritage h ON h.slug=fixture.slug
  `);

  // This conflict exercises migration 004's source upsert and migration 005's
  // review-metadata DDL without allowing either to replace a reviewer decision.
  await client.query(`
    INSERT INTO heritage_sources (
      heritage_id, source_name, source_title, publisher, source_url,
      source_note, accessed_on, claims_supported, review_status
    )
    SELECT h.id, 'Fixture source', 'Preserve rejected UNESCO status',
           'Fixture publisher', 'https://whc.unesco.org/en/list/242/',
           'Existing reviewed source fixture.', DATE '2026-10-12',
           ARRAY['coordinates']::TEXT[], 'rejected'
      FROM heritage h WHERE h.slug='ajanta-caves'
    ON CONFLICT (heritage_id, source_url) DO UPDATE
      SET source_title=EXCLUDED.source_title,
          review_status=EXCLUDED.review_status
  `);
  await client.query(`
    INSERT INTO heritage_sources (
      heritage_id, source_name, source_title, publisher, source_url,
      source_note, accessed_on, claims_supported, review_status
    )
    SELECT h.id, 'Fixture source', 'Keep unreviewed coordinate claim',
           'Fixture publisher', 'https://fixture.invalid/ajanta-coordinate-review',
           'Must remain unreviewed.', DATE '2026-10-12',
           ARRAY['coordinates']::TEXT[], 'unreviewed'
      FROM heritage h WHERE h.slug='ajanta-caves'
  `);

  const ajantaDuplicate = await client.query("SELECT id FROM heritage WHERE slug='legacy-ajanta-duplicate-fixture'");
  assert(ajantaDuplicate.rows.length === 1, "Legacy Ajanta duplicate fixture was not inserted");
  await client.query(
    `INSERT INTO heritage_media (heritage_id, media_type, url, alt_text, provider)
     VALUES ($1, 'image', 'https://fixture.invalid/legacy-ajanta.jpg', 'Legacy duplicate fixture image', 'manual')`,
    [ajantaDuplicate.rows[0].id],
  );
  await client.query(
    `INSERT INTO heritage_sources (
       heritage_id, source_name, source_title, publisher, source_url,
       source_note, accessed_on, claims_supported, review_status
     ) VALUES ($1, 'Fixture ASI citation', 'Retain duplicate citation',
       'Fixture publisher', 'https://fixture.invalid/legacy-ajanta-source',
       'Duplicate child-row integrity fixture.', DATE '2026-10-12',
       ARRAY['location']::TEXT[], 'pending')`,
    [ajantaDuplicate.rows[0].id],
  );

  const account = await client.query(
    `INSERT INTO users (name, email, password_hash) VALUES ('Smoke Fixture', 'smoke-fixture@example.invalid', 'fixture-hash') RETURNING id`,
  );
  const legacyPlace = await client.query("SELECT id FROM heritage WHERE slug='asi-aga-khan-palace-building-pune-pune-maharashtra-4137c6ffce'");
  assert(legacyPlace.rows.length === 1, "Legacy user-data fixture target is missing");
  const userId = account.rows[0].id;
  const heritageId = legacyPlace.rows[0].id;
  await client.query("INSERT INTO favorites (user_id, heritage_id) VALUES ($1, $2)", [userId, heritageId]);
  await client.query("INSERT INTO visited_places (user_id, heritage_id) VALUES ($1, $2)", [userId, heritageId]);
  await client.query("INSERT INTO reviews (user_id, heritage_id, rating, comment) VALUES ($1, $2, 5, 'Fixture review')", [userId, heritageId]);
  const journey = await client.query("INSERT INTO journeys (user_id, name) VALUES ($1, 'Fixture journey') RETURNING id", [userId]);
  await client.query(
    "INSERT INTO journey_stops (journey_id, heritage_id, stop_order, notes) VALUES ($1, $2, 1, 'Fixture stop')",
    [journey.rows[0].id, heritageId],
  );
  return { userId, heritageId, journeyId: journey.rows[0].id };
}

async function applyNumberedMigrations(client) {
  const applied = [];
  for (const filename of listMigrations()) {
    if (filename === "004_add_unesco_verified_coordinates.sql") {
      await client.query("DROP TABLE IF EXISTS pg_temp.verified_unesco_coordinates");
    }
    await client.query(readSql(path.join(migrationsDirectory, filename)));
    applied.push(filename);
  }
  return applied;
}

async function assertImagePipeline(client) {
  await client.query(readSql(path.join(migrationsDirectory, "006_wikimedia_image_acquisition.sql")));
  const sample = await client.query("SELECT id FROM heritage ORDER BY id LIMIT 1");
  assert(sample.rows.length > 0, "Seed did not provide a heritage row for image uniqueness checks");
  const sampleId = sample.rows[0].id;
  const filename = "migration-smoke-duplicate.jpg";
  await client.query(
    `INSERT INTO heritage_media (heritage_id, media_type, url, provider, wikimedia_filename)
     VALUES ($1, 'image', 'https://upload.wikimedia.org/wikipedia/commons/a/one.jpg', 'wikimedia', $2)
     ON CONFLICT DO NOTHING`,
    [sampleId, filename],
  );
  await client.query(
    `INSERT INTO heritage_media (heritage_id, media_type, url, provider, wikimedia_filename)
     VALUES ($1, 'image', 'https://upload.wikimedia.org/wikipedia/commons/b/two.jpg', 'wikimedia', $2)
     ON CONFLICT DO NOTHING`,
    [sampleId, filename],
  );
  const duplicate = await client.query(
    "SELECT COUNT(*)::INTEGER AS total FROM heritage_media WHERE heritage_id=$1 AND provider='wikimedia' AND wikimedia_filename=$2",
    [sampleId, filename],
  );
  assert(duplicate.rows[0]?.total === 1, "Wikimedia filename uniqueness did not prevent a duplicate asset");
}

async function runFreshInitialization(client, schema) {
  await createIsolatedSchema(client, schema);
  const seedBaseline = await client.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM heritage) AS heritage,
      (SELECT COUNT(*)::INTEGER FROM heritage_sources) AS sources,
      (SELECT COUNT(*)::INTEGER FROM users) AS users
  `);
  assert(seedBaseline.rows[0].heritage > 0 && seedBaseline.rows[0].sources > 0 && seedBaseline.rows[0].users === 0,
    "Canonical seed baseline differs from expected fresh-database data", seedBaseline.rows[0]);

  const applied = await applyNumberedMigrations(client);
  await assertImagePipeline(client);

  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership) AS members,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_aliases) AS duplicate_aliases,
      (SELECT COUNT(*)::INTEGER FROM heritage_slug_aliases) AS slug_aliases,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership member
        JOIN heritage h ON h.id=member.heritage_id
        WHERE h.slug=ANY($1::TEXT[])) AS newly_added,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership member
        JOIN heritage h ON h.id=member.heritage_id
        WHERE NULLIF(BTRIM(h.address),'') IS NOT NULL) AS addressed,
      (SELECT COUNT(DISTINCT h.id)::INTEGER FROM heritage_catalog_membership member
        JOIN heritage h ON h.id=member.heritage_id
        JOIN heritage_sources source ON source.heritage_id=h.id
        WHERE NULLIF(BTRIM(source.source_url),'') IS NOT NULL) AS sourced,
      (SELECT COUNT(*)::INTEGER FROM users) AS users,
      (SELECT COUNT(*)::INTEGER FROM users WHERE role='admin') AS admins
  `, [freshAddedSlugs]);
  const catalogue = result.rows[0];
  assert(catalogue.members === 30 && catalogue.duplicate_aliases === 0 && catalogue.slug_aliases === 0,
    "Fresh catalogue membership/alias totals are wrong", catalogue);
  assert(catalogue.newly_added === freshAddedSlugs.length && catalogue.addressed === 30 && catalogue.sourced === 30,
    "Fresh selected records are missing, unaddressed, or unsourced", catalogue);
  assert(catalogue.users === 0 && catalogue.admins === 0,
    "Canonical seed unexpectedly created accounts", catalogue);

  const review = await client.query(`
    SELECT
      (SELECT source.review_status FROM heritage_sources source JOIN heritage h ON h.id=source.heritage_id
       WHERE h.slug='chhatrapati-shivaji-maharaj-terminus' AND source.source_url='https://whc.unesco.org/en/list/945/') AS new_source_status,
      (SELECT source.review_status FROM heritage_sources source JOIN heritage h ON h.id=source.heritage_id
       WHERE h.slug='chhatrapati-shivaji-maharaj-terminus' AND source.source_url='https://whc.unesco.org/en/list/945/maps/') AS map_status,
      (SELECT source.review_status FROM heritage_sources source JOIN heritage h ON h.id=source.heritage_id
       WHERE h.slug='ajanta-caves' AND source.source_url='https://whc.unesco.org/en/list/242/') AS unesco_coordinate_status
  `);
  assert(review.rows[0].new_source_status === "pending" && review.rows[0].map_status === "approved" &&
    review.rows[0].unesco_coordinate_status === "unreviewed",
  "Fresh source review states do not follow the explicit evidence/review rules", review.rows[0]);
  return { ...catalogue, migrations: applied, review_states: review.rows[0] };
}

async function runLegacyCompatibility(client, schema) {
  await createIsolatedSchema(client, schema);
  const userData = await addLegacyFixture(client);
  const applied = await applyNumberedMigrations(client);
  await assertImagePipeline(client);

  const catalogueResult = await client.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership) AS members,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_aliases) AS duplicate_aliases,
      (SELECT COUNT(*)::INTEGER FROM heritage_slug_aliases) AS slug_aliases,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership member
        JOIN heritage h ON h.id=member.heritage_id
        WHERE h.slug=ANY($1::TEXT[])) AS added_places,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership member
        JOIN heritage h ON h.id=member.heritage_id
        WHERE h.slug IN ('asi-fort-at-pratapgad-ghogra-nagpur-maharashtra-fdf3d71f08',
                         'asi-tala-fort-vijaydurg-ratnagiri-maharashtra-f9c57be64a',
                         'qutb-minar','sanchi-buddhist-monuments')) AS excluded_nonselected,
      (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership member
        JOIN heritage h ON h.id=member.heritage_id
        WHERE NULLIF(BTRIM(h.address),'') IS NOT NULL) AS addressed
  `, [legacyNewPlaceSlugs]);
  const catalogue = catalogueResult.rows[0];
  assert(catalogue.members === 30 && catalogue.duplicate_aliases === 2 && catalogue.slug_aliases === 8,
    "Legacy catalogue membership or aliases differ from expected compatibility behavior", catalogue);
  assert(catalogue.added_places === 14 && catalogue.excluded_nonselected === 0 && catalogue.addressed === 30,
    "Legacy selected catalogue did not preserve the reviewed identity boundaries", catalogue);

  const reviewResult = await client.query(`
    SELECT
      (SELECT s.review_status FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='aga-khan-palace' AND s.source_url='https://maharashtratourism.gov.in/districts/pune/') AS aga_status,
      (SELECT s.source_title FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='aga-khan-palace' AND s.source_url='https://maharashtratourism.gov.in/districts/pune/') AS aga_title,
      (SELECT s.review_status FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='shivneri-fort' AND s.source_url='https://maharashtratourism.gov.in/fort/shivneri/') AS shivneri_status,
      (SELECT s.source_title FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='shivneri-fort' AND s.source_url='https://maharashtratourism.gov.in/fort/shivneri/') AS shivneri_title,
      (SELECT s.review_status FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='raigad-fort' AND s.source_url='https://aai-portal.maharashtratourism.gov.in/tourist-intrests/forts/') AS raigad_status,
      (SELECT s.review_status FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='ajanta-caves' AND s.source_url='https://whc.unesco.org/en/list/242/') AS unesco_status,
      (SELECT s.review_status FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='ajanta-caves' AND s.source_url='https://fixture.invalid/ajanta-coordinate-review') AS review_metadata_status,
      (SELECT s.review_status FROM heritage_sources s JOIN heritage h ON h.id=s.heritage_id
       WHERE h.slug='gateway-of-india' AND s.source_url='https://aai-portal.maharashtratourism.gov.in/spotlights/the-gateway-of-india/') AS new_source_status
  `);
  const review = reviewResult.rows[0];
  assert(review.aga_status === "pending" && review.aga_title === "Preserve pending title" &&
    review.shivneri_status === "unreviewed" && review.shivneri_title === "Preserve unreviewed title" &&
    review.raigad_status === "rejected" && review.unesco_status === "rejected" &&
    review.review_metadata_status === "unreviewed" && review.new_source_status === "pending",
  "A migration changed or auto-approved an existing source-review decision", review);

  const integrityResult = await client.query(`
    SELECT
      h.id AS heritage_id,
      h.slug,
      (SELECT COUNT(*)::INTEGER FROM favorites WHERE user_id=$1 AND heritage_id=h.id) AS favorites,
      (SELECT COUNT(*)::INTEGER FROM visited_places WHERE user_id=$1 AND heritage_id=h.id) AS visits,
      (SELECT COUNT(*)::INTEGER FROM reviews WHERE user_id=$1 AND heritage_id=h.id) AS reviews,
      (SELECT COUNT(*)::INTEGER FROM journey_stops stop JOIN journeys journey ON journey.id=stop.journey_id
        WHERE journey.id=$2 AND stop.heritage_id=h.id) AS journey_stops,
      (SELECT COUNT(*)::INTEGER FROM heritage_media media JOIN heritage alias_site ON alias_site.id=media.heritage_id
        WHERE alias_site.slug='legacy-ajanta-duplicate-fixture') AS duplicate_media,
      (SELECT COUNT(*)::INTEGER FROM heritage_sources source JOIN heritage alias_site ON alias_site.id=source.heritage_id
        WHERE alias_site.slug='legacy-ajanta-duplicate-fixture' AND source.review_status='pending') AS duplicate_sources
    FROM heritage h WHERE h.slug='aga-khan-palace'
  `, [userData.userId, userData.journeyId]);
  const integrity = integrityResult.rows[0];
  assert(integrity.heritage_id === userData.heritageId && integrity.slug === "aga-khan-palace" &&
    integrity.favorites === 1 && integrity.visits === 1 && integrity.reviews === 1 &&
    integrity.journey_stops === 1 && integrity.duplicate_media === 1 && integrity.duplicate_sources === 1,
  "Legacy user data or duplicate child rows were not preserved", integrity);

  const aliases = await client.query(`
    SELECT canonical.slug AS canonical_slug, alias_site.name, alias_site.locality
    FROM heritage_catalog_aliases alias
    JOIN heritage alias_site ON alias_site.id=alias.alias_heritage_id
    JOIN heritage canonical ON canonical.id=alias.canonical_heritage_id
    ORDER BY canonical.slug
  `);
  assert(aliases.rows.length === 2 && aliases.rows[0].canonical_slug === "ajanta-caves" &&
    aliases.rows[1].canonical_slug === "ellora-caves",
  "Legacy duplicate aliases do not resolve by natural identity", aliases.rows);

  return { ...catalogue, review_states: review, user_data_integrity: integrity, migrations: applied };
}

async function runRollbackFixture(client, schema, label, callback) {
  await client.query(`SAVEPOINT ${label}`);
  try {
    return await callback(client, schema);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${label}`);
    await client.query(`RELEASE SAVEPOINT ${label}`);
  }
}

async function main() {
  const host = String(pool.options.host || "").toLowerCase();
  if (process.env.NODE_ENV === "production" || !localHosts.has(host)) {
    await pool.end();
    throw new Error("Migration smoke checks only run against a local, non-production database.");
  }

  const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const freshSchema = `hv_fresh_smoke_${suffix}`;
  const legacySchema = `hv_legacy_smoke_${suffix}`;
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const fresh = await runRollbackFixture(client, freshSchema, "fresh_initialization", runFreshInitialization);
    const legacy = await runRollbackFixture(client, legacySchema, "legacy_compatibility", runLegacyCompatibility);

    await client.query("ROLLBACK");
    transactionOpen = false;
    const rollback = await client.query(
      "SELECT to_regnamespace($1) IS NULL AS fresh_rolled_back, to_regnamespace($2) IS NULL AS legacy_rolled_back",
      [freshSchema, legacySchema],
    );
    assert(rollback.rows[0]?.fresh_rolled_back && rollback.rows[0]?.legacy_rolled_back,
      "Smoke schemas remained after transaction rollback", rollback.rows[0]);

    console.log(JSON.stringify({
      status: "PASS",
      database_access: "loopback only; no remote database connection attempted",
      initialization_order: ["schema.sql", "seed.sql", ...listMigrations()],
      fresh_path: {
        status: "PASS",
        selected_places: fresh.members,
        newly_added_places: fresh.newly_added,
        duplicate_aliases: fresh.duplicate_aliases,
        preserved_slug_aliases: fresh.slug_aliases,
        addressed_places: fresh.addressed,
        sourced_places: fresh.sourced,
        source_review_states: fresh.review_states,
      },
      legacy_path: {
        status: "PASS; fixtures use generated IDs and natural slugs, separate from the fresh path",
        selected_places: legacy.members,
        legacy_variant_rows_corrected: legacy.slug_aliases,
        newly_added_places: legacy.added_places,
        duplicate_aliases: legacy.duplicate_aliases,
        addressed_places: legacy.addressed,
        source_review_states: legacy.review_states,
        user_data_integrity: "favorites, visits, reviews, journeys, and journey stops retained",
      },
      image_pipeline: "PASS; repeat migration and duplicate-asset uniqueness check passed in both fixtures",
      rollback: "PASS; both isolated schemas were removed by rollback",
    }, null, 2));
  } finally {
    if (transactionOpen) await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  const code = error?.code || "unknown";
  const detail = error?.code === "P0001" || error?.code === "42P07" ? `: ${error.message}` : "";
  console.error(`Migration smoke check failed: ${code}${detail}`);
  process.exitCode = 1;
});
