"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const featureData = import("../src/lib/heritageFeatureData.js");

const timelineSource = {
  id: 90,
  heritage_id: 1,
  source_name: "Museum archive",
  source_title: "Official history",
  publisher: "Museum",
  source_url: "https://museum.example/history",
  source_note: null,
  accessed_on: null,
  claims_supported: ["timeline_event"],
};

test("timeline dates retain precision, use event-specific labels, and sort exact dates", async () => {
  const { presentTimelineMoment, sortTimelineEvents } = await featureData;
  const exact = {
    id: 2,
    title: "Museum opened",
    event_date: "1878-04-01",
    event_period: "1 April 1878",
    display_order: 2,
    source_id: 90,
  };
  const earlier = { ...exact, id: 1, event_date: "1814-02-02", display_order: 1 };
  assert.deepEqual(presentTimelineMoment(exact, [timelineSource]), {
    label: "Event date",
    value: "1 April 1878",
    precision: "day",
    sourceLinked: true,
  });
  assert.deepEqual(sortTimelineEvents([exact, earlier]).map((event) => event.id), [1, 2]);

  const inscriptionSource = {
    ...timelineSource,
    claims_supported: ["timeline_event", "protected_status"],
  };
  assert.deepEqual(presentTimelineMoment({
    id: 3,
    event_date: null,
    event_period: "1983 CE",
    source_id: 90,
  }, [inscriptionSource]), {
    label: "UNESCO inscription year",
    value: "1983 CE",
    precision: "period",
    sourceLinked: true,
  });

  const unsupported = presentTimelineMoment({ ...exact, source_id: null }, []);
  assert.equal(unsupported.label, "Unverified date");
  assert.equal(unsupported.sourceLinked, false);
});

test("anatomy evidence stays attached to the selected site and preserves source links", async () => {
  const { getArchitectureEvidence, getDefaultHeritageOption, heritageSourceHref } = await featureData;
  const site = {
    architecture: "Documented architectural description",
    historicalPeriod: "Recorded period",
    sources: [
      { ...timelineSource, claims_supported: ["architecture"] },
      { ...timelineSource, id: 91, claims_supported: ["historical_period"] },
    ],
    architecturalLayers: [
      { id: 4, name: "Courtyard", description: "Recorded detail", display_order: 1, source_id: 90 },
    ],
    artifacts: [
      { id: 8, name: "Catalogued object", description: "Object record", period: null, material: "stone", source_id: 91 },
      { id: 9, name: "Object without a material", description: "", period: null, material: null, source_id: null },
    ],
  };
  const evidence = getArchitectureEvidence(site);
  assert.equal(evidence.architecture, site.architecture);
  assert.deepEqual(evidence.architectureSources.map((source) => source.id), [90]);
  assert.deepEqual(evidence.periodSources.map((source) => source.id), [91]);
  assert.deepEqual(evidence.layers.map((layer) => layer.name), ["Courtyard"]);
  assert.deepEqual(evidence.artifactMaterials.map((artifact) => artifact.material), ["stone"]);
  assert.equal(heritageSourceHref(44, 91), "/heritage/44#source-91");
  assert.equal(heritageSourceHref("not-an-id", 91), null);

  const emptySite = getArchitectureEvidence({ architecture: "", historicalPeriod: "", sources: [], architecturalLayers: [], artifacts: [] });
  assert.equal(emptySite.architecture, "");
  assert.deepEqual(emptySite.layers, []);
  assert.deepEqual(emptySite.artifactMaterials, []);

  const importedPlaceholder = getArchitectureEvidence({
    architecture: "Not recorded in the imported ASI list.",
    historicalPeriod: "Building and architectural details are not recorded in the cited source.",
    sources: [],
    architecturalLayers: [],
    artifacts: [],
  });
  assert.equal(importedPlaceholder.architecture, "");
  assert.equal(importedPlaceholder.historicalPeriod, "");
  const defaultSite = getDefaultHeritageOption([
    { routeId: "100", architecture: "Not recorded in the imported ASI list." },
    { routeId: "4", architecture: "Rock-cut chaityas and viharas." },
  ]);
  assert.equal(defaultSite.routeId, "4");
  assert.equal(getDefaultHeritageOption([{ routeId: "1" }], { hasTimeline: true }).routeId, "1");
});

test("feature detail state resolves loading, data, empty detail, and request failure", async () => {
  const { heritageFeatureDetailReducer, initialFeatureDetailState, isValidHeritageSiteId } = await featureData;
  const loading = heritageFeatureDetailReducer(initialFeatureDetailState, { type: "loading" });
  assert.equal(loading.loading, true);
  assert.equal(loading.site, null);

  const emptySite = { routeId: "8", timelineEvents: [], architecturalLayers: [], artifacts: [], sources: [] };
  const success = heritageFeatureDetailReducer(loading, { type: "success", site: emptySite });
  assert.equal(success.loading, false);
  assert.deepEqual(success.site.timelineEvents, []);

  const failure = heritageFeatureDetailReducer(loading, { type: "error", message: "Request failed" });
  assert.equal(failure.loading, false);
  assert.equal(failure.error, "Request failed");
  assert.equal(heritageFeatureDetailReducer(failure, { type: "reset" }).error, null);
  assert.equal(isValidHeritageSiteId("15"), true);
  assert.equal(isValidHeritageSiteId("0"), false);
  assert.equal(isValidHeritageSiteId("15abc"), false);
  assert.equal(isValidHeritageSiteId("9007199254740992"), false);
});

test("Then & Now uses only verified dated images with source, creator, and license metadata", async () => {
  const { getVerifiedComparisonPair } = await featureData;
  const media = (id, role, extra = {}) => ({
    id,
    heritage_id: 15,
    media_type: "image",
    url: "https://upload.wikimedia.org/example.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    license: "CC BY 4.0",
    creator: "Photographer",
    credit: "Photographer (CC BY 4.0)",
    documented_date: role === "historical" ? "1855–1865" : "2025-10-04",
    media_role: role,
    verification_status: "verified",
    is_illustrative: false,
    ...extra,
  });
  const historical = media(1, "historical");
  const current = media(2, "current");
  const unverifiedCurrent = media(3, "current", { verification_status: "unverified" });
  const undatedHistorical = media(4, "historical", { documented_date: null });
  const pair = getVerifiedComparisonPair([historical, current, unverifiedCurrent, undatedHistorical]);
  assert.equal(pair.historical.id, 1);
  assert.equal(pair.current.id, 2);
  assert.equal(getVerifiedComparisonPair([current]).historical, null);
  assert.equal(getVerifiedComparisonPair([undatedHistorical]).historical, null);
  assert.equal(getVerifiedComparisonPair([media(5, "current", { license_url: "http://unsafe.example/license" })]).current, null);
});
