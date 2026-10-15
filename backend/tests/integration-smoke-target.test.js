"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createIntegrationSmokeTargetRouter } = require("../modules/integration-smoke-target");

const targetToken = "local-only-smoke-target-token-123456";
const safeIdentity = {
  databaseName: "heritageverse_smoke_test",
  schemaName: "public",
  serverAddress: "127.0.0.1",
  serverPort: 5432,
};

async function withServer(t, { env, pool }) {
  const app = express();
  app.use(createIntegrationSmokeTargetRouter({ env, pool }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}/__integration-smoke/target`;
}

test("integration target endpoint reports only a verified local test database to the local token holder", async (t) => {
  const queries = [];
  const url = await withServer(t, {
    env: { NODE_ENV: "development", HERITAGEVERSE_SMOKE_TARGET_TOKEN: targetToken },
    pool: { query: async (sql) => {
      queries.push(sql);
      return { rows: [{
        database_name: safeIdentity.databaseName,
        schema_name: safeIdentity.schemaName,
        server_address: safeIdentity.serverAddress,
        server_port: safeIdentity.serverPort,
      }] };
    } },
  });
  const response = await fetch(url, { headers: { "x-heritageverse-smoke-token": targetToken } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.environment, "development");
  assert.deepEqual(payload.databaseTarget, safeIdentity);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /current_database\(\)/);
});

test("integration target endpoint is unavailable in production or without the local token", async (t) => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const productionUrl = await withServer(t, {
    env: { NODE_ENV: "production", HERITAGEVERSE_SMOKE_TARGET_TOKEN: targetToken }, pool,
  });
  const productionResponse = await fetch(productionUrl, { headers: { "x-heritageverse-smoke-token": targetToken } });
  assert.equal(productionResponse.status, 404);

  const developmentUrl = await withServer(t, {
    env: { NODE_ENV: "development", HERITAGEVERSE_SMOKE_TARGET_TOKEN: targetToken }, pool,
  });
  const missingTokenResponse = await fetch(developmentUrl);
  assert.equal(missingTokenResponse.status, 404);
  assert.equal(queries, 0);
});

test("integration target endpoint refuses remote database identities", async (t) => {
  const url = await withServer(t, {
    env: { NODE_ENV: "test", HERITAGEVERSE_SMOKE_TARGET_TOKEN: targetToken },
    pool: { query: async () => ({ rows: [{ ...safeIdentity, server_address: "10.0.0.8" }] }) },
  });
  const response = await fetch(url, { headers: { "x-heritageverse-smoke-token": targetToken } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "SMOKE_TARGET_UNSAFE");
});
