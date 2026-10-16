"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
let viteServerPromise;

test.after(async () => {
  if (viteServerPromise) {
    const server = await viteServerPromise;
    await server.close();
    viteServerPromise = null;
  }
});

async function loadMapModules() {
  const [{ createServer }, react, renderer, reactPlugin] = await Promise.all([
    import("vite"),
    import("react"),
    import("react-dom/server"),
    import("@vitejs/plugin-react"),
  ]);
  if (!viteServerPromise) {
    viteServerPromise = createServer({
      root: projectRoot,
      configFile: false,
      appType: "custom",
      logLevel: "silent",
      plugins: [reactPlugin.default()],
      resolve: { alias: { "@": sourceRoot } },
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
  }
  const server = await viteServerPromise;
  return {
    React: react.default,
    renderToStaticMarkup: renderer.renderToStaticMarkup,
    HeritageMap: (await server.ssrLoadModule("/src/components/heritage/HeritageMap.tsx")).HeritageMap,
    HeritageGrid: (await server.ssrLoadModule("/src/components/heritage/HeritageGrid.tsx")).HeritageGrid,
    groupCoordinateSites: (await server.ssrLoadModule("/src/lib/map-utils.ts")).groupCoordinateSites,
    filterMappableSites: (await server.ssrLoadModule("/src/lib/map-utils.ts")).filterMappableSites,
    heritageMapToView: (await server.ssrLoadModule("/src/lib/heritageAdapter.ts")).heritageMapToView,
    getHeritageMapSites: (await server.ssrLoadModule("/src/lib/api.ts")).getHeritageMapSites,
    ApiRequestError: (await server.ssrLoadModule("/src/lib/api.ts")).ApiRequestError,
  };
}

function mapRecord(id, latitude, longitude, coordinatesVerified = true) {
  return {
    id,
    slug: "site-" + id,
    name: "Site " + id,
    description: "A mapped heritage site.",
    state: "Maharashtra",
    district: "Pune",
    locality: "Pune",
    latitude,
    longitude,
    coordinates_verified: coordinatesVerified,
    media: [],
  };
}

test("map API loads every bounded page and preserves search and location filters", async () => {
  const { getHeritageMapSites } = await loadMapModules();
  const originalFetch = globalThis.fetch;
  const requests = [];
  const records = Array.from({ length: 205 }, (_, index) =>
    mapRecord(index + 1, index < 2 ? "18.5" : String(19 + index / 100), index < 2 ? "73.8" : String(73 + index / 100)));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    requests.push(url);
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return new Response(JSON.stringify({
      success: true,
      items: offset === 100
        ? [records[99], ...records.slice(100, 199)]
        : offset === 200
          ? records.slice(199)
          : records.slice(offset, offset + limit),
      pagination: { limit, offset, total: records.length },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await getHeritageMapSites({
      q: "hill fort",
      category: "fort",
      state: "Maharashtra",
      district: "Pune",
    });
    assert.equal(result.length, 205);
    assert.equal(new Set(result.map((site) => site.id)).size, 205);
    assert.deepEqual(result.slice(0, 2).map((site) => [site.latitude, site.longitude]), [["18.5", "73.8"], ["18.5", "73.8"]]);
    assert.deepEqual(requests.map((url) => url.searchParams.get("offset")), ["0", "100", "200"]);
    for (const url of requests) {
      assert.equal(url.pathname, "/api/heritage-map");
      assert.equal(url.searchParams.get("limit"), "100");
      assert.equal(url.searchParams.get("q"), "hill fort");
      assert.equal(url.searchParams.get("category"), "fort");
      assert.equal(url.searchParams.get("state"), "Maharashtra");
      assert.equal(url.searchParams.get("district"), "Pune");
      assert.equal(url.searchParams.get("withVerifiedPhoto"), null);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("map coordinate adaptation rejects missing and invalid values, maps all 30 valid places, and groups duplicate coordinates", async () => {
  const { React, renderToStaticMarkup, HeritageMap, filterMappableSites, groupCoordinateSites, heritageMapToView } = await loadMapModules();
  const views = [
    heritageMapToView(mapRecord(1, "18.5", "73.8")),
    heritageMapToView(mapRecord(2, "18.5", "73.8")),
    heritageMapToView(mapRecord(3, null, 73)),
    heritageMapToView(mapRecord(4, "", "73")),
    heritageMapToView(mapRecord(5, "bad", "73")),
    heritageMapToView(mapRecord(6, 91, 73)),
    heritageMapToView(mapRecord(7, 18, 181)),
    heritageMapToView(mapRecord(8, 19, 73, false)),
  ];
  const eligible = filterMappableSites(views);
  assert.equal(eligible.length, 2);
  assert.equal(eligible[0].latitude, 18.5);
  assert.equal(eligible[0].longitude, 73.8);
  const groups = groupCoordinateSites(eligible);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((site) => site.routeId), ["1", "2"]);

  const catalogueViews = Array.from({ length: 30 }, (_, index) =>
    heritageMapToView(mapRecord(index + 100, String(16 + index / 10), String(72 + index / 10))));
  const mappableCatalogue = filterMappableSites([...catalogueViews, ...views.slice(2)]);
  assert.equal(mappableCatalogue.length, 30);
  assert.equal(groupCoordinateSites(mappableCatalogue).length, 30);

  const html = renderToStaticMarkup(React.createElement(HeritageMap, { sites: views }));
  assert.match(html, /2 mapped sites/);
  const catalogueMarkup = renderToStaticMarkup(React.createElement(HeritageMap, { sites: views.slice(0, 1), mapSites: mappableCatalogue }));
  assert.match(catalogueMarkup, /30 mapped sites/);

  const mapSource = fs.readFileSync(path.join(sourceRoot, "components", "heritage", "HeritageMap.tsx"), "utf8");
  assert.match(mapSource, /const markers = markerGroups\.map\(\(siteGroup\)/);
  assert.match(mapSource, /\.bindPopup\(markerPopup\(siteGroup/);
  assert.match(mapSource, /marker\.on\("click", \(\) => onSiteSelect\?\.\(site\.routeId\)\)/);
  assert.match(mapSource, /for \(const groupedSite of siteGroup\) markersRef\.current\.set/);
  assert.match(mapSource, /for \(const site of sites\) content\.append\(markerPopupForSite\(site/);
  assert.match(mapSource, /map\.fitBounds\(L\.featureGroup\(layers\)\.getBounds\(\)\.pad\(0\.12\)/);
});

test("empty map results remain an explicit empty state", async () => {
  const { React, renderToStaticMarkup, HeritageMap, getHeritageMapSites } = await loadMapModules();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    items: [],
    pagination: { limit: 100, offset: 0, total: 0 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    assert.deepEqual(await getHeritageMapSites(), []);
    const html = renderToStaticMarkup(React.createElement(HeritageMap, { sites: [] }));
    assert.match(html, /No heritage records match the current filters/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ordinary catalogue grid passes a photo-less published record to its card", async () => {
  const { HeritageGrid } = await loadMapModules();
  const item = {
    routeId: "301",
    databaseId: 301,
    slug: "panhala-fort",
    name: "Panhala Fort",
    location: "Kolhapur, Maharashtra",
    latitude: null,
    longitude: null,
    hasCoordinates: false,
    coordinateStatus: "missing",
    media: [],
    gallery: [],
    timelineEvents: [],
    artifacts: [],
    architecturalLayers: [],
    sources: [],
  };
  const grid = HeritageGrid({ items: [item] });
  const card = grid.props.children[0];

  assert.equal(card.props.item.name, "Panhala Fort");
  assert.deepEqual(card.props.item.gallery, []);
  assert.equal(card.props.verifiedPhotoOnly, false);
});

test("map API request failures surface as recoverable API errors", async () => {
  const { getHeritageMapSites, ApiRequestError } = await loadMapModules();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: false,
    message: "Failed to load heritage map locations",
  }), { status: 503, headers: { "Content-Type": "application/json" } });

  try {
    await assert.rejects(
      getHeritageMapSites({ state: "Maharashtra" }),
      (error) => error instanceof ApiRequestError && error.status === 503 && /Failed to load heritage map locations/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
