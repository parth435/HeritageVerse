"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
const sourceA = {
  id: 90,
  heritage_id: 1,
  source_name: "Museum archive",
  source_title: "Official history",
  publisher: "Museum",
  source_url: "https://museum.example/history",
  source_note: "Official museum history page",
  accessed_on: null,
  claims_supported: ["timeline_event", "architecture", "historical_period"],
};

function makeSite(overrides = {}) {
  return {
    routeId: "1",
    databaseId: 1,
    slug: "museum-one",
    name: "Museum One",
    location: "Kolkata, West Bengal",
    category: { name: "Museum", slug: "museum" },
    architecture: "A documented architectural description.",
    historicalPeriod: "Established 1814",
    timelineEvents: [{
      id: 11,
      heritage_id: 1,
      title: "Museum established",
      description: "The museum was established on this date.",
      event_period: "2 February 1814",
      event_date: "1814-02-02",
      display_order: 1,
      source_id: 90,
    }],
    architecturalLayers: [{
      id: 4,
      name: "Entry hall",
      description: "Recorded component detail.",
      display_order: 1,
      source_id: 90,
    }],
    artifacts: [{
      id: 7,
      name: "Catalogued artifact",
      description: "Object record.",
      period: "Recorded period",
      material: "stone",
      source_id: 90,
    }],
    sources: [sourceA],
    ...overrides,
  };
}

let viteServerPromise;

test.after(async () => {
  if (viteServerPromise) {
    const server = await viteServerPromise;
    await server.close();
    viteServerPromise = null;
  }
});

async function loadViews() {
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
    TimeMachineView: (await server.ssrLoadModule("/src/components/TimeMachine.tsx")).TimeMachineView,
    MonumentDissectionView: (await server.ssrLoadModule("/src/components/MonumentDissection.tsx")).MonumentDissectionView,
    ThenNowView: (await server.ssrLoadModule("/src/components/ThenNow.tsx")).ThenNowView,
    AuthProvider: (await server.ssrLoadModule("/src/context/AuthContext.tsx")).AuthProvider,
  };
}

test("Time Machine renders API event fields, precise dates, and working source anchors", async () => {
  const { React, renderToStaticMarkup, TimeMachineView } = await loadViews();
  const site = makeSite();
  const html = renderToStaticMarkup(React.createElement(TimeMachineView, {
    sites: [site],
    siteId: site.routeId,
    site,
    query: "",
    searchResultCount: 1,
    listLoading: false,
    detailLoading: false,
    listError: null,
    detailError: null,
    setQuery() {},
    selectSite() {},
    retry() {},
  }));
  assert.match(html, /Museum established/);
  assert.match(html, /The museum was established on this date\./);
  assert.match(html, /<span>Event date: <\/span><time dateTime="1814-02-02">2 February 1814<\/time>/);
  assert.match(html, /href="\/heritage\/1#source-90"/);
  assert.match(html, /does not imply when the site was built or discovered/);
});

test("switching selected sites renders their own timeline and empty data stays explicit", async () => {
  const { React, renderToStaticMarkup, TimeMachineView, MonumentDissectionView } = await loadViews();
  const first = makeSite();
  const second = makeSite({
    routeId: "2",
    databaseId: 2,
    slug: "museum-two",
    name: "Museum Two",
    location: "New Delhi, Delhi",
    architecture: "",
    historicalPeriod: "",
    timelineEvents: [],
    architecturalLayers: [],
    artifacts: [],
    sources: [],
  });
  const commonProps = {
    sites: [first, second],
    siteId: second.routeId,
    site: second,
    query: "Museum Two",
    searchResultCount: 1,
    listLoading: false,
    detailLoading: false,
    listError: null,
    detailError: null,
    setQuery() {},
    selectSite() {},
    retry() {},
  };
  const timeHtml = renderToStaticMarkup(React.createElement(TimeMachineView, commonProps));
  assert.match(timeHtml, /No sourced timeline events are recorded for Museum Two yet\./);
  assert.doesNotMatch(timeHtml, /Museum established/);
  assert.match(timeHtml, /Museum Two/);
  const noMatchHtml = renderToStaticMarkup(React.createElement(TimeMachineView, {
    ...commonProps,
    query: "missing place",
    searchResultCount: 0,
  }));
  assert.match(noMatchHtml, /No site matches this search\. Your current selection remains available\./);

  const anatomyHtml = renderToStaticMarkup(React.createElement(MonumentDissectionView, commonProps));
  assert.match(anatomyHtml, /Architectural description not recorded\./);
  assert.match(anatomyHtml, /No component breakdown is recorded for this site\./);
  assert.match(anatomyHtml, /No artifact material records are available for this site\./);
  assert.match(anatomyHtml, /No details from another site are substituted\./);
  assert.doesNotMatch(anatomyHtml, /Entry hall/);
});

