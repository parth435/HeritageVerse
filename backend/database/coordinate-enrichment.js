"use strict";

const { createUserAgent, createWikimediaClient, normalizeText, scoreEntityMatch, validQid } = require("./wikimedia-images");

const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode/search";
const INDIA_BOUNDS = { minLat: 6, maxLat: 38, minLon: 68, maxLon: 98 };
const REVIEW_CONFIDENCE_THRESHOLD = 0.95;
const GEOAPIFY_MIN_CONFIDENCE = 0.8;
const ACCEPTED_GEOAPIFY_TYPES = new Set(["amenity", "building"]);

function validCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function validPoint(latitude, longitude) {
  const lat = validCoordinate(latitude, -90, 90);
  const lon = validCoordinate(longitude, -180, 180);
  if (lat === null || lon === null) return null;
  return { latitude: lat, longitude: lon };
}

function pointWithinIndia(point) {
  return point.latitude >= INDIA_BOUNDS.minLat && point.latitude <= INDIA_BOUNDS.maxLat &&
    point.longitude >= INDIA_BOUNDS.minLon && point.longitude <= INDIA_BOUNDS.maxLon;
}

function existingCoordinateDetails(site) {
  return {
    existing_coordinates: validPoint(site.latitude, site.longitude),
    existing_coordinate_values: {
      latitude: site.latitude ?? null,
      longitude: site.longitude ?? null,
    },
  };
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function exactNameMatch(siteName, candidateNames) {
  const name = normalizeText(siteName);
  return Boolean(name && candidateNames.some((candidate) => normalizeText(candidate) === name));
}

function hasStateEvidence(site, candidate) {
  const state = normalizeText(site.state);
  if (!state) return false;
  const text = normalizeText([
    candidate.label,
    candidate.description,
    ...(candidate.aliases ?? []),
    ...(candidate.officialNames ?? []),
  ].join(" "));
  return (` ${text} `).includes(` ${state} `);
}

function hasLocationContextEvidence(site, candidate) {
  const text = normalizeText([
    candidate.label,
    candidate.description,
    ...(candidate.aliases ?? []),
    ...(candidate.officialNames ?? []),
  ].join(" "));
  const contextTerms = [site.locality, site.district]
    .flatMap((value) => normalizeText(value).split(" "))
    .filter((term) => term.length >= 4);
  return contextTerms.some((term) => (` ${text} `).includes(` ${term} `));
}

function wikidataCandidateDetails(candidate, site) {
  const point = validPoint(candidate.coordinate?.latitude, candidate.coordinate?.longitude);
  const exactIdentity = exactNameMatch(site.name, [candidate.label, ...(candidate.aliases ?? []), ...(candidate.officialNames ?? [])]);
  const indiaCoordinates = point ? pointWithinIndia(point) : false;
  const stateMatch = hasStateEvidence(site, candidate);
  const locationContextMatch = hasLocationContextEvidence(site, candidate);
  const countryMatch = candidate.countryIsIndia === true;
  const confidence = Number(candidate.confidence ?? scoreEntityMatch(site, candidate));
  const eligible = Boolean(
    validQid(candidate.qid) && exactIdentity && countryMatch && (stateMatch || locationContextMatch) &&
    point && indiaCoordinates && Number.isFinite(confidence) && confidence >= 0.88,
  );
  return {
    qid: candidate.qid ?? null,
    label: candidate.label ?? null,
    description: candidate.description ?? null,
    aliases: candidate.aliases ?? [],
    confidence,
    identity_exact: exactIdentity,
    country_is_india: countryMatch,
    state_match: stateMatch,
    location_context_match: locationContextMatch,
    coordinate: point,
    coordinates_within_india: indiaCoordinates,
    eligible,
    reasons: [
      !exactIdentity ? "Wikidata label or alias is not an exact heritage-site name match" : null,
      !countryMatch ? "Wikidata entity lacks an India country claim" : null,
      (!stateMatch && !locationContextMatch) ? "Wikidata entity description does not confirm the recorded state, district, or locality" : null,
      !point ? "Wikidata entity has no valid P625 coordinate" : null,
      (point && !indiaCoordinates) ? "Wikidata coordinate is outside India's broad coordinate bounds" : null,
      (Number.isFinite(confidence) && confidence < 0.88) ? "Wikidata identity confidence is below the 0.88 discovery threshold" : null,
    ].filter(Boolean),
  };
}

function osmSourceUrl(datasource) {
  const raw = datasource?.raw;
  const type = String(raw?.osm_type ?? "").toLowerCase();
  const id = String(raw?.osm_id ?? "");
  if (!["node", "way", "relation"].includes(type) || !/^\d+$/.test(id) || Number(id) < 1) return null;
  return `https://www.openstreetmap.org/${type}/${id}`;
}

function geoapifyCandidateDetails(site, result) {
  const point = validPoint(result?.lat, result?.lon);
  const datasource = result?.datasource ?? {};
  const countryCode = String(result?.country_code ?? "").toLowerCase();
  const stateMatch = normalizeText(result?.state) === normalizeText(site.state);
  const districtValue = result?.district ?? result?.county ?? null;
  const districtMatch = !site.district || !districtValue || normalizeText(districtValue) === normalizeText(site.district);
  const identityExact = exactNameMatch(site.name, [result?.name]);
  const resultType = String(result?.result_type ?? "").toLowerCase();
  const suitableType = ACCEPTED_GEOAPIFY_TYPES.has(resultType);
  const rankConfidence = Number(result?.rank?.confidence);
  const sourceUrl = osmSourceUrl(datasource);
  const attribution = typeof datasource.attribution === "string" ? datasource.attribution : "";
  const sourceName = typeof datasource.sourcename === "string" ? datasource.sourcename : "";
  const provenancePresent = Boolean(sourceUrl && attribution.trim() && sourceName.trim());
  const withinIndia = Boolean(point && pointWithinIndia(point));
  const eligible = Boolean(
    point && withinIndia && countryCode === "in" && stateMatch && districtMatch &&
    identityExact && suitableType && Number.isFinite(rankConfidence) && rankConfidence >= GEOAPIFY_MIN_CONFIDENCE &&
    provenancePresent,
  );
  return {
    place_id: result?.place_id ?? null,
    name: result?.name ?? null,
    formatted: result?.formatted ?? null,
    result_type: resultType || null,
    category: result?.category ?? null,
    coordinate: point,
    country: result?.country ?? null,
    country_code: countryCode || null,
    state: result?.state ?? null,
    district: result?.district ?? null,
    county: result?.county ?? null,
    city: result?.city ?? null,
    rank: result?.rank ? {
      confidence: Number.isFinite(rankConfidence) ? rankConfidence : null,
      match_type: result.rank.match_type ?? null,
      confidence_city_level: Number.isFinite(Number(result.rank.confidence_city_level)) ? Number(result.rank.confidence_city_level) : null,
      confidence_building_level: Number.isFinite(Number(result.rank.confidence_building_level)) ? Number(result.rank.confidence_building_level) : null,
    } : null,
    identity_exact: identityExact,
    country_match: countryCode === "in",
    state_match: stateMatch,
    district_match: districtMatch,
    suitable_result_type: suitableType,
    coordinates_within_india: withinIndia,
    source: {
      sourcename: sourceName || null,
      attribution: attribution || null,
      license: datasource.license ?? null,
      source_url: sourceUrl,
      result_data_url: isHttpsUrl(datasource.url) ? datasource.url : null,
    },
    eligible,
    reasons: [
      !point ? "Geoapify result has missing or invalid numeric coordinates" : null,
      (point && !withinIndia) ? "Geoapify coordinates are outside India's broad coordinate bounds" : null,
      countryCode !== "in" ? "Geoapify result country is not India" : null,
      !stateMatch ? "Geoapify result state does not exactly match the heritage record" : null,
      !districtMatch ? "Geoapify result district conflicts with the heritage record" : null,
      !identityExact ? "Geoapify result name is not an exact heritage-site name match" : null,
      !suitableType ? "Geoapify result type is not a building or amenity" : null,
      (!Number.isFinite(rankConfidence) || rankConfidence < GEOAPIFY_MIN_CONFIDENCE) ? "Geoapify confidence is missing or below 0.80" : null,
      !provenancePresent ? "Geoapify attribution or a specific OpenStreetMap object URL is missing" : null,
    ].filter(Boolean),
  };
}

function summarizeGeoapifyResult(site, detail) {
  return {
    site_id: site.id,
    site_slug: site.slug,
    site_name: site.name,
    state: site.state,
    district: site.district,
    proposed_coordinates: detail.coordinate,
    source: {
      provider: "Geoapify",
      title: detail.name ? `${detail.name} (OpenStreetMap feature via Geoapify)` : "Geoapify geocoding candidate",
      publisher: detail.source.sourcename ? `${detail.source.sourcename} via Geoapify` : "Geoapify",
      url: detail.source.source_url,
      attribution: detail.source.attribution,
      license: detail.source.license,
      provenance: {
        place_id: detail.place_id,
        result_type: detail.result_type,
        rank_confidence: detail.rank?.confidence ?? null,
        geoapify_data_url: detail.source.result_data_url,
      },
    },
    candidate_details: detail,
    match_status: detail.eligible ? "needs_review" : "rejected_candidate",
    review_status: "pending",
    review_confidence: null,
    reviewed_by: null,
    reviewed_on: null,
    review_reasons: detail.eligible
      ? ["Candidate passed automated identity, country, state, type, confidence, and provenance checks. Inspect the linked source, then set review_status to approved and enter review_confidence (at least 0.95), reviewed_by, and reviewed_on."]
      : detail.reasons,
  };
}

function chooseGeoapifyCandidate(proposals) {
  const eligible = proposals.filter((proposal) => proposal.match_status === "needs_review");
  if (!eligible.length) return { selected: null, ambiguous: false };
  const ranked = eligible.slice().sort((left, right) =>
    (right.source.provenance.rank_confidence ?? 0) - (left.source.provenance.rank_confidence ?? 0));
  if (ranked.length > 1 &&
      ranked[0].source.provenance.rank_confidence - ranked[1].source.provenance.rank_confidence < 0.06) {
    return { selected: null, ambiguous: true };
  }
  return { selected: ranked[0], ambiguous: false };
}

function createGeoapifyClient(options = {}) {
  const apiKey = options.apiKey ?? process.env.GEOAPIFY_API_KEY;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const delayMs = options.delayMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 12000;
  const sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? Date.now;
  const cache = new Map();
  let nextRequestAt = 0;
  if (typeof fetchImpl !== "function") throw new Error("This Node.js runtime does not provide fetch");
  if (!Number.isInteger(delayMs) || delayMs < 1000) throw new Error("Geoapify request spacing must be at least 1000 ms");

  async function search(site) {
    if (!apiKey) throw Object.assign(new Error("GEOAPIFY_API_KEY is not configured in the backend environment"), { code: "missing_api_key" });
    const query = [site.name, site.locality, site.district, site.state, "India"].filter(Boolean).join(", ");
    const cacheKey = normalizeText(query);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const wait = Math.max(0, nextRequestAt - now());
    if (wait) await sleepImpl(wait);
    nextRequestAt = now() + delayMs;

    const url = new URL(GEOAPIFY_URL);
    url.searchParams.set("text", query);
    url.searchParams.set("filter", "countrycode:in");
    url.searchParams.set("limit", "5");
    url.searchParams.set("lang", "en");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": createUserAgent() },
        signal: controller.signal,
        redirect: "error",
      });
    } catch (error) {
      if (controller.signal.aborted) throw Object.assign(new Error("Geoapify request timed out"), { code: "provider_timeout" });
      const causeCode = typeof error?.cause?.code === "string" ? error.cause.code : typeof error?.code === "string" ? error.code : null;
      const diagnosticCode = causeCode && /^[A-Z0-9_]{1,48}$/.test(causeCode) ? causeCode : null;
      throw Object.assign(new Error("Geoapify request failed"), { code: "provider_network_error", diagnosticCode });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      await response.body?.cancel?.().catch?.(() => {});
      throw Object.assign(new Error(`Geoapify returned HTTP ${response.status}`), { code: response.status === 429 ? "rate_limited" : "provider_http_error" });
    }
    let raw;
    try { raw = await response.text(); }
    catch { throw Object.assign(new Error("Geoapify response body could not be read"), { code: "provider_body_read_failed" }); }
    if (Buffer.byteLength(raw, "utf8") > 1_000_000) throw Object.assign(new Error("Geoapify response exceeded the 1 MB safety limit"), { code: "provider_response_too_large" });
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw Object.assign(new Error("Geoapify returned malformed JSON"), { code: "provider_json_malformed" }); }
    if (!Array.isArray(payload?.results)) throw Object.assign(new Error("Geoapify response did not contain a results array"), { code: "provider_response_malformed" });
    cache.set(cacheKey, payload.results);
    return payload.results;
  }

  return { search };
}

