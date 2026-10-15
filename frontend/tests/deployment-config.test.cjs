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

test("production API base uses the same-origin proxy and local development keeps its configured backend", async () => {
  const { getRuntimeApiBaseUrl } = await apiUrl;

  assert.equal(
    getRuntimeApiBaseUrl("https://heritageverse-backend.onrender.com/api", true),
    "/api",
  );
  assert.equal(
    getRuntimeApiBaseUrl("http://localhost:5000", false),
    "http://localhost:5000/api",
  );
  assert.equal(getRuntimeApiBaseUrl(undefined, false), "/api");
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

  assert.match(apiSource, /getRuntimeApiBaseUrl\(/);
  assert.match(apiSource, /import\.meta\.env\.VITE_API_BASE_URL/);
  assert.match(apiSource, /import\.meta\.env\.PROD/);
  assert.match(apiSource, /buildApiUrl\(/);
  assert.doesNotMatch(apiSource, /["']https?:\/\/localhost(?::\d+)?/i);
  assert.match(adminSource, /from "@\/lib\/api"/);
  assert.match(adminSource, /updateAdminUserRole/);
  assert.match(adminSource, /updateAdminUserStatus/);
  assert.doesNotMatch(adminSource, /admin\/(?:stats|sites|users\/\$\{id\}\/role)/);
});

test("Vercel proxies API requests to Render before the SPA fallback", async () => {
  const config = JSON.parse(await readFile(path.resolve(frontendRoot, "../vercel.json"), "utf8"));

  assert.equal(config.rewrites.length, 2);
  const [apiRewrite, spaRewrite] = config.rewrites;
  assert.equal(apiRewrite.source, "/api/:path*");
  assert.equal(
    apiRewrite.destination,
    "https://heritageverse-backend.onrender.com/api/:path*",
  );
  assert.equal(spaRewrite.destination, "/index.html");
  const routePattern = new RegExp(`^${spaRewrite.source}$`);
  assert.equal(routePattern.test("/explore/ajanta-caves"), true);
  assert.equal(routePattern.test("/api"), false);
  assert.equal(routePattern.test("/api/heritage"), false);
});
