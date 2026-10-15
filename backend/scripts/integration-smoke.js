#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const { createDatabasePoolOptions } = require("../config/database-options");
const {
  EXPECTED_SMOKE_DATABASE,
  assertMatchingDatabaseTargets,
  isLoopbackAddress,
  isSafeEnvironment,
  validateDatabaseIdentity,
} = require("../config/integration-smoke-safety");
const { TARGET_SQL } = require("../modules/integration-smoke-target");

const DEFAULT_API = "http://127.0.0.1:5000/api";
const TARGET_TOKEN_HEADER = "x-heritageverse-smoke-token";
let API = "";
let HEALTH = "";
let fetchForRequests = globalThis.fetch;
let pool = null;
let testUsers = [];
let cleanupTarget = null;
const failures = [];
let checks = 0;
let mutationAttempted = false;

function validateApiTarget(apiValue, healthValue, env) {
  if (!isSafeEnvironment(env.NODE_ENV)) {
    throw new Error("Integration smoke requires NODE_ENV=development or NODE_ENV=test.");
  }

  let apiUrl;
  try { apiUrl = new URL(apiValue || DEFAULT_API); } catch { throw new Error("Integration smoke API target is invalid."); }
  if (
    apiUrl.protocol !== "http:" ||
    !isLoopbackAddress(apiUrl.hostname) ||
    apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash ||
    !["/api", "/api/"].includes(apiUrl.pathname)
  ) {
    throw new Error("Integration smoke accepts only a loopback HTTP API at /api.");
  }

  const apiBase = `${apiUrl.origin}/api`;
  const healthUrl = healthValue || `${apiUrl.origin}/health`;
  let parsedHealth;
  try { parsedHealth = new URL(healthUrl); } catch { throw new Error("Integration smoke health target is invalid."); }
  if (
    parsedHealth.origin !== apiUrl.origin ||
    parsedHealth.pathname !== "/health" ||
    parsedHealth.username || parsedHealth.password || parsedHealth.search || parsedHealth.hash
  ) {
    throw new Error("Integration smoke health and API targets must use the same loopback origin.");
  }

  return {
    apiBase,
    origin: apiUrl.origin,
    healthUrl: parsedHealth.href,
    targetUrl: new URL("/__integration-smoke/target", apiUrl.origin).href,
  };
}

function validateDatabaseUrl(value, env) {
  if (!isSafeEnvironment(env.NODE_ENV)) {
    throw new Error("Integration smoke refuses production or unspecified runtime environments.");
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("HERITAGEVERSE_SMOKE_DATABASE_URL must identify the isolated local smoke database.");
  }

  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("HERITAGEVERSE_SMOKE_DATABASE_URL is invalid."); }
  const databaseName = (() => {
    try { return decodeURIComponent(url.pathname.slice(1)); } catch { return ""; }
  })();
  const sslModes = url.searchParams.getAll("sslmode");
  const sslMode = (sslModes[0] || "").toLowerCase();
  const allowedQueryKeys = [...url.searchParams.keys()];
  if (
    !["postgres:", "postgresql:"].includes(url.protocol.toLowerCase()) ||
    !isLoopbackAddress(url.hostname) ||
    databaseName !== EXPECTED_SMOKE_DATABASE ||
    url.pathname.slice(1).includes("/") ||
    url.hash ||
    sslModes.length > 1 ||
    allowedQueryKeys.some((key) => key !== "sslmode") ||
    (sslMode && !["disable", "verify-ca", "verify-full"].includes(sslMode))
  ) {
    throw new Error(`Integration smoke requires a loopback PostgreSQL URL for ${EXPECTED_SMOKE_DATABASE} with safe local TLS options.`);
  }
  return url;
}

function identityFromQuery(result) {
  const row = result?.rows?.[0];
  return validateDatabaseIdentity({
    databaseName: row?.database_name,
    schemaName: row?.schema_name,
    serverAddress: row?.server_address,
    serverPort: row?.server_port,
  });
}

async function getJson(fetchImpl, url, options, failureMessage) {
  let response;
  try { response = await fetchImpl(url, { ...options, redirect: "error" }); } catch { throw new Error(failureMessage); }
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  return { response, payload };
}

async function readApiTarget(api, fetchImpl, token, expectedEnvironment) {
  const { response, payload } = await getJson(fetchImpl, api.targetUrl, {
    headers: { [TARGET_TOKEN_HEADER]: token },
  }, "Could not verify the local API database target.");
  if (response.status !== 200 || payload?.success !== true || payload.environment !== expectedEnvironment || !isSafeEnvironment(payload.environment)) {
    throw new Error("The API did not prove a safe local development/test target.");
  }
  return validateDatabaseIdentity(payload.databaseTarget);
}

