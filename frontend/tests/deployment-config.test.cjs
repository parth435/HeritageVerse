"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const apiUrl = import("../src/lib/apiUrl.js");
const frontendRoot = path.resolve(__dirname, "..");

test("API base URL defaults to same-origin /api for local development", async () => {
  const { getApiBaseUrl } = await apiUrl;
  const base = getApiBaseUrl(undefined);

  assert.equal(base, "/api");
  assert.doesNotMatch(base, /^https?:\/\/localhost(?::\d+)?/i);
});

test("API base URL adds one /api segment and accepts existing API suffixes", async () => {
  const { getApiBaseUrl } = await apiUrl;

  assert.equal(getApiBaseUrl(" https://api.example.test "), "https://api.example.test/api");
  assert.equal(getApiBaseUrl("https://api.example.test/api/"), "https://api.example.test/api");
  assert.equal(getApiBaseUrl("https://api.example.test/api/auth"), "https://api.example.test/api");
  assert.equal(getApiBaseUrl("https://api.example.test/api/api"), "https://api.example.test/api");
  assert.equal(getApiBaseUrl("https://api.example.test/api/api/auth"), "https://api.example.test/api");
});

test("API URL joining preserves endpoint queries and avoids duplicate /api segments", async () => {
  const { buildApiUrl, getApiBaseUrl } = await apiUrl;
  const base = getApiBaseUrl("https://api.example.test/api/");

  assert.equal(buildApiUrl("/heritage?q=fort", base), "https://api.example.test/api/heritage?q=fort");
  assert.equal(buildApiUrl("/api/admin/sites", base), "https://api.example.test/api/admin/sites");
  assert.equal(buildApiUrl("admin/sites", "/api"), "/api/admin/sites");
});

test("admin service delegates to the shared API client without legacy route assumptions", async () => {
  const [apiSource, adminSource] = await Promise.all([
    readFile(path.join(frontendRoot, "src/lib/api.ts"), "utf8"),
    readFile(path.join(frontendRoot, "src/services/adminApi.ts"), "utf8"),
  ]);

  assert.match(apiSource, /getApiBaseUrl\(import\.meta\.env\.VITE_API_BASE_URL\)/);
  assert.match(apiSource, /buildApiUrl\(/);
  assert.doesNotMatch(apiSource, /["']https?:\/\/localhost(?::\d+)?/i);
  assert.match(adminSource, /from "@\/lib\/api"/);
  assert.match(adminSource, /updateAdminUserRole/);
  assert.match(adminSource, /updateAdminUserStatus/);
  assert.doesNotMatch(adminSource, /admin\/(?:stats|sites|users\/\$\{id\}\/role)/);
});

test("Vercel SPA rewrite handles browser routes but excludes API paths", async () => {
  const config = JSON.parse(await readFile(path.resolve(frontendRoot, "../vercel.json"), "utf8"));

  assert.equal(config.rewrites.length, 1);
  const [rewrite] = config.rewrites;
  assert.equal(rewrite.destination, "/index.html");
  const routePattern = new RegExp(`^${rewrite.source}$`);
  assert.equal(routePattern.test("/explore/ajanta-caves"), true);
  assert.equal(routePattern.test("/api"), false);
  assert.equal(routePattern.test("/api/heritage"), false);
});
