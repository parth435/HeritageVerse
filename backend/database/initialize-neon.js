#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { createDatabasePoolOptions } = require("../config/database-options");

const DATABASE_NAME = "heritageversedb";
const DATABASE_URL_ENV = "HERITAGEVERSE_NEON_DATABASE_URL";
const MIGRATION_COUNT = 15;
const DATABASE_DIR = __dirname;
const MIGRATIONS_DIR = path.join(DATABASE_DIR, "migrations");

const IDENTITY_SQL = `
  SELECT current_database() AS database_name,
         current_schema() AS schema_name,
         current_setting('search_path') AS search_path
`;

const RELATIONS_SQL = `
  SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind AS relation_kind
    FROM pg_catalog.pg_namespace n
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
   WHERE n.nspname <> 'information_schema'
     AND n.nspname NOT IN ('pg_catalog', 'pg_toast')
     AND n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
     AND (n.nspname <> 'public' OR c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'i', 'I', 'c'))
   ORDER BY n.nspname, c.relname
`;

const REQUIRED_COLUMNS = [
  ["users", "id"], ["users", "name"], ["users", "email"], ["users", "password_hash"], ["users", "role"], ["users", "status"],
  ["heritage_categories", "id"], ["heritage_categories", "slug"],
  ["heritage", "id"], ["heritage", "name"], ["heritage", "slug"], ["heritage", "description"], ["heritage", "history"],
  ["heritage", "cultural_significance"], ["heritage", "architecture"], ["heritage", "historical_period"], ["heritage", "category_id"],
  ["heritage", "state"], ["heritage", "country"], ["heritage", "district"], ["heritage", "locality"], ["heritage", "address"],
  ["heritage", "latitude"], ["heritage", "longitude"], ["heritage", "publication_status"],
  ["heritage_catalog_membership", "heritage_id"], ["heritage_catalog_membership", "catalogue_key"], ["heritage_catalog_membership", "display_order"],
  ["heritage_catalog_aliases", "alias_heritage_id"], ["heritage_catalog_aliases", "canonical_heritage_id"],
  ["heritage_slug_aliases", "slug_alias"], ["heritage_slug_aliases", "heritage_id"],
  ["heritage_sources", "heritage_id"], ["heritage_sources", "source_name"], ["heritage_sources", "source_title"],
  ["heritage_sources", "publisher"], ["heritage_sources", "source_url"], ["heritage_sources", "claims_supported"],
  ["heritage_sources", "review_status"],
  ["heritage_media", "id"], ["heritage_media", "heritage_id"], ["heritage_media", "media_type"], ["heritage_media", "url"],
  ["heritage_media", "alt_text"], ["heritage_media", "credit"], ["heritage_media", "license"], ["heritage_media", "source_url"],
  ["heritage_media", "creator"], ["heritage_media", "license_url"], ["heritage_media", "verification_status"],
  ["heritage_media", "is_illustrative"], ["heritage_media", "thumbnail_url"], ["heritage_media", "provider"],
  ["heritage_media", "wikimedia_filename"], ["heritage_media", "match_confidence"],
  ["heritage_image_acquisition", "heritage_id"], ["heritage_image_acquisition", "status"], ["heritage_image_acquisition", "candidates"],
  ["heritage_entity_matches", "heritage_id"], ["heritage_entity_matches", "status"],
  ["heritage_provider_cache", "cache_key"], ["heritage_provider_cache", "response"], ["heritage_provider_cache", "expires_at"],
  ["heritage_timeline_events", "heritage_id"], ["heritage_artifacts", "heritage_id"], ["heritage_architectural_layers", "heritage_id"],
  ["favorites", "user_id"], ["favorites", "heritage_id"], ["visited_places", "user_id"], ["visited_places", "heritage_id"],
  ["reviews", "user_id"], ["reviews", "heritage_id"], ["journeys", "user_id"], ["journey_stops", "journey_id"],
  ["journey_stops", "heritage_id"], ["stories", "id"], ["activity_logs", "id"],
];

const REQUIRED_COLUMNS_SQL = `
  WITH required(table_name, column_name) AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(table_name TEXT, column_name TEXT)
  )
  SELECT required.table_name, required.column_name
    FROM required
    LEFT JOIN information_schema.columns column_info
      ON column_info.table_schema = current_schema()
     AND column_info.table_name = required.table_name
     AND column_info.column_name = required.column_name
   WHERE column_info.column_name IS NULL
   ORDER BY required.table_name, required.column_name
`;