function createSmokePool(connectionString, env) {
  const options = createDatabasePoolOptions({ NODE_ENV: env.NODE_ENV, DATABASE_URL: connectionString });
  return new Pool(options);
}

async function verifySmokeTargets({ env = process.env, fetchImpl = globalThis.fetch, createPool = createSmokePool } = {}) {
  const api = validateApiTarget(env.HERITAGEVERSE_API, env.HERITAGEVERSE_HEALTH, env);
  const databaseUrl = validateDatabaseUrl(env.HERITAGEVERSE_SMOKE_DATABASE_URL, env);
  const token = typeof env.HERITAGEVERSE_SMOKE_TARGET_TOKEN === "string"
    ? env.HERITAGEVERSE_SMOKE_TARGET_TOKEN
    : "";
  if (token.length < 32) throw new Error("HERITAGEVERSE_SMOKE_TARGET_TOKEN must be a local-only token of at least 32 characters.");

  const { response: healthResponse, payload: health } = await getJson(
    fetchImpl, api.healthUrl, undefined, "Could not verify the local API health target.",
  );
  if (healthResponse.status !== 200 || health?.success !== true || health?.status !== "ok") {
    throw new Error("Local API health verification failed.");
  }

  const apiIdentity = await readApiTarget(api, fetchImpl, token, env.NODE_ENV);
  const databasePool = createPool(databaseUrl.href, env);
  try {
    const cleanupIdentity = identityFromQuery(await databasePool.query(TARGET_SQL));
    const target = assertMatchingDatabaseTargets(apiIdentity, cleanupIdentity);
    return { api, pool: databasePool, target, token, environment: env.NODE_ENV };
  } catch (error) {
    try { await databasePool.end(); } catch { /* preserve the safe-target error */ }
    throw error;
  }
}

async function verifyCleanupTarget(api, databasePool, token, expectedTarget, environment, fetchImpl = fetchForRequests) {
  const apiIdentity = await readApiTarget(api, fetchImpl, token, environment);
  const cleanupIdentity = identityFromQuery(await databasePool.query(TARGET_SQL));
  assertMatchingDatabaseTargets(apiIdentity, cleanupIdentity);
  if (
    apiIdentity.databaseName !== expectedTarget.databaseName ||
    apiIdentity.schemaName !== expectedTarget.schemaName ||
    apiIdentity.serverAddress !== expectedTarget.serverAddress ||
    apiIdentity.serverPort !== expectedTarget.serverPort
  ) {
    throw new Error("Verified smoke target changed during execution.");
  }
}

