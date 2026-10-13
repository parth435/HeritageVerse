"use strict";

const crypto = require("node:crypto");

const WIKIDATA_ENTITY_DATA = "https://www.wikidata.org/wiki/Special:EntityData/";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const MINIMUM_MATCH_CONFIDENCE = 0.95;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_CONTACT_URL = "https://github.com/parth435/HeritageVerse";

class WikimediaRequestError extends Error {
  constructor(code, message, retryable = false, diagnosticCode = null) {
    super(message);
    this.name = "WikimediaRequestError";
    this.code = code;
    this.retryable = retryable;
    this.diagnosticCode = typeof diagnosticCode === "string" && /^[A-Z0-9_]{1,48}$/.test(diagnosticCode) ? diagnosticCode : null;
  }
}

function sleep(milliseconds) {
  const waitInChunks = (duration) => new Promise((resolve) => {
    const chunk = Math.min(duration, 2_147_483_647);
    setTimeout(() => resolve(duration - chunk), chunk);
  });
  return (async () => {
    let left = Math.max(0, milliseconds);
    while (left > 0) left = await waitInChunks(left);
  })();
}

function parseContact(contact) {
  const value = String(contact ?? "").trim();
  if (!value) throw new Error("Set HERITAGEVERSE_WIKIMEDIA_CONTACT to a contact email or HTTPS project URL before using the importer.");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    // The value is checked again with an email pattern above.
  }
  throw new Error("HERITAGEVERSE_WIKIMEDIA_CONTACT must be an email address or an HTTPS URL.");
}

function createUserAgent(contact = process.env.HERITAGEVERSE_WIKIMEDIA_CONTACT || DEFAULT_CONTACT_URL) {
  return `HeritageVerseImageImporter/1.0 (${parseContact(contact)})`;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an) /, "");
}

function safeCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function distanceKm(first, second) {
  if (!first || !second) return null;
  const radians = (degrees) => degrees * (Math.PI / 180);
  const lat1 = radians(first.latitude);
  const lat2 = radians(second.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(second.longitude - first.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validQid(value) {
  return typeof value === "string" && /^Q[1-9]\d*$/.test(value);
}

function entityCoordinate(entity) {
  const value = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  const latitude = safeCoordinate(value?.latitude, -90, 90);
  const longitude = safeCoordinate(value?.longitude, -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function entityCountryIsIndia(entity) {
  return (entity?.claims?.P17 ?? []).some((claim) => claim?.mainsnak?.datavalue?.value?.id === "Q668");
}

function entityOfficialNames(entity) {
  return (entity?.claims?.P1448 ?? [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => value && typeof value.text === "string" && (!value.language || /^en(?:[-_]|$)/i.test(value.language)))
    .map((value) => value.text.trim())
    .filter(Boolean);
}

function parseWikidataEntityData(payload, qid) {
  if (!validQid(qid)) throw new WikimediaRequestError("invalid_qid", "Wikidata returned an invalid entity identifier");
  const entity = payload?.entities?.[qid];
  if (!entity || entity.missing !== undefined || entity.id !== qid) {
    throw new WikimediaRequestError("entity_missing", "Wikidata entity data was missing or malformed");
  }
  const labels = entity.labels ?? {};
  const aliases = entity.aliases ?? {};
  const label = labels.en?.value ?? Object.values(labels)[0]?.value ?? "";
  const aliasValues = Object.values(aliases).flatMap((items) => Array.isArray(items) ? items.map((item) => item?.value).filter(Boolean) : []);
  const images = (entity.claims?.P18 ?? [])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => typeof value === "string" && value.trim());
  return {
    qid,
    label,
    aliases: [...new Set(aliasValues)],
    officialNames: [...new Set(entityOfficialNames(entity))],
    description: entity.descriptions?.en?.value ?? Object.values(entity.descriptions ?? {})[0]?.value ?? "",
    coordinate: entityCoordinate(entity),
    countryIsIndia: entityCountryIsIndia(entity),
    imageFiles: [...new Set(images)],
  };
}

function parseSearchEntities(payload) {
  if (!Array.isArray(payload?.search)) throw new WikimediaRequestError("wikidata_search_malformed", "Wikidata search response was malformed");
  return payload.search
    .filter((item) => validQid(item?.id))
    .map((item) => ({
      qid: item.id,
      label: typeof item.label === "string" ? item.label : "",
      description: typeof item.description === "string" ? item.description : "",
    }));
}

function parseEntityBatch(payload, qids) {
  if (!payload?.entities || typeof payload.entities !== "object") {
    throw new WikimediaRequestError("wikidata_entities_malformed", "Wikidata entity response was malformed");
  }
  return qids.filter(validQid).map((qid) => {
    const entity = payload.entities[qid];
    if (!entity || entity.missing !== undefined) return null;
    const labels = entity.labels ?? {};
    const aliasRows = entity.aliases ?? {};
    return {
      qid,
      label: labels.en?.value ?? Object.values(labels)[0]?.value ?? "",
      aliases: Object.values(aliasRows).flatMap((rows) => Array.isArray(rows) ? rows.map((row) => row?.value).filter(Boolean) : []),
      officialNames: [...new Set(entityOfficialNames(entity))],
      description: entity.descriptions?.en?.value ?? Object.values(entity.descriptions ?? {})[0]?.value ?? "",
      coordinate: entityCoordinate(entity),
      countryIsIndia: entityCountryIsIndia(entity),
    };
  }).filter(Boolean);
}

function contextText(site) {
  return [site.locality, site.district, site.state, site.country ?? "India"].filter(Boolean).join(" ");
}

function scoreEntityMatch(site, entity) {
  const siteName = normalizeText(site.name);
  const label = normalizeText(entity.label);
  const aliases = (entity.aliases ?? []).map(normalizeText).filter(Boolean);
  const officialNames = (entity.officialNames ?? []).map(normalizeText).filter(Boolean);
  const nameEvidence = [label, ...aliases, ...officialNames].filter(Boolean);
  if (!siteName || !nameEvidence.length) return 0;
  let confidence;
  if (label === siteName) confidence = 0.88;
  else if (officialNames.includes(siteName)) confidence = 0.88;
  else if (aliases.includes(siteName)) confidence = 0.86;
  else {
    const significantWords = (value) => value.split(" ").filter((word) => word.length > 2 && !["the", "and", "for", "from", "with"].includes(word));
    const siteWords = significantWords(siteName);
    const canonicalSiteWords = [...siteWords].sort().join(" ");
    const exactWordOrderVariant = nameEvidence.some((name) => {
      const words = significantWords(name);
      return words.length >= 2 && [...words].sort().join(" ") === canonicalSiteWords;
    });
    if (exactWordOrderVariant) confidence = 0.88;
    else {
      const overlap = siteWords.filter((word) => nameEvidence.some((name) => name.split(" ").includes(word)));
      const ratio = overlap.length / Math.max(1, siteWords.length);
      if (ratio < 0.75) return 0;
      confidence = 0.62 + ratio * 0.15;
    }
  }

  const descriptiveContext = normalizeText([entity.label, entity.description, ...(entity.aliases ?? []), ...(entity.officialNames ?? [])].join(" "));
  const locality = normalizeText(site.locality);
  const district = normalizeText(site.district);
  const state = normalizeText(site.state);
  if (locality && locality.length >= 4 && descriptiveContext.includes(locality)) confidence += 0.035;
  else if (district && district.length >= 4 && descriptiveContext.includes(district)) confidence += 0.03;
  if (state && state.length >= 4 && descriptiveContext.includes(state)) confidence += 0.035;
  if (entity.countryIsIndia || /\bindia\b/.test(descriptiveContext)) confidence += 0.035;

  const siteCoordinate = {
    latitude: safeCoordinate(site.latitude, -90, 90),
    longitude: safeCoordinate(site.longitude, -180, 180),
  };
  const km = siteCoordinate.latitude === null || siteCoordinate.longitude === null ? null : distanceKm(siteCoordinate, entity.coordinate);
  if (km !== null) {
    if (km > 50) return 0;
    confidence += km <= 2 ? 0.12 : km <= 10 ? 0.09 : km <= 25 ? 0.055 : 0.02;
  }
  return Math.min(0.995, Number(confidence.toFixed(3)));
}

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/(?:p|div|li)>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function metadataValue(extmetadata, key) {
  const item = extmetadata?.[key];
  return item && typeof item.value === "string" ? decodeHtmlText(item.value) : "";
}

function reliableAttribution(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/\b(?:no machine readable|not machine readable|assumed|unknown|unidentified|not provided|unavailable)\b/i.test(text)) return null;
  return text;
}

function allowedWikimediaImageUrl(value, allowThumbnail = false) {
  try {
    const url = new URL(value);
    const allowedHosts = allowThumbnail ? new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]) : new Set(["upload.wikimedia.org"]);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowedHosts.has(url.hostname) && url.pathname.startsWith("/wikipedia/commons/") ? url.href : null;
  } catch {
    return null;
  }
}

function allowedCommonsPageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/") ? url.href : null;
  } catch {
    return null;
  }
}

