"use strict";

const express = require("express");
const { createAttemptLimiter } = require("../middleware/rate-limit");

const DEFAULT_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_USER_AGENT = "HeritageVerse/1.0 (https://github.com/parth435/HeritageVerse)";
const LOCATION_SEARCH_ATTRIBUTION = "Location search by OpenStreetMap contributors (ODbL).";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 500;

function safeSearchUrl(value) {
  try {
    const url = new URL(value || DEFAULT_SEARCH_URL);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "nominatim.openstreetmap.org" ||
      url.port ||
      url.pathname !== "/search" ||
      url.username || url.password || url.search || url.hash
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function parseResults(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const latitude = Number(item?.lat);
    const longitude = Number(item?.lon);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return [];
    if (typeof item?.display_name !== "string" || !item.display_name.trim()) return [];
    return [{
      label: item.display_name.trim(),
      latitude,
      longitude,
      osm_type: typeof item.osm_type === "string" ? item.osm_type : null,
      osm_id: typeof item.osm_id === "number" || typeof item.osm_id === "string" ? String(item.osm_id) : null,
      category: typeof item.category === "string" ? item.category : null,
      type: typeof item.type === "string" ? item.type : null,
    }];
  });
}

function createLocationSearchRouter({
  fetchImpl = globalThis.fetch,
  searchUrl = process.env.GEOCODER_SEARCH_URL || DEFAULT_SEARCH_URL,
  userAgent = process.env.GEOCODER_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
  requireConfiguredUserAgent = process.env.NODE_ENV === "production",
  userAgentIsConfigured = true,
  perMinuteLimiter,
  upstreamLimiter,
  minIntervalMs = 1000,
  now = Date.now,
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
} = {}) {
  const router = express.Router();
  const configuredUrl = safeSearchUrl(searchUrl);
  const perMinute = perMinuteLimiter ?? createAttemptLimiter({ windowMs: 60_000, limit: 12, maxKeys: 10_000 });
  const upstream = upstreamLimiter ?? createAttemptLimiter({ windowMs: 1_000, limit: 1, maxKeys: 1 });
  const cache = new Map();
  let lastUpstreamAt = 0;
  let requestChain = Promise.resolve();

  async function pacedFetch(url, signal) {
    const request = requestChain.then(async () => {
      const delay = Math.max(0, lastUpstreamAt + minIntervalMs - now());
      if (delay > 0) await wait(delay);
      lastUpstreamAt = now();
      return fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": userAgent }, signal });
    });
    requestChain = request.catch(() => {});
    return request;
  }

  router.get("/locations/search", async (req, res) => {
    const rawQuery = req.query.q;
    if (typeof rawQuery !== "string") return res.status(400).json({ success: false, code: "LOCATION_QUERY_INVALID", message: "Enter a place name or address to search." });
    if (/[\u0000-\u001f\u007f]/.test(rawQuery)) {
      return res.status(400).json({ success: false, code: "LOCATION_QUERY_INVALID", message: "Location search may contain ordinary spaces only." });
    }
    const query = rawQuery.trim().replace(/\s+/g, " ");
    if (query.length < 2 || query.length > 120) {
      return res.status(400).json({ success: false, code: "LOCATION_QUERY_INVALID", message: "Location search must be between 2 and 120 characters." });
    }
    if (!configuredUrl) return res.status(503).json({ success: false, code: "LOCATION_SEARCH_UNAVAILABLE", message: "Location search is not configured. Enter coordinates manually or try again later." });
    if (requireConfiguredUserAgent && !userAgentIsConfigured) return res.status(503).json({ success: false, code: "LOCATION_SEARCH_UNAVAILABLE", message: "Location search needs an identifying provider contact string before it can be used." });
    if (typeof fetchImpl !== "function") return res.status(503).json({ success: false, code: "LOCATION_SEARCH_UNAVAILABLE", message: "Location search is not available in this server runtime." });

    const rateKey = req.ip || req.socket?.remoteAddress || "unknown";
    const perMinuteRetry = perMinute.check(rateKey);
    if (perMinuteRetry) {
      res.setHeader("Retry-After", String(perMinuteRetry));
      return res.status(429).json({ success: false, code: "LOCATION_SEARCH_RATE_LIMITED", message: "Too many location searches. Wait a moment before searching again." });
    }

    const cacheKey = query.toLocaleLowerCase("en");
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return res.json({ success: true, results: cached.results, attribution: LOCATION_SEARCH_ATTRIBUTION });
    if (cached) cache.delete(cacheKey);

    const retryAfter = upstream.check("location-search-provider");
    if (retryAfter) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, code: "LOCATION_SEARCH_RATE_LIMITED", message: "Location searches are paced to respect the search provider. Try again shortly." });
    }

    try {
      const url = new URL(configuredUrl.href);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("countrycodes", "in");
      url.searchParams.set("limit", "5");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      let response;
      try {
        response = await pacedFetch(url, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        const status = response.status === 429 ? 503 : 502;
        return res.status(status).json({ success: false, code: "LOCATION_SEARCH_PROVIDER_ERROR", message: "The location search service could not complete this search. Enter coordinates manually or try again." });
      }
      const results = parseResults(await response.json()).slice(0, 5);
      cache.set(cacheKey, { results, expiresAt: now() + CACHE_TTL_MS });
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      return res.json({ success: true, results, attribution: LOCATION_SEARCH_ATTRIBUTION });
    } catch (error) {
      console.error("Location search provider failed:", error?.name === "AbortError" ? "timeout" : error?.code || "network error");
      return res.status(502).json({ success: false, code: "LOCATION_SEARCH_PROVIDER_ERROR", message: "The location search service is temporarily unavailable. Enter coordinates manually or try again." });
    }
  });

  return router;
}

const router = createLocationSearchRouter();
module.exports = router;
module.exports.createLocationSearchRouter = createLocationSearchRouter;
module.exports.parseResults = parseResults;
module.exports.safeSearchUrl = safeSearchUrl;