async function request(path, { method = "GET", token, body, status = 200 } = {}) {
  const response = await fetchForRequests(`${API}${path}`, {
    redirect: "error",
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status !== status) {
    throw new Error(`${method} ${path}: expected ${status}, got ${response.status} (${data.message || "no message"})`);
  }
  checks += 1;
  return data;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
  checks += 1;
}

async function runSmokeChecks() {
  const healthResponse = await fetchForRequests(HEALTH, { redirect: "error" });
  const health = await healthResponse.json().catch(() => ({}));
  expect(healthResponse.status === 200 && health.success === true, "Backend health check did not return success");

  const categoryPage = await request("/heritage?category=fort-palace&limit=50");
  expect(categoryPage.items.length > 0, "Selected fort and palace records were not returned");
  expect(categoryPage.items.every((item) => item.category.slug === "fort-palace"), "Category filter leaked a different category");
  expect(categoryPage.pagination.total === categoryPage.items.length, "Category pagination total is incorrect");
  const search = await request("/heritage?q=Ajanta%20Caves&limit=10");
  const ajanta = search.items.find((item) => item.slug === "ajanta-caves");
  expect(Boolean(ajanta), "Search did not find the selected Ajanta Caves record");
  const legacySearch = await request("/heritage?q=Taj%20Mahal&limit=10");
  expect(!legacySearch.items.some((item) => item.slug === "taj-mahal") && legacySearch.items.every((item) => item.state === "Maharashtra"),
    "Search exposed a legacy non-Maharashtra record outside public catalogue membership");
  const pageOne = await request("/heritage?limit=1&offset=0");
  const pageTwo = await request("/heritage?limit=1&offset=1");
  expect(pageOne.items[0]?.id !== pageTwo.items[0]?.id, "Pagination returned the same record twice");
  expect(pageOne.items[0]?.country === "India", "Public listing omitted the curated destination country");
  const facets = await request("/heritage-facets");
  expect(facets.states.length === 1 && facets.states[0] === "Maharashtra", "State facets did not match the Maharashtra catalogue");
  const selectedStateFacets = await request("/heritage-facets?state=Maharashtra");
  expect(selectedStateFacets.districts.length > 0, "State-specific district filter options did not load");

  const detail = await request(`/heritage/${ajanta.id}`);
  expect(detail.heritage.sources?.length > 0, "Detail response omitted source citation metadata");
  expect(detail.heritage.locality === null || typeof detail.heritage.locality === "string", "Detail response omitted locality field");
  expect(detail.heritage.slug === "ajanta-caves" && detail.heritage.state === "Maharashtra", "Selected Ajanta detail has incorrect identity or state");
  expect(detail.heritage.country === "India", "Heritage detail omitted the curated destination country");
  const verifiedMedia = detail.heritage.media.filter((media) => media.verification_status === "verified" && media.is_illustrative === false);
  expect(verifiedMedia.length > 0 && verifiedMedia.every((media) => media.source_url?.startsWith("https://") && media.creator && media.license && media.license_url?.startsWith("https://")), "Verified catalogue image attribution is incomplete");

  const [ajantaSearch, elloraSearch] = await Promise.all([
    request("/heritage?q=Ajanta%20Caves&limit=10"),
    request("/heritage?q=Ellora%20Caves&limit=10"),
  ]);
  const routePlaces = [
    ajantaSearch.items.find((item) => item.slug === "ajanta-caves"),
    elloraSearch.items.find((item) => item.slug === "ellora-caves"),
  ];
  expect(routePlaces.every((place) => place?.coordinates_verified === true && place.state === "Maharashtra" && place.country === "India"), "Maharashtra map data omitted verified coordinates or country");
  const heritageId = ajanta.id;
  const otherHeritageId = routePlaces[1].id;
  const reconstructionStatus = await request("/reconstruction/status");
  expect(typeof reconstructionStatus.reconstruction?.configured === "boolean" && !("api_key" in reconstructionStatus.reconstruction) && !("endpoint" in reconstructionStatus.reconstruction), "Reconstruction status leaked configuration details");
  await request(`/heritage/${heritageId}/reconstruction`, { method: "POST", status: 401 });

  const anonymousFavorites = await request("/favorites", { status: 401 });
  expect(anonymousFavorites.success === false, "Anonymous favorites request was not rejected");
  await request("/admin/dashboard", { status: 401 });

  mutationAttempted = true;
  const first = await request("/auth/signup", { method: "POST", body: testUsers[0], status: 201 });
  const second = await request("/auth/signup", { method: "POST", body: testUsers[1], status: 201 });
  expect(first.user.role === "user" && second.user.role === "user", "Signup assigned an unexpected role");
  const userA = await request("/auth/signin", { method: "POST", body: { email: testUsers[0].email, password: testUsers[0].password } });
  const userB = await request("/auth/signin", { method: "POST", body: { email: testUsers[1].email, password: testUsers[1].password } });
  expect(Boolean(userA.token && userB.token), "Login did not return authenticated sessions");
  await request("/auth/me", { token: userA.token });
  if (!reconstructionStatus.reconstruction.configured) {
    const hasVerifiedHistoricalSource = detail.heritage.media.some((media) => media.media_role === "historical" &&
      media.verification_status === "verified" && media.is_illustrative === false && media.source_url && media.creator && media.license);
    const unavailableReconstruction = await request(`/heritage/${heritageId}/reconstruction`, {
      method: "POST", token: userA.token, status: hasVerifiedHistoricalSource ? 503 : 422,
    });
    expect(unavailableReconstruction.code === (hasVerifiedHistoricalSource ? "provider_not_configured" : "verified_historical_reference_required"),
      "Image reconstruction did not clearly report its missing source or provider prerequisite");
  }
  const profile = await request("/users/me", { token: userA.token });
  expect(profile.user.role === "user", "Profile did not retain least-privileged role");
  await request("/users/me", { method: "PATCH", token: userA.token, body: { name: "Smoke Test One Updated" } });
  await request("/admin/dashboard", { token: userA.token, status: 403 });
  await request("/admin/categories", { method: "POST", token: userA.token, body: { name: "Forbidden", slug: "forbidden" }, status: 403 });
  await request(`/admin/heritage/${heritageId}`, { method: "DELETE", token: userA.token, status: 403 });

  await request("/favorites", { method: "POST", token: userA.token, body: { heritage_id: heritageId }, status: 201 });
  await request("/favorites", { method: "POST", token: userA.token, body: { heritage_id: heritageId }, status: 200 });
  const favoritesA = await request("/favorites", { token: userA.token });
  const favoritesB = await request("/favorites", { token: userB.token });
  expect(favoritesA.favorites.some((item) => item.heritage.id === heritageId), "Favorite was not persisted for its owner");
  expect(favoritesB.favorites.length === 0, "Favorite leaked to another account");
  await request(`/favorites/${heritageId}`, { method: "DELETE", token: userA.token });

  await request("/visited", { method: "POST", token: userA.token, body: { heritage_id: heritageId }, status: 201 });
  const visited = await request("/visited", { token: userA.token });
  expect(visited.visited.some((item) => item.heritage.id === heritageId), "Visited place was not persisted");
  await request(`/visited/${heritageId}`, { method: "DELETE", token: userA.token });

  const createdReview = await request(`/heritage/${heritageId}/reviews`, { method: "POST", token: userA.token, body: { rating: 5, comment: "Temporary integration smoke review" }, status: 201 });
  const reviewId = createdReview.review.id;
  await request(`/reviews/${reviewId}`, { method: "PATCH", token: userB.token, body: { rating: 1, comment: "unauthorized" }, status: 404 });
  await request(`/reviews/${reviewId}`, { method: "DELETE", token: userB.token, status: 404 });
  await request(`/reviews/${reviewId}`, { method: "PATCH", token: userA.token, body: { rating: 4, comment: "Temporary integration smoke review updated" } });
  const reviews = await request(`/heritage/${heritageId}/reviews`);
  expect(reviews.reviews.some((review) => review.id === reviewId), "Public review list omitted the saved review");
  await request(`/reviews/${reviewId}`, { method: "DELETE", token: userA.token });

  const createdJourney = await request("/journeys", { method: "POST", token: userA.token, body: { name: "Smoke journey", description: "Temporary integration check" }, status: 201 });
  const journeyId = createdJourney.journey.id;
  const listed = await request("/journeys", { token: userA.token });
  expect(listed.journeys.some((journey) => journey.id === journeyId), "Journey was not listed for its owner");
  await request(`/journeys/${journeyId}`, { token: userB.token, status: 404 });
  await request(`/journeys/${journeyId}`, { method: "PATCH", token: userB.token, body: { name: "Unauthorized edit" }, status: 404 });
  await request(`/journeys/${journeyId}`, { method: "PATCH", token: userA.token, body: { name: "Smoke journey updated", description: "Updated" } });
  const stopOne = await request(`/journeys/${journeyId}/stops`, { method: "POST", token: userA.token, body: { heritage_id: heritageId, stop_order: 1 }, status: 201 });
  await request(`/journeys/${journeyId}/stops`, { method: "POST", token: userA.token, body: { heritage_id: otherHeritageId, stop_order: 2 }, status: 201 });
  const journey = await request(`/journeys/${journeyId}`, { token: userA.token });
  expect(journey.journey.stops.length === 2, "Journey stops were not persisted in order");
  await request(`/journeys/${journeyId}/stops/${stopOne.stop.id}`, { method: "DELETE", token: userB.token, status: 404 });
  await request(`/journeys/${journeyId}/stops/${stopOne.stop.id}`, { method: "DELETE", token: userA.token });
  await request(`/journeys/${journeyId}`, { method: "DELETE", token: userA.token });
  await request(`/journeys/${journeyId}`, { method: "DELETE", token: userB.token, status: 404 });

  const routeJourney = await request("/journeys", { method: "POST", token: userA.token, body: { name: "Coordinate route smoke", description: "Temporary route gate check" }, status: 201 });
  await request(`/journeys/${routeJourney.journey.id}/stops`, { method: "POST", token: userA.token, body: { heritage_id: routePlaces[0].id, stop_order: 1 }, status: 201 });
  await request(`/journeys/${routeJourney.journey.id}/stops`, { method: "POST", token: userA.token, body: { heritage_id: routePlaces[1].id, stop_order: 2 }, status: 201 });
  const routeResponse = await fetchForRequests(`${API}/journeys/${routeJourney.journey.id}/route`, {
    redirect: "error",
    headers: { authorization: `Bearer ${userA.token}` },
  });
  const routePayload = await routeResponse.json().catch(() => ({}));
  let routeOutcome;
  if (routeResponse.status === 200) {
    expect(routePayload.route?.geometry?.coordinates?.length > 1, "The configured provider did not return usable route geometry");
    expect(routePayload.route?.distance_meters >= 0 && routePayload.route?.duration_kind === "estimated", "The configured provider did not return estimated route metrics");
    routeOutcome = "provider returned geometry and estimated metrics";
  } else if (routeResponse.status === 503 && routePayload.code === "ROUTING_PROVIDER_NOT_CONFIGURED") {
    routeOutcome = "verified coordinates accepted; provider not configured (503 fallback)";
  } else if (routeResponse.status === 502 && routePayload.code === "ROUTE_PROVIDER_UNAVAILABLE") {
    routeOutcome = "verified coordinates accepted; provider unavailable (502 fallback)";
  } else {
    throw new Error(`Verified coordinate route returned an unexpected result: HTTP ${routeResponse.status} (${routePayload.code || "no code"})`);
  }
  checks += 1;
  await request(`/journeys/${routeJourney.journey.id}`, { method: "DELETE", token: userA.token });

  return { status: "PASS", checks, public_catalog: "Maharashtra search/category/pagination/detail citations", verified_image_metadata: "selected detail response includes an attributed verified image", reconstruction: reconstructionStatus.reconstruction.configured ? "provider configured; external generation not called" : "authenticated API reports provider not configured", verified_coordinates: "approved Maharashtra source citations exposed through the API", routing: routeOutcome, accounts: "signup/signin/profile/roles", user_features: "favorites/visited/reviews/journeys", authorization: "anonymous and cross-user access rejected" };
}

async function main({ env = process.env, fetchImpl = globalThis.fetch, createPool = createSmokePool } = {}) {
  failures.length = 0;
  checks = 0;
  mutationAttempted = false;
  let summary = null;
  try {
    const verified = await verifySmokeTargets({ env, fetchImpl, createPool });
    pool = verified.pool;
    API = verified.api.apiBase;
    HEALTH = verified.api.healthUrl;
    fetchForRequests = fetchImpl;
    cleanupTarget = verified;
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    testUsers = [
      { name: "Smoke Test One", email: `hv-smoke-one-${tag}@example.test`, password: `Smoke-${tag}-Aa9!` },
      { name: "Smoke Test Two", email: `hv-smoke-two-${tag}@example.test`, password: `Smoke-${tag}-Bb8!` },
    ];
    console.log(`Verified isolated smoke target: ${verified.target.databaseName} on loopback (${verified.target.serverAddress}:${verified.target.serverPort}).`);
    summary = await runSmokeChecks();
  } catch (error) {
    failures.push(error?.message || "Integration smoke failed.");
  } finally {
    if (pool && mutationAttempted && cleanupTarget) {
      try {
        await verifyCleanupTarget(
          cleanupTarget.api,
          pool,
          cleanupTarget.token,
          cleanupTarget.target,
          cleanupTarget.environment,
          fetchImpl,
        );
        const removed = await pool.query(
          "DELETE FROM users WHERE email = ANY($1::text[]) AND COALESCE(to_jsonb(users) ->> 'role', 'user') = 'user' RETURNING id",
          [testUsers.map((user) => user.email)],
        );
        if (removed.rowCount > 0) console.log(`Cleaned up ${removed.rowCount} temporary test account(s) in the verified smoke database.`);
        if (!failures.length && removed.rowCount !== testUsers.length) {
          failures.push(`Cleanup removed ${removed.rowCount} of ${testUsers.length} temporary test accounts.`);
        }
      } catch {
        failures.push("Cleanup skipped or failed because the API and cleanup database targets could not be reverified.");
      }
    } else if (mutationAttempted) {
      failures.push("Cleanup skipped because the isolated test target was not verified.");
    }

    if (pool) {
      try { await pool.end(); } catch { failures.push("Could not close the isolated smoke database connection pool."); }
    }
    pool = null;
  }

  if (failures.length) {
    console.error(JSON.stringify({ status: "FAIL", checks, errors: failures }, null, 2));
    process.exitCode = 1;
    return { status: "FAIL", checks, errors: [...failures] };
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) {
  main();
}

module.exports = {
  assertMatchingDatabaseTargets,
  main,
  validateApiTarget,
  validateDatabaseUrl,
  verifyCleanupTarget,
  verifySmokeTargets,
};
