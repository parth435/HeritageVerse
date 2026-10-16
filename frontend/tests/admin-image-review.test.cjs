"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");

test("admin image approval requires a loaded Commons image and separate visual and rights confirmations", async () => {
  const [api, admin] = await Promise.all([
    readFile(path.join(root, "lib/api.ts"), "utf8"),
    readFile(path.join(root, "components/admin/AdminRealApp.tsx"), "utf8"),
  ]);

  assert.match(api, /admin\/images\/\$\{encodeURIComponent\(String\(id\)\)\}\/approve/);
  assert.match(api, /visualMatchConfirmed: true, rightsConfirmed: true/);
  assert.match(admin, /I checked that this exact photograph depicts \{placeName\}/);
  assert.match(admin, /I checked the Commons source, creator, attribution, and reuse license/);
  assert.match(admin, /Photo src=\{asset\.url \|\| null\}[^\n]*onLoad=\{\(\) => setImageLoaded\(true\)\}/);
  assert.match(admin, /const canApprove = imageLoaded && validCommonsImage && validCommonsSource && validLicense && hasAttribution && visualConfirmed && rightsConfirmed/);
  assert.match(admin, /disabled=\{!canApprove \|\| approvingMediaId !== null\}/);
  assert.match(admin, /Approve and publish image/);
});
