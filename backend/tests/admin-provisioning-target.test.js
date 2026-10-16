"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parseDatabaseTarget, validateDatabaseTarget } = require("../database/promote-admin");

test("remote administrator promotion pins the expected database host and name", () => {
  const target = parseDatabaseTarget("postgresql://ep-prod.us-east-2.aws.neon.tech/heritageversedb?sslmode=require");
  assert.deepEqual(target, { host: "ep-prod.us-east-2.aws.neon.tech", database: "heritageversedb" });

  assert.doesNotThrow(() => validateDatabaseTarget({
    target,
    nodeEnvironment: "production",
    externalOptIn: true,
    expectedHost: "ep-prod.us-east-2.aws.neon.tech",
    expectedDatabase: "heritageversedb",
  }));
  assert.throws(() => validateDatabaseTarget({ target, nodeEnvironment: "production", externalOptIn: true }), /requires --expected-host/);
  assert.throws(() => validateDatabaseTarget({ target, nodeEnvironment: "production", externalOptIn: true, expectedHost: "other.neon.tech", expectedDatabase: "heritageversedb" }), /host does not match/);
  assert.throws(() => validateDatabaseTarget({ target, nodeEnvironment: "production", externalOptIn: true, expectedHost: target.host, expectedDatabase: "staging" }), /database does not match/);
  assert.throws(() => validateDatabaseTarget({ target, nodeEnvironment: "production", externalOptIn: false, expectedHost: target.host, expectedDatabase: target.database }), /allow-external-database/);
});

test("promotion preserves the exact account, active-user, transaction, and audit safeguards", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../database/promote-admin.js"), "utf8");
  assert.match(source, /new Pool\(createDatabasePoolOptions\(process\.env\)\)/);
  assert.doesNotMatch(source, /require\(["']\.\.\/config\/db["']\)/);
  assert.match(source, /SELECT pg_advisory_xact_lock/);
  assert.match(source, /WHERE id=\$1 AND lower\(email\)=\$2 FOR UPDATE/);
  assert.match(source, /target\.role !== "user"/);
  assert.match(source, /target\.status !== "ACTIVE"/);
  assert.match(source, /UPDATE users SET role='admin'[\s\S]*WHERE id=\$1 AND lower\(email\)=\$2 AND role='user'/);
  assert.match(source, /INSERT INTO activity_logs/);
});
