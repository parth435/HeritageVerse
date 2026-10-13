#!/usr/bin/env node
"use strict";

const pool = require("../config/db");

const API = process.env.HERITAGEVERSE_API || "http://127.0.0.1:5000/api";
const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const testUsers = [
  { name: "Smoke Test One", email: `hv-smoke-one-${tag}@example.test`, password: `Smoke-${tag}-Aa9!` },
  { name: "Smoke Test Two", email: `hv-smoke-two-${tag}@example.test`, password: `Smoke-${tag}-Bb8!` },
];
const failures = [];
let checks = 0;

async function request(path, { method = "GET", token, body, status = 200 } = {}) {
  const response = await fetch(`${API}${path}`, {
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

async function main() {
  const health = await request("/../", { status: 200 });
  expect(health.success === true, "Backend health check did not return success");

  const museumPage = await request("/heritage?category=museum&limit=50");
  expect(museumPage.items.length === 2, "Museum category should contain exactly the two seeded museum records");
  expect(museumPage.items.every((item) => item.category.slug === "museum"), "Museum filter leaked a different category");
  expect(museumPage.pagination.total === 2, "Museum pagination total is incorrect");
  const search = await request("/heritage?q=Indian%20Museum&limit=10");
  expect(search.items.some((item) => item.slug === "indian-museum-kolkata"), "Search did not find the Indian Museum");
  const pageOne = await request("/heritage?limit=1&offset=0");
  const pageTwo = await request("/heritage?limit=1&offset=1");
  expect(pageOne.items[0]?.id !== pageTwo.items[0]?.id, "Pagination returned the same record twice");
  const facets = await request("/heritage-facets");
  expect(facets.states.length >= 30, "State filter options did not cover the complete catalogue");
  const jharkhandFacets = await request("/heritage-facets?state=Jharkhand");
  expect(jharkhandFacets.districts.length > 0, "State-specific district filter options did not load");

  const detail = await request("/heritage/78");
  expect(detail.heritage.sources?.[0]?.source_title === "History of the Museum", "Detail response omitted source citation metadata");
  expect(detail.heritage.locality === null || typeof detail.heritage.locality === "string", "Detail response omitted locality field");
  expect(detail.heritage.category.slug === "museum", "Museum detail has the wrong category");

  const [tajSearch, agraSearch] = await Promise.all([
    request("/heritage?q=Taj%20Mahal&limit=10"),
    request("/heritage?q=Agra%20Fort&limit=10"),
  ]);
  const routePlaces = [
    tajSearch.items.find((item) => item.slug === "taj-mahal"),
    agraSearch.items.find((item) => item.slug === "agra-fort"),
  ];
  expect(routePlaces.every((place) => place?.coordinates_verified === true), "The official coordinate citations were not exposed as verified through the API");
  const tajDetail = await request("/heritage/15");
  const tajCoordinateSource = tajDetail.heritage.sources.find((source) => source.claims_supported?.includes("coordinates"));
  expect(tajCoordinateSource?.review_status === "approved", "Taj Mahal coordinate provenance did not preserve its approved review state");
  const comparisonImages = tajDetail.heritage.media.filter((media) => ["historical", "current"].includes(media.media_role));
  expect(comparisonImages.length === 2 && comparisonImages.some((media) => media.media_role === "historical") && comparisonImages.some((media) => media.media_role === "current"), "Then & Now did not return a sourced historical/current image pair");
  expect(comparisonImages.every((media) => media.verification_status === "verified" && media.source_url?.startsWith("https://") && media.creator && media.documented_date && media.license && media.license_url?.startsWith("https://") && media.source_accessed_on), "Then & Now image attribution metadata is incomplete");
  const reconstructionStatus = await request("/reconstruction/status");
  expect(typeof reconstructionStatus.reconstruction?.configured === "boolean" && !("api_key" in reconstructionStatus.reconstruction) && !("endpoint" in reconstructionStatus.reconstruction), "Reconstruction status leaked configuration details");
  await request("/heritage/15/reconstruction", { method: "POST", status: 401 });

  const anonymousFavorites = await request("/favorites", { status: 401 });
  expect(anonymousFavorites.success === false, "Anonymous favorites request was not rejected");
  await request("/admin/dashboard", { status: 401 });

  const first = await request("/auth/signup", { method: "POST", body: testUsers[0], status: 201 });
  const second = await request("/auth/signup", { method: "POST", body: testUsers[1], status: 201 });
  expect(first.user.role === "user" && second.user.role === "user", "Signup assigned an unexpected role");
  const userA = await request("/auth/signin", { method: "POST", body: { email: testUsers[0].email, password: testUsers[0].password } });
  const userB = await request("/auth/signin", { method: "POST", body: { email: testUsers[1].email, password: testUsers[1].password } });
  expect(Boolean(userA.token && userB.token), "Login did not return authenticated sessions");
  await request("/auth/me", { token: userA.token });
  if (!reconstructionStatus.reconstruction.configured) {
    const unavailableReconstruction = await request("/heritage/15/reconstruction", { method: "POST", token: userA.token, status: 503 });
    expect(unavailableReconstruction.code === "provider_not_configured", "Unconfigured image reconstruction did not return its explicit provider status");
  }
  const profile = await request("/users/me", { token: userA.token });
  expect(profile.user.role === "user", "Profile did not retain least-privileged role");
  await request("/users/me", { method: "PATCH", token: userA.token, body: { name: "Smoke Test One Updated" } });
  await request("/admin/dashboard", { token: userA.token, status: 403 });
  await request("/admin/categories", { method: "POST", token: userA.token, body: { name: "Forbidden", slug: "forbidden" }, status: 403 });
  await request("/admin/heritage/78", { method: "DELETE", token: userA.token, status: 403 });

  await request("/favorites", { method: "POST", token: userA.token, body: { heritage_id: 78 }, status: 201 });
  await request("/favorites", { method: "POST", token: userA.token, body: { heritage_id: 78 }, status: 200 });
  const favoritesA = await request("/favorites", { token: userA.token });
  const favoritesB = await request("/favorites", { token: userB.token });
  expect(favoritesA.favorites.some((item) => item.heritage.id === 78), "Favorite was not persisted for its owner");
  expect(favoritesB.favorites.length === 0, "Favorite leaked to another account");
  await request("/favorites/78", { method: "DELETE", token: userA.token });

  await request("/visited", { method: "POST", token: userA.token, body: { heritage_id: 78 }, status: 201 });
  const visited = await request("/visited", { token: userA.token });
  expect(visited.visited.some((item) => item.heritage.id === 78), "Visited place was not persisted");
  await request("/visited/78", { method: "DELETE", token: userA.token });

  const createdReview = await request("/heritage/78/reviews", { method: "POST", token: userA.token, body: { rating: 5, comment: "Temporary integration smoke review" }, status: 201 });
  const reviewId = createdReview.review.id;
  await request(`/reviews/${reviewId}`, { method: "PATCH", token: userB.token, body: { rating: 1, comment: "unauthorized" }, status: 404 });
  await request(`/reviews/${reviewId}`, { method: "DELETE", token: userB.token, status: 404 });
  await request(`/reviews/${reviewId}`, { method: "PATCH", token: userA.token, body: { rating: 4, comment: "Temporary integration smoke review updated" } });
  const reviews = await request("/heritage/78/reviews");
  expect(reviews.reviews.some((review) => review.id === reviewId), "Public review list omitted the saved review");
  await request(`/reviews/${reviewId}`, { method: "DELETE", token: userA.token });

  const createdJourney = await request("/journeys", { method: "POST", token: userA.token, body: { name: "Smoke journey", description: "Temporary integration check" }, status: 201 });
  const journeyId = createdJourney.journey.id;
  const listed = await request("/journeys", { token: userA.token });
  expect(listed.journeys.some((journey) => journey.id === journeyId), "Journey was not listed for its owner");
  await request(`/journeys/${journeyId}`, { token: userB.token, status: 404 });
  await request(`/journeys/${journeyId}`, { method: "PATCH", token: userB.token, body: { name: "Unauthorized edit" }, status: 404 });
  await request(`/journeys/${journeyId}`, { method: "PATCH", token: userA.token, body: { name: "Smoke journey updated", description: "Updated" } });
  const stopOne = await request(`/journeys/${journeyId}/stops`, { method: "POST", token: userA.token, body: { heritage_id: 78, stop_order: 1 }, status: 201 });
  await request(`/journeys/${journeyId}/stops`, { method: "POST", token: userA.token, body: { heritage_id: 79, stop_order: 2 }, status: 201 });
  const journey = await request(`/journeys/${journeyId}`, { token: userA.token });
  expect(journey.journey.stops.length === 2, "Journey stops were not persisted in order");
  const missingRoute = await request(`/journeys/${journeyId}/route`, { token: userA.token, status: 422 });
  expect(missingRoute.code === "ROUTE_COORDINATES_MISSING", "Route calculation did not clearly report stops without verified coordinates");
  await request(`/journeys/${journeyId}/stops/${stopOne.stop.id}`, { method: "DELETE", token: userB.token, status: 404 });
  await request(`/journeys/${journeyId}/stops/${stopOne.stop.id}`, { method: "DELETE", token: userA.token });
  await request(`/journeys/${journeyId}`, { method: "DELETE", token: userA.token });
  await request(`/journeys/${journeyId}`, { method: "DELETE", token: userB.token, status: 404 });

  const routeJourney = await request("/journeys", { method: "POST", token: userA.token, body: { name: "Coordinate route smoke", description: "Temporary route gate check" }, status: 201 });
  await request(`/journeys/${routeJourney.journey.id}/stops`, { method: "POST", token: userA.token, body: { heritage_id: routePlaces[0].id, stop_order: 1 }, status: 201 });
  await request(`/journeys/${routeJourney.journey.id}/stops`, { method: "POST", token: userA.token, body: { heritage_id: routePlaces[1].id, stop_order: 2 }, status: 201 });
  const routeResponse = await fetch(`${API}/journeys/${routeJourney.journey.id}/route`, { headers: { authorization: `Bearer ${userA.token}` } });
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

  console.log(JSON.stringify({ status: "PASS", checks, public_catalog: "search/category/pagination/detail citations", then_now: "historical/current media and attribution returned by the real API", reconstruction: reconstructionStatus.reconstruction.configured ? "provider configured; external generation not called" : "authenticated API reports provider not configured", verified_coordinates: "approved source citations exposed through the API", routing: routeOutcome, accounts: "signup/signin/profile/roles", user_features: "favorites/visited/reviews/journeys", authorization: "anonymous and cross-user access rejected" }, null, 2));
}

main()
  .catch((error) => {
    failures.push(error.message);
    console.error(JSON.stringify({ status: "FAIL", checks, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const removed = await pool.query(
        "DELETE FROM users WHERE email = ANY($1::text[]) AND COALESCE(to_jsonb(users) ->> 'role', 'user') = 'user' RETURNING id",
        [testUsers.map((user) => user.email)],
      );
      if (removed.rowCount > 0) console.log(`Cleaned up ${removed.rowCount} temporary test account(s) and their owned data.`);
      if (!failures.length && removed.rowCount !== testUsers.length) {
        console.error(`Cleanup removed ${removed.rowCount} of ${testUsers.length} temporary test accounts.`);
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`Temporary account cleanup failed: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  });