function parseCommonsImageInfo(page, heritageName = "") {
  if (!page || page.ns !== 6 || typeof page.title !== "string" || !Array.isArray(page.imageinfo) || !page.imageinfo[0]) {
    throw new WikimediaRequestError("commons_image_malformed", "Wikimedia Commons returned incomplete image metadata");
  }
  const info = page.imageinfo[0];
  const url = allowedWikimediaImageUrl(info.url);
  const thumbnailUrl = allowedWikimediaImageUrl(info.thumburl, true) ?? url;
  const sourceUrl = allowedCommonsPageUrl(info.descriptionurl) ?? allowedCommonsPageUrl(info.canonicaltitle && `https://commons.wikimedia.org/wiki/${encodeURIComponent(info.canonicaltitle.replace(/ /g, "_"))}`);
  const ext = info.extmetadata ?? {};
  const license = metadataValue(ext, "LicenseShortName") || metadataValue(ext, "UsageTerms");
  const licenseUrlValue = metadataValue(ext, "LicenseUrl");
  let licenseUrl = null;
  try {
    const parsed = new URL(licenseUrlValue);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) licenseUrl = parsed.href;
  } catch {
    licenseUrl = null;
  }
  const creator = reliableAttribution(metadataValue(ext, "Artist") || metadataValue(ext, "Creator") || metadataValue(ext, "Author"));
  const originalDate = metadataValue(ext, "DateTimeOriginal");
  const generalDate = metadataValue(ext, "Date");
  const sourceAttribution = reliableAttribution(metadataValue(ext, "Attribution") || metadataValue(ext, "Credit"));
  const credit = sourceAttribution || (creator && license ? `${creator} (${license}) via Wikimedia Commons` : null);
  const filename = page.title.replace(/^File:/i, "").trim();
  const title = metadataValue(ext, "ObjectName") || filename;
  const description = metadataValue(ext, "ImageDescription") || "";
  const missingMetadata = [];
  if (!url) missingMetadata.push("safe original image URL");
  if (!sourceUrl) missingMetadata.push("Commons description page");
  if (!creator && !sourceAttribution) missingMetadata.push("creator or attribution");
  if (!license) missingMetadata.push("license name");
  if (!licenseUrl) missingMetadata.push("license URL");
  return {
    provider: "wikimedia",
    filename,
    url,
    thumbnailUrl,
    sourceUrl,
    title,
    description,
    creator,
    license: license || null,
    licenseUrl,
    credit,
    altText: `${heritageName || title} photograph from Wikimedia Commons`,
    uploadedAt: typeof info.timestamp === "string" ? info.timestamp : null,
    documentedDate: originalDate || generalDate || null,
    documentedDateSource: originalDate ? "DateTimeOriginal" : generalDate ? "Date" : null,
    missingMetadata,
    hasRequiredMetadata: missingMetadata.length === 0,
  };
}

