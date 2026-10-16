"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  DATABASE_NAME,
  assertPgScriptFile,
  getInitializationSqlFiles,
  runInitialization,
  validateConnectionTarget,
  validateNeonHost,
} = require("../database/initialize-neon");

const neonHost = "ep-quiet-forest-123456.us-east-2.aws.neon.tech";
const expectedDatabaseName = "heritageversedb";
const connectionString = `postgresql://heritage_user:secret-value@${neonHost}/${expectedDatabaseName}?sslmode=require`;

function loggerStub() {
  return { log() {} };
}

function createFakeClient({ relations = [], failOnSql = "" } = {}) {
  const queries = [];
  let readOnlyTransactions = 0;
  return {
    queries,
    async connect() {},
    async end() {},
    async query(sql, values) {
      const text = String(sql);
      queries.push({ text, values });
      if (text === "BEGIN TRANSACTION READ ONLY") {
        readOnlyTransactions += 1;
        return { rows: [] };
      }
      if (text.includes("current_database() AS database_name")) {
        return { rows: [{ database_name: expectedDatabaseName, schema_name: "public", search_path: '"$user", public' }] };
      }
      if (text.includes("FROM pg_catalog.pg_namespace")) return { rows: relations };
      if (text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
      if (failOnSql && text.includes(failOnSql)) {
        const error = new Error("simulated PostgreSQL error");
        error.code = "42601";
        throw error;
      }
      if (text.includes("jsonb_to_recordset")) return { rows: [] };
      if (text.includes("AS selected_member_count")) {
        return { rows: [{
          selected_member_count: "30",
          published_maharashtra_count: "30",
          addressed_count: "30",
          india_country_count: "30",
          members_with_citation_metadata: "30",
        }] };
      }
      if (text.includes("AS all_image_records")) {
        return { rows: [{
          all_image_records: "0",
          all_verified_photographs: "0",
          catalogue_image_records: "0",
          catalogue_verified_photographs: "0",
        }] };
      }
      if (/^BEGIN;/.test(text)) return { rows: [] };
      throw new Error(`Unexpected fake query: ${text.slice(0, 90)}`);
    },
    get readOnlyTransactions() { return readOnlyTransactions; },
  };
}

test("Neon host validation requires a direct Neon endpoint and exact host pin", () => {
  assert.equal(validateNeonHost(neonHost), neonHost);
  assert.throws(() => validateNeonHost("localhost"), /direct Neon PostgreSQL endpoint/);
  assert.throws(() => validateNeonHost("127.0.0.1"), /direct Neon PostgreSQL endpoint/);
  assert.throws(() => validateNeonHost("ep-quiet-forest-pooler.us-east-2.aws.neon.tech"), /direct Neon PostgreSQL endpoint/);
  assert.throws(() => validateNeonHost("ep-quiet-forest.neon.tech.example.com"), /direct Neon PostgreSQL endpoint/);
  assert.throws(() => validateConnectionTarget(connectionString, "ep-different-host.us-east-2.aws.neon.tech"), /does not match/);
});

test("database-name validation accepts only the expected HeritageVerse database", () => {
  assert.equal(DATABASE_NAME, expectedDatabaseName);
  const validated = validateConnectionTarget(connectionString, neonHost);
  assert.equal(validated.databaseName, expectedDatabaseName);
  assert.throws(() => validateConnectionTarget(
    `postgresql://heritage_user:secret-value@${neonHost}/heritageverse?sslmode=require`, neonHost,
  ), /database name must be exactly/);
  assert.throws(() => validateConnectionTarget(
    `postgresql://heritage_user:secret-value@${neonHost}/anotherdb?sslmode=require`, neonHost,
  ), /database name must be exactly/);
  assert.throws(() => validateConnectionTarget("not a postgres url", neonHost), /valid PostgreSQL connection URL/);
  assert.throws(() => validateConnectionTarget(
    `postgresql://heritage_user:secret-value@${neonHost}/heritageversedb?sslmode=disable`, neonHost,
  ), /invalid or insecure PostgreSQL TLS/);
});

test("all SQL files are node-postgres whole-file scripts in the required order", () => {
  const files = getInitializationSqlFiles();
  assert.deepEqual(files.slice(0, 2).map((filename) => path.basename(filename)), ["schema.sql", "seed.sql"]);
  assert.deepEqual(files.slice(2).map((filename) => path.basename(filename).slice(0, 3)),
    Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(3, "0")));
  assert.equal(files.length, 17);
  for (const filename of files) {
    const sql = require("node:fs").readFileSync(filename, "utf8");
    assert.doesNotThrow(() => assertPgScriptFile(path.basename(filename), sql), path.basename(filename));
    assert.match(sql, /^\s*(?:--[^\n]*\n\s*)*BEGIN\s*;/i, path.basename(filename));
    assert.match(sql, /COMMIT\s*;\s*$/i, path.basename(filename));
  }
  assert.throws(() => assertPgScriptFile("bad.sql", "\\connect remote\n"), /BEGIN\/COMMIT/);
});

