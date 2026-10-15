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

async function loadAtlasModules() {
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
      mode: "development",
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
    LivingAtlas: (await server.ssrLoadModule("/src/components/LivingAtlas.tsx")).LivingAtlas,
    BrowserRouter: (await server.ssrLoadModule("/src/lib/router.tsx")).BrowserRouter,
    api: await server.ssrLoadModule("/src/lib/api.ts"),
  };
}

function createHookHarness(React, LivingAtlas) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let element;

  const dispatcher = {
    useState(initialValue) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [slots[slot], (nextValue) => {
        slots[slot] = typeof nextValue === "function" ? nextValue(slots[slot]) : nextValue;
      }];
    },
    useEffect(callback, dependencies) {
      const slot = cursor++;
      const previous = slots[slot];
      const changed = !previous || !dependencies || dependencies.some((value, index) => !Object.is(value, previous.dependencies?.[index]));
      if (changed) pendingEffects.push({ slot, callback, dependencies, previous });
    },
    useCallback(callback) {
      cursor++;
      return callback;
    },
  };

  function render() {
    cursor = 0;
    const previousDispatcher = internals.H;
    internals.H = dispatcher;
    try {
      element = LivingAtlas();
    } finally {
      internals.H = previousDispatcher;
    }

    const effects = pendingEffects;
    pendingEffects = [];
    for (const effect of effects) {
      effect.previous?.cleanup?.();
      const cleanup = effect.callback();
      slots[effect.slot] = { dependencies: effect.dependencies, cleanup };
    }
    return element;
  }

  return { render, get element() { return element; } };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function record(id) {
  return {
    id,
    slug: `heritage-place-${id}`,
    name: `Heritage Place ${id}`,
    description: "A published heritage catalogue record.",
    state: "Maharashtra",
    district: "Pune",
    locality: "Pune",
    latitude: null,
    longitude: null,
    coordinates_verified: false,
    media: [],
  };
}

async function renderScenario(modules, scenario = {}) {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  globalThis.window = {
    location: { pathname: "/", search: "", hash: "" },
    setTimeout: () => 1,
    clearTimeout() {},
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  console.error = () => {};

  const records = scenario.emptyCatalogue ? [] : Array.from({ length: 30 }, (_, index) => record(index + 1));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    switch (url.pathname) {
      case "/api/categories":
        return scenario.categoriesFailure
          ? jsonResponse({ success: false, message: "Category request failed." }, 503)
          : jsonResponse({ success: true, categories: [{ id: 1, name: "Fort", slug: "fort" }] });
      case "/api/heritage-facets":
        return scenario.facetsFailure
          ? jsonResponse({ success: false, message: "Facet request failed." }, 503)
          : jsonResponse({ success: true, states: ["Maharashtra"], districts: ["Pune"] });
      case "/api/heritage":
        if (scenario.catalogueFailure) return jsonResponse({ success: false, message: "Catalogue request failed." }, 503);
        if (scenario.jsonFailure) return new Response("{bad json", { status: 200 });
        return jsonResponse({
          success: true,
          items: records,
          pagination: { limit: 100, offset: 0, total: records.length },
        });
      case "/api/heritage-map":
        if (scenario.mapFailure) throw new TypeError("Failed to fetch");
        return jsonResponse({ success: true, items: [], pagination: { limit: 100, offset: 0, total: 0 } });
      default:
        throw new Error(`Unexpected API request: ${url.pathname}`);
    }
  };

  try {
    const harness = createHookHarness(modules.React, modules.LivingAtlas);
    harness.render();
    if (!scenario.initialLoading) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        harness.render();
      }
    }
    const tree = modules.React.createElement(modules.BrowserRouter, null, harness.element);
    return modules.renderToStaticMarkup(tree);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
}

