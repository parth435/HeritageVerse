"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  chooseGeoapifyCandidate,
  createGeoapifyClient,
  discoverForSite,
  geoapifyCandidateDetails,
  runDryRun,
  validPoint,
  wikidataCandidateDetails,
} = require("../database/coordinate-enrichment");
const { parseArguments } = require("../database/suggest-coordinates");

const site = {
  id: 21,
  slug: "example-temple",
  name: "Example Temple",
  state: "Maharashtra",
  district: "Pune",
  locality: "Pune",
  latitude: null,
  longitude: null,
  wikidata_qid: null,
};

function geoResult(overrides = {}) {
  return {
    place_id: "place-1",
    name: "Example Temple",
    formatted: "Example Temple, Pune, Maharashtra, India",
    result_type: "building",
    category: "building.historic",
    lat: 18.52,
    lon: 73.85,
    country: "India",
    country_code: "in",
    state: "Maharashtra",
    district: "Pune",
    rank: { confidence: 0.96, match_type: "full_match", confidence_city_level: 1, confidence_building_level: 0.96 },
    datasource: {
      sourcename: "openstreetmap",
      attribution: "© OpenStreetMap contributors",
      license: "Open Database License",
      url: "https://www.openstreetmap.org/copyright",
      raw: { osm_type: "way", osm_id: 12345 },
    },
    ...overrides,
  };
}

test("coordinate values handle numeric strings, nulls, and range errors", () => {
  assert.deepEqual(validPoint("18.52", "73.85"), { latitude: 18.52, longitude: 73.85 });
  assert.equal(validPoint("", 73.85), null);
  assert.equal(validPoint(91, 73.85), null);
  assert.equal(validPoint(18.52, "not-a-coordinate"), null);
});

test("Wikidata proposals require an exact site name, India, state evidence, and P625 coordinates", () => {
  const candidate = wikidataCandidateDetails({
    qid: "Q12345",
    label: "Example Temple",
    aliases: [],
    officialNames: [],
    description: "Historic temple in Pune, Maharashtra, India",
    countryIsIndia: true,
    coordinate: { latitude: 18.52, longitude: 73.85 },
    confidence: 0.97,
  }, site);
  assert.equal(candidate.eligible, true);
  assert.equal(candidate.coordinate.latitude, 18.52);

  const wrongSite = wikidataCandidateDetails({
    qid: "Q12345",
    label: "Example Town",
    aliases: [],
    description: "Maharashtra, India",
    countryIsIndia: true,
    coordinate: { latitude: 18.52, longitude: 73.85 },
    confidence: 0.99,
  }, site);
  assert.equal(wrongSite.eligible, false);
  assert.equal(wrongSite.identity_exact, false);
});

test("discovery uses a reliable Wikidata P625 proposal before Geoapify and leaves it pending review", async () => {
  const calls = [];
  const report = await discoverForSite(site, {
    wikimediaClient: {
      searchWikidata: async () => {
        calls.push("wikidata");
        return [{
          qid: "Q12345",
          label: "Example Temple",
          aliases: [],
          officialNames: [],
          description: "Historic temple in Pune, Maharashtra, India",
          countryIsIndia: true,
          coordinate: { latitude: 18.52, longitude: 73.85 },
          confidence: 0.97,
        }];
      },
    },
    geoapifyClient: { search: async () => { calls.push("geoapify"); return []; } },
  });
  assert.deepEqual(calls, ["wikidata"]);
  assert.equal(report.match_status, "needs_review");
  assert.equal(report.review_status, "pending");
  assert.equal(report.source.provider, "Wikidata");
  assert.equal(report.proposed_coordinates.longitude, 73.85);
});

test("Geoapify candidates reject unrelated place types and mismatched state or district", () => {
  const valid = geoapifyCandidateDetails(site, geoResult());
  assert.equal(valid.eligible, true);
  assert.equal(valid.source.source_url, "https://www.openstreetmap.org/way/12345");

  assert.equal(geoapifyCandidateDetails(site, geoResult({ result_type: "city" })).eligible, false);
  assert.equal(geoapifyCandidateDetails(site, geoResult({ state: "Goa" })).eligible, false);
  assert.equal(geoapifyCandidateDetails(site, geoResult({ district: "Nashik" })).eligible, false);
  assert.equal(geoapifyCandidateDetails(site, geoResult({ name: "Pune" })).eligible, false);
  assert.equal(geoapifyCandidateDetails(site, geoResult({ datasource: { sourcename: "unknown", attribution: "", raw: {} } })).eligible, false);
});