test("initialization refuses a database with existing relations before confirmation or writes", async () => {
  const client = createFakeClient({ relations: [{ schema_name: "public", relation_name: "users", relation_kind: "r" }] });
  let prompted = false;
  await assert.rejects(runInitialization({
    connectionString,
    expectedHost: neonHost,
    createClient: () => client,
    confirm: async () => { prompted = true; return true; },
    sqlFiles: ["schema.sql"],
    readSql: () => "BEGIN; SELECT 1; COMMIT;",
    logger: loggerStub(),
  }), /already contains non-system relations or schemas \(public\.users\)/);
  assert.equal(prompted, false);
  assert.equal(client.queries.some((query) => /^BEGIN;/i.test(query.text)), false);
  assert.equal(client.queries.some((query) => query.text === "COMMIT"), false);
});

test("SQL files execute sequentially only after explicit confirmation and post-checks report media separately", async () => {
  const client = createFakeClient();
  const names = ["schema.sql", "seed.sql", "001_first.sql", "015_last.sql"];
  const result = await runInitialization({
    connectionString,
    expectedHost: neonHost,
    createClient: () => client,
    confirm: async () => true,
    sqlFiles: names,
    readSql: (filename) => `BEGIN;\nSELECT '${filename}';\nCOMMIT;\n`,
    logger: loggerStub(),
  });
  const applied = client.queries.filter((query) => /^BEGIN;/.test(query.text)).map((query) => query.text.match(/SELECT '([^']+)'/)[1]);
  assert.deepEqual(applied, names);
  assert.equal(client.readOnlyTransactions, 2);
  assert.deepEqual(result.catalogue, {
    selectedMembers: 30,
    publishedMaharashtraMembers: 30,
    withAddresses: 30,
    countryIndia: 30,
    withCitationMetadata: 30,
  });
  assert.deepEqual(result.media, {
    allImageRecords: 0,
    allVerifiedPhotographs: 0,
    catalogueImageRecords: 0,
    catalogueVerifiedPhotographs: 0,
  });
});

test("a failed SQL file is reported by filename and later files are not attempted", async () => {
  const client = createFakeClient({ failOnSql: "FAIL_HERE" });
  const names = ["schema.sql", "002_fails.sql", "003_must_not_run.sql"];
  await assert.rejects(runInitialization({
    connectionString,
    expectedHost: neonHost,
    createClient: () => client,
    confirm: async () => true,
    sqlFiles: names,
    readSql: (filename) => `BEGIN;\nSELECT '${filename === "002_fails.sql" ? "FAIL_HERE" : filename}';\nCOMMIT;\n`,
    logger: loggerStub(),
  }), /stopped at 002_fails\.sql \(PostgreSQL error 42601\)/);
  const applied = client.queries.filter((query) => /^BEGIN;/.test(query.text));
  assert.equal(applied.length, 2);
  assert.match(applied[1].text, /FAIL_HERE/);
  assert.equal(client.queries.some((query) => query.text.includes("003_must_not_run.sql")), false);
});
