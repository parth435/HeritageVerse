"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateApiTarget,
  validateDatabaseUrl,
  verifySmokeTargets,
} = require("../scripts/integration-smoke");

const token = "local-test-token-0123456789abcdef";
const apiDatabase = {
  databaseName: "heritageverse_smoke_test",
  schemaName: "public",
  serverAddress: "127.0.0.1",
  serverPort: 5432,
};

function makeEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    HERITAGEVERSE_API: "http://127.0.0.1:5050/api",
    HERITAGEVERSE_SMOKE_DATABASE_URL: "postgresql://smoke:local-only@127.0.0.1:5432/heritageverse_smoke_test?sslmode=disable",
    HERITAGEVERSE_SMOKE_TARGET_TOKEN: token,
    ...overrides,
  };
}

function makeFetch({ target = apiDatabase, environment = "test" } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/health")) return Response.json({ success: true, status: "ok" });
    return Response.json({ success: true, environment, databaseTarget: target });
  };
  return { fetchImpl, requests };
}

function makePool(identity = apiDatabase) {
  const queries = [];
  let ended = false;
  return {
    queries,
    get ended() { return ended; },
    async query(sql) {
      queries.push(sql);
      return { rows: [{
        database_name: identity.databaseName,
        schema_name: identity.schemaName,
        server_address: identity.serverAddress,
        server_port: identity.serverPort,
      }] };
    },
    async end() { ended = true; },
  };
}

test("integration smoke refuses production and unspecified environments before network access", async () => {
  let calls = 0;
  for (const NODE_ENV of ["production", undefined]) {
    const env = makeEnv({ NODE_ENV });
    assert.throws(() => validateApiTarget(env.HERITAGEVERSE_API, undefined, env), /NODE_ENV/);
    await assert.rejects(verifySmokeTargets({ env, fetchImpl: async () => { calls += 1; } }), /NODE_ENV/);
  }
  assert.equal(calls, 0);
});

test("integration smoke rejects remote API and database URLs before network access", async () => {
  let calls = 0;
  const remoteApiEnv = makeEnv({ HERITAGEVERSE_API: "https://api.example.test/api" });
  assert.throws(() => validateApiTarget(remoteApiEnv.HERITAGEVERSE_API, undefined, remoteApiEnv), /loopback/);
  await assert.rejects(verifySmokeTargets({ env: remoteApiEnv, fetchImpl: async () => { calls += 1; } }), /loopback/);

  const remoteDatabaseEnv = makeEnv({
    HERITAGEVERSE_SMOKE_DATABASE_URL: "postgresql://smoke:local-only@db.example.test:5432/heritageverse_smoke_test",
  });
  assert.throws(() => validateDatabaseUrl(remoteDatabaseEnv.HERITAGEVERSE_SMOKE_DATABASE_URL, remoteDatabaseEnv), /loopback/);
  await assert.rejects(verifySmokeTargets({ env: remoteDatabaseEnv, fetchImpl: async () => { calls += 1; } }), /loopback/);
  assert.equal(calls, 0);
});

test("integration smoke rejects API and cleanup database target mismatches before mutation", async () => {
  const { fetchImpl, requests } = makeFetch();
  const cleanupPool = makePool({ ...apiDatabase, serverPort: 5433 });
  await assert.rejects(verifySmokeTargets({
    env: makeEnv(),
    fetchImpl,
    createPool: () => cleanupPool,
  }), /do not match/);
  assert.equal(cleanupPool.queries.length, 1);
  assert.match(cleanupPool.queries[0], /current_database\(\)/);
  assert.equal(cleanupPool.ended, true);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ options }) => !options?.method || options.method === "GET"));
});

test("integration smoke rejects a remote API database identity", async () => {
  const { fetchImpl } = makeFetch({ target: { ...apiDatabase, serverAddress: "10.0.0.4" } });
  let poolCreated = false;
  await assert.rejects(verifySmokeTargets({
    env: makeEnv(),
    fetchImpl,
    createPool: () => { poolCreated = true; return makePool(); },
  }), /isolated loopback test database/);
  assert.equal(poolCreated, false);
});

test("integration smoke verifies the same isolated local target before returning an executable pool", async () => {
  const { fetchImpl, requests } = makeFetch();
  const cleanupPool = makePool();
  const verified = await verifySmokeTargets({
    env: makeEnv(),
    fetchImpl,
    createPool: () => cleanupPool,
  });
  assert.equal(verified.target.databaseName, "heritageverse_smoke_test");
  assert.equal(verified.target.serverAddress, "127.0.0.1");
  assert.equal(verified.api.apiBase, "http://127.0.0.1:5050/api");
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ options }) => !options?.method || options.method === "GET"));
  await verified.pool.end();
});