const CATALOGUE_COUNTS_SQL = `
  SELECT
    COUNT(*)::INTEGER AS selected_member_count,
    COUNT(*) FILTER (WHERE h.state = 'Maharashtra' AND h.publication_status = 'published')::INTEGER AS published_maharashtra_count,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(h.address), '') IS NOT NULL)::INTEGER AS addressed_count,
    COUNT(*) FILTER (WHERE h.country = 'India')::INTEGER AS india_country_count,
    COUNT(DISTINCT h.id) FILTER (WHERE EXISTS (
      SELECT 1 FROM heritage_sources source
       WHERE source.heritage_id = h.id
         AND NULLIF(BTRIM(source.source_title), '') IS NOT NULL
         AND NULLIF(BTRIM(source.publisher), '') IS NOT NULL
         AND NULLIF(BTRIM(source.source_url), '') IS NOT NULL
         AND cardinality(source.claims_supported) > 0
    ))::INTEGER AS members_with_citation_metadata
  FROM heritage_catalog_membership membership
  JOIN heritage h ON h.id = membership.heritage_id
`;

const MEDIA_COUNTS_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE media.media_type = 'image')::INTEGER AS all_image_records,
    COUNT(*) FILTER (WHERE media.media_type = 'image'
      AND media.verification_status = 'verified' AND media.is_illustrative = FALSE)::INTEGER AS all_verified_photographs,
    COUNT(*) FILTER (WHERE media.media_type = 'image' AND membership.heritage_id IS NOT NULL)::INTEGER AS catalogue_image_records,
    COUNT(*) FILTER (WHERE media.media_type = 'image' AND membership.heritage_id IS NOT NULL
      AND media.verification_status = 'verified' AND media.is_illustrative = FALSE)::INTEGER AS catalogue_verified_photographs
  FROM heritage_media media
  LEFT JOIN heritage_catalog_membership membership ON membership.heritage_id = media.heritage_id
`;

function validateNeonHost(hostname, label = "Neon hostname") {
  if (typeof hostname !== "string") throw new Error(`${label} is required.`);
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(host) || /(^|-)pooler(\.|-|$)/.test(host)) {
    throw new Error(`${label} must be a direct Neon PostgreSQL endpoint hostname (not a pooler, localhost, or another provider).`);
  }
  return host;
}

function validateConnectionTarget(connectionString, expectedHost) {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new Error(`${DATABASE_URL_ENV} must be set.`);
  }
  const pinnedHost = validateNeonHost(expectedHost, "--expected-host");
  let url;
  try {
    url = new URL(connectionString.trim());
  } catch {
    throw new Error(`${DATABASE_URL_ENV} must be a valid PostgreSQL connection URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol.toLowerCase()) || !url.hostname || !url.username || !url.password) {
    throw new Error(`${DATABASE_URL_ENV} must include PostgreSQL scheme, Neon host, username, password, and database name.`);
  }
  if (url.hash) throw new Error(`${DATABASE_URL_ENV} must not contain a URL fragment.`);

  const hostname = validateNeonHost(url.hostname, `${DATABASE_URL_ENV} hostname`);
  if (hostname !== pinnedHost) throw new Error("Connection hostname does not match the explicitly pinned --expected-host.");
  if (url.port && url.port !== "5432") throw new Error("The direct Neon endpoint must use PostgreSQL port 5432.");

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new Error(`${DATABASE_URL_ENV} contains an invalid database name.`);
  }
  if (databaseName !== DATABASE_NAME || url.pathname.slice(1).includes("/")) {
    throw new Error(`The Neon database name must be exactly '${DATABASE_NAME}'.`);
  }

  let databaseOptions;
  try {
    databaseOptions = createDatabasePoolOptions({
      NODE_ENV: "production",
      DATABASE_URL: connectionString.trim(),
    });
  } catch {
    throw new Error(`${DATABASE_URL_ENV} has invalid or insecure PostgreSQL TLS options.`);
  }

  return {
    host: hostname,
    databaseName,
    clientOptions: {
      connectionString: databaseOptions.connectionString,
      host: databaseOptions.host,
      port: databaseOptions.port,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 10_000,
      application_name: "heritageverse-one-time-initializer",
    },
  };
}