async function discoverForSite(site, options = {}) {
  const wikimediaClient = options.wikimediaClient;
  const geoapifyClient = options.geoapifyClient;
  const wikidataCandidates = [];
  const providerErrors = [];
  const providersAttempted = ["Wikidata"];
  let searchResults = [];
  try {
    if (site.wikidata_qid) {
      if (!validQid(site.wikidata_qid)) throw Object.assign(new Error("Stored Wikidata QID is malformed"), { code: "invalid_qid" });
      const entity = await wikimediaClient.loadEntityData(site.wikidata_qid);
      const details = wikidataCandidateDetails(entity, site);
      wikidataCandidates.push(details);
    } else {
      searchResults = await wikimediaClient.searchWikidata(site);
      wikidataCandidates.push(...searchResults.slice(0, 10).map((candidate) => wikidataCandidateDetails(candidate, site)));
    }
  } catch (error) {
    providerErrors.push({ provider: "Wikidata", code: error.code ?? "provider_error", diagnostic_code: error.diagnosticCode ?? null, message: error.message });
  }

  const reliableWikidata = wikidataCandidates.filter((candidate) => candidate.eligible);
  if (reliableWikidata.length === 1) {
    const candidate = reliableWikidata[0];
    return {
      site_id: site.id,
      site_slug: site.slug,
      site_name: site.name,
      state: site.state,
      district: site.district,
      ...existingCoordinateDetails(site),
      proposed_coordinates: candidate.coordinate,
      source: {
        provider: "Wikidata",
        title: `${candidate.label} (Wikidata ${candidate.qid}, P625 coordinate)`,
        publisher: "Wikidata",
        url: `https://www.wikidata.org/wiki/${candidate.qid}`,
        attribution: "Wikidata contributors; inspect the P625 statement and references before approval.",
        provenance: { qid: candidate.qid, claim: "P625", identity_match_confidence: candidate.confidence },
      },
      wikidata_candidates: wikidataCandidates,
      candidate_details: candidate,
      match_status: "needs_review",
      review_status: "pending",
      review_confidence: null,
      reviewed_by: null,
      reviewed_on: null,
      review_reasons: ["A Wikidata identity and location-context match with a P625 coordinate was found. Verify the claim and references, then set review_status to approved and enter review_confidence (at least 0.95), reviewed_by, and reviewed_on."],
      provider_errors: providerErrors,
      providers_attempted: providersAttempted,
    };
  }
  if (reliableWikidata.length > 1) providerErrors.push({ provider: "Wikidata", code: "ambiguous_matches", message: "Multiple Wikidata entities passed the strict identity and location checks" });

  try {
    providersAttempted.push("Geoapify");
    const results = await geoapifyClient.search(site);
    const details = results.slice(0, 5).map((result) => geoapifyCandidateDetails(site, result));
    const proposals = details.map((detail) => summarizeGeoapifyResult(site, detail));
    const chosen = chooseGeoapifyCandidate(proposals);
    if (chosen.ambiguous) {
      return {
        site_id: site.id, site_slug: site.slug, site_name: site.name, state: site.state, district: site.district,
        ...existingCoordinateDetails(site), proposed_coordinates: null,
        source: null, wikidata_candidates: wikidataCandidates, candidates: proposals,
        match_status: "ambiguous", review_status: "pending",
        review_reasons: ["Multiple Geoapify candidates passed automated checks with similar confidence; manual selection is required."],
        provider_errors: providerErrors,
        providers_attempted: providersAttempted,
      };
    }
    if (chosen.selected) {
      const selected = { ...chosen.selected, wikidata_candidates: wikidataCandidates, provider_errors: providerErrors };
      return { ...selected, ...existingCoordinateDetails(site), candidates: proposals, providers_attempted: providersAttempted };
    }
    return {
      site_id: site.id, site_slug: site.slug, site_name: site.name, state: site.state, district: site.district,
      ...existingCoordinateDetails(site), proposed_coordinates: null,
      source: null, wikidata_candidates: wikidataCandidates, candidates: proposals,
      match_status: "no_verified_candidate", review_status: "pending",
      review_reasons: ["No candidate passed all name, country, state, type, confidence, coordinate, and provenance checks."],
      provider_errors: providerErrors,
      providers_attempted: providersAttempted,
    };
  } catch (error) {
    providerErrors.push({ provider: "Geoapify", code: error.code ?? "provider_error", diagnostic_code: error.diagnosticCode ?? null, message: error.message });
    return {
      site_id: site.id, site_slug: site.slug, site_name: site.name, state: site.state, district: site.district,
      ...existingCoordinateDetails(site), proposed_coordinates: null,
      source: null, wikidata_candidates: wikidataCandidates, candidates: [],
      match_status: "provider_error", review_status: "pending",
      review_reasons: ["No reliable Wikidata coordinate was available and Geoapify did not return a usable response."],
      provider_errors: providerErrors,
      providers_attempted: providersAttempted,
    };
  }
}

