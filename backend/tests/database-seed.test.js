"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const seedSql = fs.readFileSync(path.join(__dirname, "../database", "seed.sql"), "utf8");

test("catalog seed never creates or promotes an administrator", () => {
  assert.doesNotMatch(seedSql, /INSERT\s+INTO\s+users\s*\(/i);
  assert.doesNotMatch(seedSql, /UPDATE\s+users\s+SET\s+role\s*=/i);
  assert.doesNotMatch(seedSql, /\$2[aby]\$\d{2}\$/);
});
