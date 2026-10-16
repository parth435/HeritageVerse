"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
const { createDatabasePoolOptions } = require("../config/database-options");

const validProductionUrl = "postgresql://app:example-password@ep-example-pooler.neon.tech/heritage?sslmode=verify-full";

test("database pool uses bounded pool and connection timeout settings", () => {
  const options = createDatabasePoolOptions({ NODE_ENV: "development" });

  assert.equal(options.max, 10);
  assert.equal(options.idleTimeoutMillis, 30_000);
  assert.equal(options.connectionTimeoutMillis, 4_000);
  assert.equal(Object.hasOwn(options, "connectionString"), false);
});

test("production requires a PostgreSQL DATABASE_URL", () => {
  assert.throws(
    () => createDatabasePoolOptions({ NODE_ENV: "production" }),
    { message: "DATABASE_URL must be configured in production" },
  );

  assert.throws(
    () => createDatabasePoolOptions({ NODE_ENV: "production", DATABASE_URL: "not-a-url" }),
    /valid PostgreSQL connection URL/,
  );
});

test("production rejects loopback hosts and insecure TLS settings", () => {
  const urls = [
    "postgresql://app:pw@localhost/heritage?sslmode=verify-full",
    "postgresql://app:pw@127.0.0.1/heritage?sslmode=verify-full",
    "postgresql://app:pw@ep-example.neon.tech/heritage?sslmode=disable",
    "postgresql://app:pw@ep-example.neon.tech/heritage?sslmode=no-verify",
    "postgresql://app:pw@ep-example.neon.tech/heritage?ssl=0",
    "postgresql://app:pw@ep-example.neon.tech/heritage?ssl=false",
    "postgresql://app:pw@ep-example.neon.tech/heritage?sslmode=require&uselibpqcompat=true",
  ];

  for (const DATABASE_URL of urls) {
    assert.throws(
      () => createDatabasePoolOptions({ NODE_ENV: "production", DATABASE_URL }),
      /DATABASE_URL must/,
    );
  }
});

test("production accepts a Neon-style pooled URL with verified TLS", () => {
  const options = createDatabasePoolOptions({
    NODE_ENV: "production",
    DATABASE_URL: validProductionUrl,
  });
  const client = new Client(options);

  assert.equal(options.connectionString, validProductionUrl);
  assert.equal(options.host, "ep-example-pooler.neon.tech");
  assert.equal(options.port, 5432);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.connectionTimeoutMillis, 4_000);
  assert.notEqual(client.connectionParameters.ssl, false);
  assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized, false);
});

test("local PostgreSQL URLs can explicitly disable TLS for local development only", () => {
  const localOptions = createDatabasePoolOptions({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://app:local-password@127.0.0.1/heritage?sslmode=disable",
  });

  assert.equal(localOptions.host, "127.0.0.1");
  assert.equal(localOptions.port, 5432);
  assert.equal(localOptions.ssl, false);
  assert.throws(
    () => createDatabasePoolOptions({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://app:pw@ep-example.neon.tech/heritage?sslmode=disable",
    }),
    /TLS with certificate verification/,
  );
});

test("legacy split database settings remain loopback-only local compatibility", () => {
  const options = createDatabasePoolOptions({
    NODE_ENV: "development",
    DB_HOST: "127.0.0.1",
    DB_PORT: "5434",
    DB_NAME: "local heritage",
    DB_USER: "local user",
    DB_PASSWORD: "local:password",
  });

  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 5434);
  assert.match(options.connectionString, /^postgresql:\/\//);
  assert.equal(options.ssl, false);
  assert.throws(
    () => createDatabasePoolOptions({ NODE_ENV: "development", DB_HOST: "db.example.test", DB_NAME: "db", DB_USER: "user" }),
    /loopback development PostgreSQL/,
  );
  assert.throws(
    () => createDatabasePoolOptions({ NODE_ENV: "production", DB_HOST: "127.0.0.1", DB_NAME: "db", DB_USER: "user" }),
    /Production PostgreSQL configuration requires DATABASE_URL/,
  );
});

test("DATABASE_URL is the sole active source when old local settings are also present", () => {
  const options = createDatabasePoolOptions({
    NODE_ENV: "production",
    DATABASE_URL: validProductionUrl,
    DB_HOST: "localhost",
    DB_NAME: "stale-local-database",
    DB_USER: "stale-local-user",
  });

  assert.equal(options.host, "ep-example-pooler.neon.tech");
  assert.equal(options.connectionString, validProductionUrl);
});