function summarizeRecords(records) {
  return records.reduce((summary, record) => {
    summary[record.match_status] = (summary[record.match_status] ?? 0) + 1;
    return summary;
  }, {});
}

async function runDryRun(options, database, dependencies = {}) {
  if (options.apply) throw new Error("Coordinate discovery is dry-run only. Review its report, then use enrich-coordinates.js with --apply.");
  const totalResult = await database.query(
    `SELECT COUNT(*)::INTEGER AS total
       FROM heritage h
      WHERE h.publication_status='published'
        AND ($1::TEXT IS NULL OR lower(trim(h.state))=lower(trim($1)))
        AND NOT EXISTS (
          SELECT 1 FROM heritage_sources s
           WHERE s.heritage_id=h.id AND 'coordinates'=ANY(s.claims_supported) AND s.review_status='approved'
        )`,
    [options.state ?? null],
  );
  const siteResult = await database.query(
    `SELECT h.id, h.slug, h.name, h.state, h.district, h.locality, h.address,
            h.latitude, h.longitude, h.wikidata_qid
       FROM heritage h
      WHERE h.publication_status='published'
        AND ($1::TEXT IS NULL OR lower(trim(h.state))=lower(trim($1)))
        AND NOT EXISTS (
          SELECT 1 FROM heritage_sources s
           WHERE s.heritage_id=h.id AND 'coordinates'=ANY(s.claims_supported) AND s.review_status='approved'
        )
      ORDER BY h.id ASC LIMIT $2`,
    [options.state ?? null, options.limit],
  );

  const wikimediaClient = dependencies.wikimediaClient ?? createWikimediaClient({
    cacheStore: database,
    writeCache: false,
    delayMs: options.delayMs,
    timeoutMs: options.timeoutMs,
    maxRetries: 2,
  });
  const geoapifyClient = dependencies.geoapifyClient ?? createGeoapifyClient({
    apiKey: dependencies.apiKey ?? process.env.GEOAPIFY_API_KEY,
    delayMs: options.delayMs,
    timeoutMs: options.timeoutMs,
  });
  const records = [];
  for (const site of siteResult.rows) records.push(await discoverForSite(site, { wikimediaClient, geoapifyClient }));
  return {
    mode: "dry-run",
    database_mutated: false,
    generated_at: new Date().toISOString(),
    requested_state: options.state,
    total_sites_without_approved_coordinates: Number(totalResult.rows[0]?.total ?? 0),
    sites_sampled: records.length,
    wikidata_searched_first: true,
    geoapify_country_filter: "countrycode:in",
    minimum_human_approval_confidence: REVIEW_CONFIDENCE_THRESHOLD,
    minimum_request_spacing_ms: options.delayMs,
    timeout_ms: options.timeoutMs,
    summary: summarizeRecords(records),
    records,
  };
}

module.exports = {
  ACCEPTED_GEOAPIFY_TYPES,
  GEOAPIFY_MIN_CONFIDENCE,
  REVIEW_CONFIDENCE_THRESHOLD,
  chooseGeoapifyCandidate,
  createGeoapifyClient,
  discoverForSite,
  exactNameMatch,
  existingCoordinateDetails,
  geoapifyCandidateDetails,
  hasStateEvidence,
  hasLocationContextEvidence,
  isHttpsUrl,
  pointWithinIndia,
  runDryRun,
  validCoordinate,
  validPoint,
  wikidataCandidateDetails,
};