test("Living Atlas renders the right state for independent API outcomes", async (t) => {
  const modules = await loadAtlasModules();

  await t.test("loading is distinct from empty results", async () => {
    const html = await renderScenario(modules, { initialLoading: true });
    assert.match(html, /Loading the published heritage collection/);
    assert.match(html, /Loading published heritage records/);
    assert.doesNotMatch(html, /No records match these filters/);
    assert.doesNotMatch(html, /No heritage records match the current filters/);
  });

  await t.test("successful catalogue request renders all 30 records without photos", async () => {
    const html = await renderScenario(modules);
    assert.match(html, /Heritage Place 30/);
    assert.ok((html.match(/Heritage Place \d+/g) ?? []).length >= 30);
    assert.match(html, /Illustrative placeholder; no photograph available for Heritage Place 1/);
    assert.match(html, /No sites in these results have a complete coordinate pair/);
    assert.doesNotMatch(html, /No heritage records match the current filters/);
    assert.doesNotMatch(html, /role="alert"/);
  });

  await t.test("category failure leaves catalogue records and successful facets visible", async () => {
    const html = await renderScenario(modules, { categoriesFailure: true });
    assert.match(html, /Some filter options could not load/);
    assert.match(html, /Category request failed/);
    assert.match(html, /Maharashtra/);
    assert.match(html, /Heritage Place 30/);
    assert.doesNotMatch(html, /The collection could not load/);
  });

  await t.test("facet failure leaves catalogue records and successful categories visible", async () => {
    const html = await renderScenario(modules, { facetsFailure: true });
    assert.match(html, /Some filter options could not load/);
    assert.match(html, /Facet request failed/);
    assert.match(html, />Fort<\/option>/);
    assert.match(html, /Heritage Place 30/);
    assert.doesNotMatch(html, /The collection could not load/);
  });

  await t.test("map failure leaves catalogue records visible and reports map loading separately", async () => {
    const html = await renderScenario(modules, { mapFailure: true });
    assert.match(html, /Map locations could not load/);
    assert.match(html, /Heritage Place 30/);
    assert.doesNotMatch(html, /No heritage records match the current filters/);
    assert.doesNotMatch(html, /The collection could not load/);
  });

  await t.test("catalogue failure shows an error and never an empty-results message", async () => {
    const html = await renderScenario(modules, { catalogueFailure: true });
    assert.match(html, /Catalogue request failed/);
    assert.match(html, /The heritage catalogue could not load/);
    assert.doesNotMatch(html, /No records match these filters/);
    assert.doesNotMatch(html, /No heritage records match the current filters/);
  });

  await t.test("successful empty catalogue response shows the actual empty state", async () => {
    const html = await renderScenario(modules, { emptyCatalogue: true });
    assert.match(html, /No records match these filters/);
    assert.match(html, /No heritage records match the current filters/);
    assert.doesNotMatch(html, /role="alert"/);
  });

  await t.test("invalid JSON shows a parsing error and never an empty-results message", async () => {
    const html = await renderScenario(modules, { jsonFailure: true });
    assert.match(html, /The server returned an invalid JSON response/);
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /No records match these filters/);
    assert.doesNotMatch(html, /No heritage records match the current filters/);
  });
});

test("API diagnostics preserve the fetch cause and log only a safe endpoint path", async () => {
  const { api } = await loadAtlasModules();
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalConsoleError = console.error;
  const originalCause = new TypeError("Network failed; token=private-value");
  const diagnostics = [];
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async () => { throw originalCause; };
  console.error = (...args) => diagnostics.push(args);

  try {
    await assert.rejects(
      api.apiRequest("heritage?token=private-value"),
      (error) => error instanceof api.ApiRequestError &&
        error.classification === "network" &&
        error.endpointPath === "/api/heritage" &&
        error.cause === originalCause,
    );
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(diagnostics[0][1], {
      endpoint: "/api/heritage",
      classification: "network",
      causeName: "TypeError",
    });
    assert.doesNotMatch(JSON.stringify(diagnostics), /private-value/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});

test("successful empty bodies normalize to empty data and malformed shapes are classified", async () => {
  const { api } = await loadAtlasModules();
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalConsoleError = console.error;
  globalThis.localStorage = { getItem: () => null };
  console.error = () => {};

  try {
    globalThis.fetch = async () => new Response(null, { status: 200 });
    const emptyPage = await api.getHeritage({ limit: 100 });
    assert.deepEqual(emptyPage.items, []);
    assert.deepEqual(emptyPage.pagination, { limit: 100, offset: 0, total: 0 });

    globalThis.fetch = async () => jsonResponse({ success: true, items: [] });
    await assert.rejects(
      api.getHeritage({ limit: 100 }),
      (error) => error instanceof api.ApiRequestError &&
        error.classification === "shape" &&
        error.endpointPath === "/api/heritage",
    );

    globalThis.fetch = async () => jsonResponse({ success: false, message: "Unavailable." }, 503);
    await assert.rejects(
      api.getHeritage({ limit: 100 }),
      (error) => error instanceof api.ApiRequestError && error.status === 503 && error.classification === "http",
    );

    globalThis.fetch = async () => new Response("{invalid", { status: 200 });
    await assert.rejects(
      api.getHeritage({ limit: 100 }),
      (error) => error instanceof api.ApiRequestError &&
        error.classification === "json" &&
        error.cause instanceof SyntaxError,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});
