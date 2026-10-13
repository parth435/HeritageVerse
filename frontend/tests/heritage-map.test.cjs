"use strict";

const assert = require("node:assert/strict");
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
    groupCoordinateSites: (await server.ssrLoadModule("/src/components/heritage/HeritageMap.tsx")).groupCoordinateSites,
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
      items: records.slice(offset, offset + limit),
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
    assert.deepEqual(result.slice(0, 2).map((site) => [site.latitude, site.longitude]), [["18.5", "73.8"], ["18.5", "73.8"]]);
    assert.deepEqual(requests.map((url) => url.searchParams.get("offset")), ["0", "100", "200"]);
    for (const url of requests) {
      assert.equal(url.pathname, "/api/heritage-map");
      assert.equal(url.searchParams.get("limit"), "100");
      assert.equal(url.searchParams.get("q"), "hill fort");
      assert.equal(url.searchParams.get("category"), "fort");
      assert.equal(url.searchParams.get("state"), "Maharashtra");
      assert.equal(url.searchParams.get("district"), "Pune");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("map coordinate adaptation rejects missing and invalid values, keeps string coordinates, and counts duplicate sites", async () => {
  const { React, renderToStaticMarkup, HeritageMap, groupCoordinateSites, heritageMapToView } = await loadMapModules();
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
  const eligible = views.filter((site) => site.hasCoordinates);
  assert.equal(eligible.length, 2);
  assert.equal(eligible[0].latitude, 18.5);
  assert.equal(eligible[0].longitude, 73.8);
  const groups = groupCoordinateSites(eligible);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((site) => site.routeId), ["1", "2"]);

  const html = renderToStaticMarkup(React.createElement(HeritageMap, { sites: views }));
  assert.match(html, /2 mapped sites/);
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