test("Geoapify result selection reports similar eligible results as ambiguous", () => {
  const first = { match_status: "needs_review", source: { provenance: { rank_confidence: 0.96 } } };
  const close = { match_status: "needs_review", source: { provenance: { rank_confidence: 0.93 } } };
  const distinct = { match_status: "needs_review", source: { provenance: { rank_confidence: 0.84 } } };
  assert.equal(chooseGeoapifyCandidate([first, close]).ambiguous, true);
  assert.equal(chooseGeoapifyCandidate([first, distinct]).selected, first);
});

test("Geoapify requests restrict results to India and never include request credentials in errors", async () => {
  let requestedUrl;
  const client = createGeoapifyClient({
    apiKey: "test-key-do-not-log",
    delayMs: 1000,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, text: async () => JSON.stringify({ results: [geoResult()] }) };
    },
  });
  const results = await client.search(site);
  assert.equal(results.length, 1);
  assert.equal(requestedUrl.searchParams.get("filter"), "countrycode:in");
  assert.equal(requestedUrl.searchParams.get("apiKey"), "test-key-do-not-log");
  assert.equal(requestedUrl.hostname, "api.geoapify.com");
});

test("Geoapify client caches duplicate queries and spaces separate requests by at least one second", async () => {
  let clock = 0;
  let requests = 0;
  const waits = [];
  const client = createGeoapifyClient({
    apiKey: "test-key-do-not-log",
    delayMs: 1000,
    now: () => clock,
    sleepImpl: async (milliseconds) => { waits.push(milliseconds); clock += milliseconds; },
    fetchImpl: async () => {
      requests += 1;
      return { ok: true, text: async () => JSON.stringify({ results: [] }) };
    },
  });
  await client.search(site);
  await client.search(site);
  await client.search({ ...site, name: "Different Site" });
  assert.equal(requests, 2);
  assert.deepEqual(waits, [1000]);
});

test("Geoapify timeout and network errors are sanitized", async () => {
  const key = "private-test-key";
  const client = createGeoapifyClient({
    apiKey: key,
    delayMs: 1000,
    timeoutMs: 10,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error(`request failed: ${key}`)), { once: true });
    }),
  });
  await assert.rejects(client.search(site), (error) => error.code === "provider_timeout" && !error.message.includes(key));

  const networkClient = createGeoapifyClient({
    apiKey: key,
    delayMs: 1000,
    fetchImpl: async (url) => { throw new Error(`request failed: ${url.href}`); },
  });
  await assert.rejects(networkClient.search(site), (error) => error.code === "provider_network_error" && !error.message.includes(key));
});

test("dry-run samples only requested records and performs no database writes", async () => {
  const sqlCalls = [];
  const database = {
    query: async (sql) => {
      sqlCalls.push(sql);
      return sql.includes("COUNT(*)")
        ? { rows: [{ total: 2 }] }
        : { rows: [site, { ...site, id: 22, slug: "second", name: "Second Site", state: "Maharashtra" }] };
    },
  };
  const report = await runDryRun({ state: "Maharashtra", limit: 20, delayMs: 1000, timeoutMs: 10000, apply: false }, database, {
    wikimediaClient: { searchWikidata: async () => [] },
    geoapifyClient: { search: async () => [] },
  });
  assert.equal(report.database_mutated, false);
  assert.equal(report.total_sites_without_approved_coordinates, 2);
  assert.equal(report.sites_sampled, 2);
  assert.ok(sqlCalls.every((sql) => /^\s*SELECT/i.test(sql)));
  assert.ok(sqlCalls.every((sql) => sql.includes("review_status='approved'")));
});

test("discovery defaults to a 20-site Maharashtra dry-run and caps at 50", () => {
  assert.deepEqual(parseArguments([]), {
    apply: false, state: "Maharashtra", limit: 20, delayMs: 1000, timeoutMs: 12000, output: null, help: false,
  });
  assert.equal(parseArguments(["--limit", "50"]).limit, 50);
  assert.throws(() => parseArguments(["--limit", "51"]), /between 1 and 50/);
  assert.throws(() => parseArguments(["--delay-ms", "999"]), /at least 1000 ms/);
  assert.equal(parseArguments(["--state", "Goa", "--dry-run"]).state, "Goa");
});