test("Anatomy renders API architecture, period, layers, artifact materials, and source links", async () => {
  const { React, renderToStaticMarkup, MonumentDissectionView } = await loadViews();
  const site = makeSite();
  const html = renderToStaticMarkup(React.createElement(MonumentDissectionView, {
    sites: [site],
    siteId: site.routeId,
    site,
    query: "",
    searchResultCount: 1,
    listLoading: false,
    detailLoading: false,
    listError: null,
    detailError: null,
    setQuery() {},
    selectSite() {},
    retry() {},
  }));
  assert.match(html, /A documented architectural description\./);
  assert.match(html, /Established 1814/);
  assert.match(html, /Entry hall/);
  assert.match(html, /Catalogued artifact/);
  assert.match(html, /Material: stone/);
  assert.match(html, /These materials describe catalogued artifacts\. They are not treated as construction materials/);
  assert.match(html, /href="\/heritage\/1#source-90"/);
});

test("both features render recoverable loading and request error states", async () => {
  const { React, renderToStaticMarkup, TimeMachineView, MonumentDissectionView } = await loadViews();
  const props = {
    sites: [],
    siteId: "",
    site: null,
    query: "",
    searchResultCount: 0,
    listLoading: true,
    detailLoading: true,
    listError: null,
    detailError: "The selected heritage record could not load.",
    setQuery() {},
    selectSite() {},
    retry() {},
  };
  for (const View of [TimeMachineView, MonumentDissectionView]) {
    const html = renderToStaticMarkup(React.createElement(View, props));
    assert.match(html, /role="status"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /Retry this site/);
  }
});

test("Then & Now shows a verified lone image and an explicit unavailable opposite side", async () => {
  const { React, renderToStaticMarkup, ThenNowView, AuthProvider } = await loadViews();
  const site = makeSite({
    media: [{
      id: 22,
      heritage_id: 1,
      media_type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/example.jpg",
      thumbnail_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/example.jpg",
      caption: "Documented contemporary view",
      alt_text: "The museum exterior",
      credit: "Photographer (CC BY 4.0)",
      creator: "Photographer",
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      source_url: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      documented_date: "2025-10-04",
      media_role: "current",
      verification_status: "verified",
      is_illustrative: false,
    }],
  });
  const html = renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(ThenNowView, {
    sites: [site],
    siteId: site.routeId,
    site,
    loadingSites: false,
    loadingDetail: false,
    listError: null,
    detailError: null,
    selectSite() {},
    retrySites() {},
    retrySite() {},
  })));
  assert.match(html, /Only one suitable dated photograph is recorded for Museum One/);
  assert.match(html, /No verified, dated historical photograph is available for this site/);
  assert.match(html, /Contemporary photograph · 2025-10-04/);
  assert.match(html, /src="https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/example\.jpg"/);
  assert.match(html, /https:\/\/commons\.wikimedia\.org\/wiki\/File:Example\.jpg/);
  assert.match(html, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
});

test("Then & Now renders retry controls and does not render stale data for another selected site", async () => {
  const { React, renderToStaticMarkup, ThenNowView, AuthProvider } = await loadViews();
  const first = makeSite();
  const second = makeSite({ routeId: "2", databaseId: 2, name: "Museum Two" });
  const errorHtml = renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(ThenNowView, {
    sites: [first, second],
    siteId: second.routeId,
    site: first,
    loadingSites: false,
    loadingDetail: false,
    listError: "The heritage list failed.",
    detailError: "The selected record failed.",
    selectSite() {},
    retrySites() {},
    retrySite() {},
  })));
  assert.match(errorHtml, /Retry loading sites/);
  assert.match(errorHtml, /Retry this site/);
  assert.doesNotMatch(errorHtml, /Museum established/);
  assert.doesNotMatch(errorHtml, /The museum was established on this date/);
  assert.match(errorHtml, /Museum Two/);
});