function getInitializationSqlFiles(databaseDir = DATABASE_DIR) {
  const migrationDir = path.join(databaseDir, "migrations");
  const files = [path.join(databaseDir, "schema.sql"), path.join(databaseDir, "seed.sql")];
  const migrationNames = fs.readdirSync(migrationDir);

  for (let number = 1; number <= MIGRATION_COUNT; number += 1) {
    const prefix = String(number).padStart(3, "0");
    const matches = migrationNames.filter((name) => new RegExp(`^${prefix}_.+\\.sql$`).test(name));
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one migration numbered ${prefix}; found ${matches.length}.`);
    }
    files.push(path.join(migrationDir, matches[0]));
  }
  return files;
}

function assertPgScriptFile(filename, sql) {
  if (typeof sql !== "string" || !sql.trim()) throw new Error(`${filename} is empty or unreadable.`);
  const lines = sql.split(/\r?\n/);
  const transactionCommands = lines
    .map((line) => line.match(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/i)?.[1]?.toUpperCase())
    .filter(Boolean);
  if (transactionCommands.length !== 2 || transactionCommands[0] !== "BEGIN" || transactionCommands[1] !== "COMMIT") {
    throw new Error(`${filename} must preserve one BEGIN/COMMIT transaction boundary.`);
  }
  if (lines.some((line) => /^\s*\\[A-Za-z]/.test(line))) {
    throw new Error(`${filename} contains a psql-only meta-command and cannot be sent through node-postgres.`);
  }
  if (lines.some((line) => /^\s*COPY\s/i.test(line))) {
    throw new Error(`${filename} contains COPY input, which is not compatible with this whole-file node-postgres executor.`);
  }
}

function getErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "unknown";
}

async function verifyEmptyTarget(client) {
  await client.query("BEGIN TRANSACTION READ ONLY");
  try {
    const identity = await client.query(IDENTITY_SQL);
    const row = identity.rows?.[0];
    if (!row || row.database_name !== DATABASE_NAME || row.schema_name !== "public") {
      throw new Error("The connected Neon database or current schema does not match the required target.");
    }

    const relations = await client.query(RELATIONS_SQL);
    if (relations.rows?.length) {
      const examples = relations.rows.slice(0, 5).map((relation) => relation.relation_name
        ? `${relation.schema_name}.${relation.relation_name}`
        : `${relation.schema_name} (non-default schema)`);
      throw new Error(`Initialization refused: the database already contains non-system relations or schemas (${examples.join(", ")}).`);
    }
    await client.query("COMMIT");
    return { databaseName: row.database_name, schemaName: row.schema_name, searchPath: row.search_path };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve the original preflight error */ }
    throw error;
  }
}

function toCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : -1;
}

async function verifyInitializedDatabase(client) {
  await client.query("BEGIN TRANSACTION READ ONLY");
  try {
    const missingColumns = await client.query(REQUIRED_COLUMNS_SQL, [JSON.stringify(
      REQUIRED_COLUMNS.map(([table_name, column_name]) => ({ table_name, column_name })),
    )]);
    if (missingColumns.rows?.length) {
      const missing = missingColumns.rows.map((column) => `${column.table_name}.${column.column_name}`);
      throw new Error(`Post-initialization schema check failed; missing required columns: ${missing.join(", ")}.`);
    }

    const catalogueResult = await client.query(CATALOGUE_COUNTS_SQL);
    const rawCatalogue = catalogueResult.rows?.[0] || {};
    const catalogue = {
      selectedMembers: toCount(rawCatalogue.selected_member_count),
      publishedMaharashtraMembers: toCount(rawCatalogue.published_maharashtra_count),
      withAddresses: toCount(rawCatalogue.addressed_count),
      countryIndia: toCount(rawCatalogue.india_country_count),
      withCitationMetadata: toCount(rawCatalogue.members_with_citation_metadata),
    };
    const failedCatalogueChecks = Object.entries(catalogue)
      .filter(([, value]) => value !== 30)
      .map(([name, value]) => `${name}=${value}`);
    if (failedCatalogueChecks.length) {
      throw new Error(`Post-initialization catalogue check failed: ${failedCatalogueChecks.join(", ")}.`);
    }

    const mediaResult = await client.query(MEDIA_COUNTS_SQL);
    const rawMedia = mediaResult.rows?.[0] || {};
    const media = {
      allImageRecords: toCount(rawMedia.all_image_records),
      allVerifiedPhotographs: toCount(rawMedia.all_verified_photographs),
      catalogueImageRecords: toCount(rawMedia.catalogue_image_records),
      catalogueVerifiedPhotographs: toCount(rawMedia.catalogue_verified_photographs),
    };
    if (Object.values(media).some((count) => count < 0)) {
      throw new Error("Post-initialization media count check returned an invalid result.");
    }

    await client.query("COMMIT");
    return { catalogue, media };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve the original verification error */ }
    throw error;
  }
}

async function runInitialization({
  connectionString,
  expectedHost,
  confirm,
  createClient = (options) => new Client(options),
  sqlFiles = getInitializationSqlFiles(),
  readSql = (filename) => fs.readFileSync(filename, "utf8"),
  logger = console,
}) {
  const target = validateConnectionTarget(connectionString, expectedHost);
  const client = createClient(target.clientOptions);
  let connected = false;

  try {
    await client.connect();
    connected = true;
    logger.log(`Read-only preflight: checking pinned Neon target ${target.host}/${target.databaseName}.`);
    const identity = await verifyEmptyTarget(client);
    logger.log(`Read-only preflight passed: ${identity.databaseName}, schema ${identity.schemaName}, no non-system relations.`);
    logger.log("Review: migration 013 removes only interim catalogue-membership rows created by migration 009; preflight found no pre-existing relations.");

    if (typeof confirm !== "function" || !(await confirm({ host: target.host, databaseName: target.databaseName }))) {
      throw new Error("Initialization cancelled; no SQL files were executed.");
    }

    for (const filename of sqlFiles) {
      const sql = readSql(filename);
      assertPgScriptFile(path.basename(filename), sql);
      try {
        // Send each complete file as one simple-query request. Do not split SQL;
        // PostgreSQL dollar-quoted blocks and each file's transaction remain intact.
        await client.query(sql);
      } catch (error) {
        const wrapped = new Error(`Initialization stopped at ${path.basename(filename)} (PostgreSQL error ${getErrorCode(error)}). No retry was attempted.`);
        wrapped.failedFilename = path.basename(filename);
        wrapped.postgresCode = getErrorCode(error);
        throw wrapped;
      }
      logger.log(`Applied ${path.basename(filename)}.`);
    }

    let verification;
    try {
      verification = await verifyInitializedDatabase(client);
    } catch (error) {
      const wrapped = new Error(`SQL files completed, but read-only post-initialization verification failed: ${error.message} No automatic retry was attempted.`);
      wrapped.postgresCode = getErrorCode(error);
      throw wrapped;
    }
    return { target: { host: target.host, databaseName: target.databaseName }, ...verification };
  } finally {
    if (connected) {
      try { await client.end(); } catch { /* do not replace the initialization result with connection-close noise */ }
    }
  }
}

function parseArguments(argv) {
  let expectedHost = "";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--expected-host" && argv[index + 1]) {
      expectedHost = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--help" || argv[index] === "-h") {
      return { help: true };
    } else {
      throw new Error("Usage: node backend/database/initialize-neon.js --expected-host <direct-neon-host>");
    }
  }
  if (!expectedHost) throw new Error("--expected-host is required; copy the direct endpoint hostname from the intended Neon project.");
  return { expectedHost };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArguments(argv);
  if (args.help) {
    console.log("Usage: node backend/database/initialize-neon.js --expected-host <direct-neon-host>");
    console.log(`Requires ${DATABASE_URL_ENV} in the process environment. The utility never reads backend/.env.`);
    return;
  }
  const connectionString = env[DATABASE_URL_ENV];
  if (!connectionString) throw new Error(`${DATABASE_URL_ENV} must be set securely in the process environment.`);

  const result = await runInitialization({
    connectionString,
    expectedHost: args.expectedHost,
    confirm: async ({ databaseName }) => {
      const readline = require("node:readline/promises");
      const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await prompt.question(`Type INITIALIZE ${databaseName} to execute the SQL files on the empty Neon database: `);
        return answer.trim() === `INITIALIZE ${databaseName}`;
      } finally {
        prompt.close();
      }
    },
  });
  console.log("Initialization and read-only checks completed:");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DATABASE_NAME,
  DATABASE_URL_ENV,
  REQUIRED_COLUMNS,
  assertPgScriptFile,
  getInitializationSqlFiles,
  parseArguments,
  runInitialization,
  validateConnectionTarget,
  validateNeonHost,
  verifyEmptyTarget,
  verifyInitializedDatabase,
};
