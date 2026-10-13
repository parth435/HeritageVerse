"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validate } = require("../database/import-media");

const records = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../database/source-data/then-now-images.json"), "utf8"));

test("reviewed Then & Now pair has complete source, creator, date, and reusable license metadata", () => {
  assert.equal(records.length, 2);
  assert.deepEqual(records.flatMap(validate), []);
  assert.deepEqual(records.map((record) => record.media_role), ["historical", "current"]);
  assert.ok(records.every((record) => record.review_status === "verified" && record.is_illustrative !== true));
});

test("media importer rejects unsupported licenses and illustrative images in authentic pairs", () => {
  assert.match(validate({ ...records[0], license: "All rights reserved" }, 0).join(" "), /allowlist/);
  assert.match(validate({ ...records[0], is_illustrative: true }, 0).join(" "), /cannot be imported/);
  assert.match(validate({ ...records[0], source_url: "javascript:alert(1)" }, 0).join(" "), /source URL must be HTTPS/);
});