function classifyMediaRole(image, currentYear = new Date().getUTCFullYear()) {
  if (!image?.documentedDate || !image?.documentedDateSource) return "gallery";
  const years = [...String(image.documentedDate).matchAll(/(?:^|\D)((?:17|18|19|20)\d{2})(?=\D|$)/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1700 && year <= currentYear);
  if (!years.length) return "gallery";
  const oldestYear = Math.min(...years);
  const newestYear = Math.max(...years);
  if (newestYear <= 1947) return "historical";
  if (oldestYear >= 2000) return "current";
  return "gallery";
}

function scoreCommonsMatch(site, image, pageCoordinate = null) {
  const siteName = normalizeText(site.name);
  const filename = normalizeText(image.filename.replace(/\.[^.]+$/, ""));
  const description = normalizeText(image.title + " " + image.description);
  if (!siteName || !filename) return 0;
  let confidence = 0;
  if (filename === siteName || description === siteName) confidence = 0.89;
  else if (filename.includes(siteName) || description.includes(siteName)) confidence = 0.83;
  else {
    const words = siteName.split(" ").filter((word) => word.length > 2);
    const matches = words.filter((word) => filename.split(" ").includes(word) || description.split(" ").includes(word));
    if (!words.length || matches.length !== words.length) return 0;
    confidence = 0.72;
  }
  const context = normalizeText(contextText(site));
  const state = normalizeText(site.state);
  const locality = normalizeText(site.locality);
  const descriptiveText = `${filename} ${description}`;
  if (locality && locality.length >= 4 && descriptiveText.includes(locality)) confidence += 0.035;
  else if (state && state.length >= 4 && descriptiveText.includes(state)) confidence += 0.035;
  if (descriptiveText.includes("india")) confidence += 0.025;
  const lat = safeCoordinate(site.latitude, -90, 90);
  const lon = safeCoordinate(site.longitude, -180, 180);
  if (lat !== null && lon !== null && pageCoordinate) {
    const km = distanceKm({ latitude: lat, longitude: lon }, pageCoordinate);
    if (km > 50) return 0;
    confidence += km <= 2 ? 0.12 : km <= 10 ? 0.09 : km <= 25 ? 0.05 : 0.015;
  }
  void context;
  return Math.min(0.995, Number(confidence.toFixed(3)));
}

async function discoverEntityMatch(site, client, options = {}) {
  const threshold = options.threshold ?? MINIMUM_MATCH_CONFIDENCE;
  let candidates;
  if (site.wikidata_qid) {
    const entity = await client.loadEntityData(site.wikidata_qid);
    const confidence = scoreEntityMatch(site, entity);
    const candidate = { ...entity, confidence };
    if (confidence < threshold) {
      return {
        status: "needs_review",
        matchedQid: null,
        confidence,
        candidates: [candidateSummary(candidate)],
        errorCode: "stored_qid_needs_review",
        errorMessage: "The stored Wikidata entity does not meet the automatic name/location threshold",
      };
    }
    return { status: "matched", matchedQid: entity.qid, confidence, candidates: [candidateSummary(candidate)], errorCode: null, errorMessage: null };
  }

  candidates = await client.searchWikidata(site);
  const best = candidates[0];
  const second = candidates[1];
  if (!best) {
    return { status: "not_found", matchedQid: null, confidence: null, candidates: [], errorCode: "wikidata_entity_not_found", errorMessage: "No Wikidata entity matched the heritage name and location" };
  }
  const ambiguous = second && best.confidence - second.confidence < 0.06;
  if (ambiguous || best.confidence < threshold) {
    return {
      status: "needs_review",
      matchedQid: null,
      confidence: best.confidence,
      candidates: candidates.slice(0, 5).map(candidateSummary),
      errorCode: ambiguous ? "ambiguous_entity_match" : "entity_match_below_threshold",
      errorMessage: ambiguous ? "Multiple Wikidata entities matched; manual review is required" : "The Wikidata entity match did not meet the automatic verification threshold",
    };
  }

  const entity = await client.loadEntityData(best.qid);
  const confidence = scoreEntityMatch(site, entity);
  const candidate = { ...entity, confidence };
  if (confidence < threshold) {
    return {
      status: "needs_review",
      matchedQid: null,
      confidence,
      candidates: [candidateSummary(candidate)],
      errorCode: "entity_match_below_threshold",
      errorMessage: "The Wikidata entity data did not confirm the search-result match",
    };
  }
  return { status: "matched", matchedQid: entity.qid, confidence, candidates: [candidateSummary(candidate)], errorCode: null, errorMessage: null };
}

function createWikimediaClient(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("This Node.js runtime does not provide fetch");
  const userAgent = options.userAgent ?? createUserAgent(options.contact);
  const delayMs = options.delayMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetries = options.maxRetries ?? 4;
  const sleepImpl = options.sleepImpl ?? sleep;
  const now = options.now ?? Date.now;
  const cacheStore = options.cacheStore ?? null;
  const writeCache = options.writeCache ?? true;
  const cache = new Map();
  let nextRequestAt = 0;
  let requestQueue = Promise.resolve();

  async function readCache(key) {
    if (cache.has(key)) return cache.get(key);
    if (!cacheStore) return null;
    try {
      const result = await cacheStore.query(
        "SELECT response FROM heritage_provider_cache WHERE cache_key = $1 AND expires_at > NOW()",
        [key],
      );
      const response = result.rows[0]?.response ?? null;
      if (response) cache.set(key, response);
      return response;
    } catch {
      return null;
    }
  }

  async function saveCache(key, value) {
    cache.set(key, value);
    if (!cacheStore || !writeCache) return;
    try {
      await cacheStore.query(
        `INSERT INTO heritage_provider_cache (cache_key, response, expires_at)
         VALUES ($1, $2::jsonb, NOW() + ($3 * INTERVAL '1 millisecond'))
         ON CONFLICT (cache_key) DO UPDATE SET response = EXCLUDED.response, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [key, JSON.stringify(value), CACHE_TTL_MS],
      );
    } catch {
      // A cache write failure must not turn a valid provider response into a failed import.
    }
  }

  async function fetchPaced(url) {
    const previous = requestQueue;
    let release;
    requestQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, nextRequestAt - now());
      if (wait) await sleepImpl(wait);
      nextRequestAt = now() + delayMs;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json", "User-Agent": userAgent },
          signal: controller.signal,
          redirect: "error",
        });
      } catch (error) {
        if (controller.signal.aborted) throw new WikimediaRequestError("provider_timeout", "Wikimedia request timed out", true);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      release();
    }
  }

  async function requestJson(url) {
    const allowedHost = new Set(["www.wikidata.org", "commons.wikimedia.org"]);
    if (!(url instanceof URL) || url.protocol !== "https:" || !allowedHost.has(url.hostname) || url.username || url.password || url.port) {
      throw new WikimediaRequestError("provider_url_rejected", "The Wikimedia request URL was not on an approved HTTPS host");
    }
    const key = crypto.createHash("sha256").update(url.href).digest("hex");
    const cached = await readCache(key);
    if (cached) return cached;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetchPaced(url);
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers?.get?.("retry-after");
          const delay = parseRetryAfter(retryAfter, now(), Math.min(60000, 1000 * (2 ** attempt)));
          await response.body?.cancel?.().catch?.(() => {});
          lastError = new WikimediaRequestError(response.status === 429 ? "rate_limited" : "provider_unavailable", `Wikimedia returned HTTP ${response.status}`, true);
          if (attempt < maxRetries) await sleepImpl(delay);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel?.().catch?.(() => {});
          throw new WikimediaRequestError("provider_http_error", `Wikimedia returned HTTP ${response.status}`);
        }
        const raw = await response.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) throw new WikimediaRequestError("provider_response_too_large", "Wikimedia response exceeded the 5 MB safety limit");
        let payload;
        try { payload = JSON.parse(raw); } catch { throw new WikimediaRequestError("provider_json_malformed", "Wikimedia returned malformed JSON", true); }
        if (payload?.error) {
          const retryable = payload.error.code === "maxlag" || payload.error.code === "ratelimited";
          lastError = new WikimediaRequestError(payload.error.code || "provider_api_error", "Wikimedia reported an API error", retryable);
          if (retryable && attempt < maxRetries) {
            await sleepImpl(Math.min(60000, 1000 * (2 ** attempt)));
            continue;
          }
          throw lastError;
        }
        await saveCache(key, payload);
        return payload;
      } catch (error) {
        if (error instanceof WikimediaRequestError) {
          lastError = error;
          if (!error.retryable || attempt >= maxRetries) throw error;
        } else {
          const diagnosticCode = typeof error?.cause?.code === "string"
            ? error.cause.code
            : typeof error?.code === "string" ? error.code : null;
          lastError = new WikimediaRequestError("provider_network_error", "Wikimedia request failed", true, diagnosticCode);
          if (attempt >= maxRetries) throw lastError;
        }
        await sleepImpl(Math.min(60000, 1000 * (2 ** attempt)));
      }
    }
    throw lastError ?? new WikimediaRequestError("provider_unavailable", "Wikimedia request failed");
  }

  async function searchWikidata(site, diagnostics = null) {
    const nameQuery = String(site.name ?? "").trim();
    const location = [site.locality, site.district, site.state, "India"].filter(Boolean).join(" ");
    const contextualQuery = `${nameQuery} ${location}`.trim();
    const searchEntities = async (query) => {
      if (!query) return [];
      if (diagnostics) {
        diagnostics.wikidata_search_queries ??= [];
        diagnostics.wikidata_search_queries.push(query);
      }
      const search = new URL(WIKIDATA_API);
      search.search = new URLSearchParams({
        action: "wbsearchentities",
        search: query,
        language: "en",
        uselang: "en",
        type: "item",
        limit: "10",
        format: "json",
        maxlag: "5",
      }).toString();
      const searchResults = parseSearchEntities(await requestJson(search));
      if (!searchResults.length) return [];
      const qids = searchResults.slice(0, 10).map((item) => item.qid);
      const details = new URL(WIKIDATA_API);
      details.search = new URLSearchParams({
        action: "wbgetentities",
        ids: qids.join("|"),
        props: "labels|descriptions|aliases|claims",
        languages: "en",
        format: "json",
        maxlag: "5",
      }).toString();
      return parseEntityBatch(await requestJson(details), qids)
        .map((entity) => ({ ...entity, confidence: scoreEntityMatch(site, entity) }))
        .filter((entity) => entity.confidence > 0);
    };

    const rank = (entities) => entities
      .sort((left, right) => right.confidence - left.confidence || left.qid.localeCompare(right.qid));
    // Entity search indexes labels and aliases; location remains a scoring signal and fallback query.
    let candidates = rank(await searchEntities(nameQuery));
    const best = candidates[0];
    const second = candidates[1];
    const needsContextSearch = !best || best.confidence < MINIMUM_MATCH_CONFIDENCE || (second && best.confidence - second.confidence < 0.06);
    if (needsContextSearch && contextualQuery && contextualQuery !== nameQuery) {
      const byQid = new Map(candidates.map((candidate) => [candidate.qid, candidate]));
      for (const candidate of await searchEntities(contextualQuery)) byQid.set(candidate.qid, candidate);
      candidates = rank([...byQid.values()]);
    }
    return candidates;
  }

  async function loadEntityData(qid) {
    if (!validQid(qid)) throw new WikimediaRequestError("invalid_qid", "A valid Wikidata QID is required");
    const url = new URL(`${WIKIDATA_ENTITY_DATA}${qid}.json`);
    url.searchParams.set("languages", "en");
    return parseWikidataEntityData(await requestJson(url), qid);
  }

  async function loadCommonsFile(filename, heritageName) {
    if (typeof filename !== "string" || !filename.trim() || filename.length > 300 || /[\u0000-\u001f]/.test(filename)) {
      throw new WikimediaRequestError("commons_filename_invalid", "Wikidata contained an invalid Commons filename");
    }
    const url = new URL(COMMONS_API);
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      maxlag: "5",
      prop: "imageinfo",
      titles: filename.startsWith("File:") ? filename : `File:${filename}`,
      iiprop: "url|user|extmetadata|timestamp",
      iiurlwidth: "1000",
    }).toString();
    const payload = await requestJson(url);
    const pages = payload?.query?.pages;
    if (!Array.isArray(pages) || pages.length !== 1 || pages[0].missing !== undefined) return null;
    return parseCommonsImageInfo(pages[0], heritageName);
  }

  async function searchCommons(site, diagnostics = null) {
    const images = new Map();
    const searchText = async (query) => {
      if (diagnostics) {
        diagnostics.commons_search_queries ??= [];
        diagnostics.commons_search_queries.push(query);
      }
      const textUrl = new URL(COMMONS_API);
      textUrl.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        maxlag: "5",
        list: "search",
        srnamespace: "6",
        srlimit: "10",
        srsearch: query,
      }).toString();
      const textPayload = await requestJson(textUrl);
      const titles = (textPayload?.query?.search ?? [])
        .filter((item) => typeof item?.title === "string" && item.title.startsWith("File:"))
        .slice(0, 10)
        .map((item) => item.title);
      if (!titles.length) return;
      const infoUrl = new URL(COMMONS_API);
      infoUrl.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        maxlag: "5",
        prop: "imageinfo",
        titles: titles.join("|"),
        iiprop: "url|user|extmetadata|timestamp",
        iiurlwidth: "1000",
      }).toString();
      const infoPayload = await requestJson(infoUrl);
      for (const page of infoPayload?.query?.pages ?? []) {
        if (page?.missing !== undefined) continue;
        try {
          const image = parseCommonsImageInfo(page, site.name);
          images.set(image.filename, { image, coordinate: null });
        } catch {
          // Keep searching other result files; malformed candidates are not surfaced as verified.
        }
      }
    };
    const nameQuery = String(site.name ?? "").trim();
    const location = [site.locality, site.district, site.state, "India"].filter(Boolean).join(" ");
    // Commons text search can be overconstrained by stale district names, so search the monument first.
    await searchText(nameQuery);
    let textCandidates = [...images.values()]
      .map(({ image, coordinate }) => ({ image, confidence: scoreCommonsMatch(site, image, coordinate) }))
      .sort((left, right) => right.confidence - left.confidence || left.image.filename.localeCompare(right.image.filename));
    if ((!textCandidates[0] || textCandidates[0].confidence < MINIMUM_MATCH_CONFIDENCE || (textCandidates[1] && textCandidates[0].confidence - textCandidates[1].confidence < 0.06)) && location) {
      const contextualQuery = `${nameQuery} ${location}`.trim();
      if (contextualQuery && contextualQuery !== nameQuery) await searchText(contextualQuery);
    }

    const latitude = safeCoordinate(site.latitude, -90, 90);
    const longitude = safeCoordinate(site.longitude, -180, 180);
    if (latitude !== null && longitude !== null) {
      const geoUrl = new URL(COMMONS_API);
      geoUrl.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        maxlag: "5",
        generator: "geosearch",
        ggscoord: `${latitude}|${longitude}`,
        ggsradius: "10000",
        ggsnamespace: "6",
        ggslimit: "10",
        prop: "imageinfo",
        iiprop: "url|user|extmetadata|timestamp",
        iiurlwidth: "1000",
      }).toString();
      const geoPayload = await requestJson(geoUrl);
      for (const page of geoPayload?.query?.pages ?? []) {
        if (page?.missing !== undefined) continue;
        try {
          const image = parseCommonsImageInfo(page, site.name);
          const coordinateValue = page.coordinates?.[0];
          const coordinateLat = safeCoordinate(coordinateValue?.lat, -90, 90);
          const coordinateLon = safeCoordinate(coordinateValue?.lon, -180, 180);
          images.set(image.filename, {
            image,
            coordinate: coordinateLat === null || coordinateLon === null ? null : { latitude: coordinateLat, longitude: coordinateLon },
          });
        } catch {
          // Invalid or incomplete metadata stays in review rather than being imported.
        }
      }
    }
    return [...images.values()]
      .map(({ image, coordinate }) => ({ image, confidence: scoreCommonsMatch(site, image, coordinate) }))
      .filter((candidate) => candidate.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence || left.image.filename.localeCompare(right.image.filename));
  }

  return { requestJson, searchWikidata, loadEntityData, loadCommonsFile, searchCommons };
}

function parseRetryAfter(value, now = Date.now(), fallback = 1000) {
  if (!value) return fallback;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Number.MAX_SAFE_INTEGER, seconds * 1000);
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, time - now) : fallback;
}

function candidateSummary(candidate) {
  if (!candidate) return null;
  if (candidate.image) {
    const { image } = candidate;
    return {
      filename: image.filename,
      title: image.title,
      description: image.description,
      image_url: image.url,
      thumbnail_url: image.thumbnailUrl,
      source_url: image.sourceUrl,
      creator: image.creator,
      license: image.license,
      license_url: image.licenseUrl,
      credit: image.credit,
      documented_date: image.documentedDate,
      documented_date_source: image.documentedDateSource,
      uploaded_at: image.uploadedAt,
      media_role: classifyMediaRole(image),
      confidence: candidate.confidence,
      missing_metadata: image.missingMetadata,
    };
  }
  return {
    qid: candidate.qid,
    label: candidate.label,
    official_names: candidate.officialNames ?? [],
    description: candidate.description,
    coordinate: candidate.coordinate ?? null,
    confidence: candidate.confidence,
  };
}

async function acquireImageForHeritage(site, client, options = {}) {
  const threshold = options.threshold ?? MINIMUM_MATCH_CONFIDENCE;
  const diagnostics = options.diagnostics ?? {};
  const context = [];
  let selectedEntity = null;
  let matchedQid = null;
  let entityConfidence = null;

  if (site.wikidata_qid) {
    if (!validQid(site.wikidata_qid)) {
      return { status: "needs_review", confidence: null, matchedQid: null, candidates: [], errorCode: "invalid_qid", errorMessage: "The stored Wikidata QID is malformed" };
    }
    selectedEntity = await client.loadEntityData(site.wikidata_qid);
    entityConfidence = scoreEntityMatch(site, selectedEntity);
    matchedQid = site.wikidata_qid;
    if (entityConfidence < threshold) {
      return { status: "needs_review", confidence: entityConfidence, matchedQid: null, candidates: [candidateSummary({ ...selectedEntity, confidence: entityConfidence })], errorCode: entityConfidence === 0 ? "qid_mismatch" : "stored_qid_needs_review", errorMessage: "The stored Wikidata entity did not meet the automatic name/location threshold" };
    }
  } else {
    const entities = await client.searchWikidata(site, diagnostics);
    const best = entities[0];
    const second = entities[1];
    const ambiguous = best && second && best.confidence - second.confidence < 0.06;
    if (best && best.confidence >= threshold && !ambiguous) {
      selectedEntity = await client.loadEntityData(best.qid);
      entityConfidence = scoreEntityMatch(site, selectedEntity);
      matchedQid = best.qid;
      context.push(candidateSummary(best));
      if (entityConfidence < threshold) {
        return { status: "needs_review", confidence: entityConfidence, matchedQid: null, candidates: entities.slice(0, 5).map(candidateSummary), errorCode: "entity_match_below_threshold", errorMessage: "The Wikidata entity match did not meet the automatic verification threshold" };
      }
    } else if (best) {
      return { status: "needs_review", confidence: best.confidence, matchedQid: null, candidates: entities.slice(0, 5).map(candidateSummary), errorCode: ambiguous ? "ambiguous_entity_match" : "entity_match_below_threshold", errorMessage: ambiguous ? "Multiple Wikidata entities matched; manual review is required" : "The Wikidata entity match did not meet the automatic verification threshold" };
    }
  }

  if (selectedEntity?.imageFiles?.length) {
    const verifiedImages = [];
    const imageCandidates = [];
    for (const filename of selectedEntity.imageFiles.slice(0, 5)) {
      const image = await client.loadCommonsFile(filename, site.name);
      if (!image) continue;
      const confidence = entityConfidence;
      const summary = candidateSummary({ image, confidence });
      imageCandidates.push(summary);
      if (!image.hasRequiredMetadata) {
        continue;
      }
      if (confidence >= threshold) verifiedImages.push({ ...image, mediaRole: classifyMediaRole(image) });
    }
    if (verifiedImages.length) {
      const incomplete = imageCandidates.filter((candidate) => candidate.missing_metadata?.length);
      return {
        status: incomplete.length ? "needs_review" : "verified",
        confidence: entityConfidence,
        entityConfidence,
        matchedQid,
        candidates: [...context, ...imageCandidates],
        images: verifiedImages,
        image: verifiedImages[0],
        errorCode: incomplete.length ? "commons_attribution_incomplete" : null,
        errorMessage: incomplete.length ? "Some Wikidata image candidates are missing attribution metadata and remain review-only" : null,
      };
    }
    if (imageCandidates.length) {
      return {
        status: "needs_review",
        confidence: entityConfidence,
        entityConfidence,
        matchedQid,
        candidates: [...context, ...imageCandidates],
        images: [],
        image: null,
        errorCode: "commons_attribution_incomplete",
        errorMessage: "Wikidata image candidates were found, but Commons attribution metadata is incomplete",
      };
    }
  }

  const commonsCandidates = await client.searchCommons(site, diagnostics);
  const bestCommons = commonsCandidates[0];
  if (!bestCommons) {
    if (context.length) return { status: "not_found", confidence: entityConfidence, entityConfidence, matchedQid, candidates: context, errorCode: "no_p18_or_commons_image", errorMessage: "No suitable P18 or Commons image was found" };
    return { status: "not_found", confidence: null, matchedQid: null, candidates: [], errorCode: "no_suitable_image", errorMessage: "No suitable Wikimedia image was found" };
  }
  const summaries = [...context, ...commonsCandidates.slice(0, 5).map(candidateSummary)];
  if (bestCommons.confidence < threshold) {
    return { status: "needs_review", confidence: bestCommons.confidence, entityConfidence, matchedQid, candidates: summaries, errorCode: "commons_match_below_threshold", errorMessage: "The Commons search result needs a human match review" };
  }
  if (!bestCommons.image.hasRequiredMetadata) {
    return { status: "needs_review", confidence: bestCommons.confidence, entityConfidence, matchedQid, candidates: summaries, errorCode: "commons_attribution_incomplete", errorMessage: `Commons metadata is missing ${bestCommons.image.missingMetadata.join(", ")}` };
  }
  if (commonsCandidates[1] && bestCommons.confidence - commonsCandidates[1].confidence < 0.06) {
    return { status: "needs_review", confidence: bestCommons.confidence, entityConfidence, matchedQid, candidates: summaries, errorCode: "ambiguous_commons_match", errorMessage: "Multiple Commons images matched; manual review is required" };
  }
  const verifiedImage = { ...bestCommons.image, mediaRole: classifyMediaRole(bestCommons.image) };
  return { status: "verified", confidence: bestCommons.confidence, entityConfidence, matchedQid, candidates: summaries, image: verifiedImage, images: [verifiedImage] };
}

module.exports = {
  CACHE_TTL_MS,
  DEFAULT_CONTACT_URL,
  MINIMUM_MATCH_CONFIDENCE,
  WikimediaRequestError,
  acquireImageForHeritage,
  allowedWikimediaImageUrl,
  candidateSummary,
  classifyMediaRole,
  createUserAgent,
  createWikimediaClient,
  decodeHtmlText,
  discoverEntityMatch,
  distanceKm,
  normalizeText,
  parseCommonsImageInfo,
  parseContact,
  parseEntityBatch,
  parseRetryAfter,
  parseSearchEntities,
  parseWikidataEntityData,
  scoreCommonsMatch,
  scoreEntityMatch,
  validQid,
};
