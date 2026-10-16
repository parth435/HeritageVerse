const fs = require("node:fs");
const path = require("node:path");

const origin = "http://127.0.0.1:5173";
const outputDir = __dirname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const target = targets.find((entry) => entry.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target was not available");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const exceptions = [];
  const httpErrors = [];
  const mediaResponses = [];
  const tileResponses = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails?.text || "JavaScript exception");
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      consoleErrors.push({ text: message.params.entry.text, url: message.params.entry.url || null });
    }
    if (message.method === "Network.responseReceived") {
      const response = message.params.response;
      if (response.status >= 400) {
        httpErrors.push({ status: response.status, url: response.url });
      }
      if (/tile\.openstreetmap\.org/i.test(response.url)) {
        tileResponses.push({ status: response.status, mimeType: response.mimeType });
      }
      if (/thumb\.wikimedia\.org/i.test(response.url)) {
        mediaResponses.push({ status: response.status, mimeType: response.mimeType, url: response.url });
      }
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }

  async function screenshot(filename) {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, "base64"));
  }

  async function visit(route, filename, delay = 4500) {
    await send("Page.navigate", { url: `${origin}${route}` });
    await sleep(delay);
    const page = await evaluate(`(() => ({
      title: document.title,
      heading: document.querySelector("h1")?.innerText || "",
      text: (document.body?.innerText || "").slice(0, 1200),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      mapPresent: Boolean(document.querySelector(".leaflet-container")),
      markerCount: document.querySelectorAll(".leaflet-marker-icon").length,
      mapAttribution: document.querySelector(".leaflet-control-attribution")?.innerText || "",
      images: [...document.querySelectorAll("img")].map((img) => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt, src: img.currentSrc || img.src })),
      cardCount: document.querySelectorAll("article, [data-testid*=card]").length,
    }))()`);
    if (filename) await screenshot(filename);
    return page;
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");

  const results = { startedAt: new Date().toISOString(), desktop: {}, mobile: {} };
  results.desktop.home = await visit("/", "home-desktop.png", 6500);
  results.desktop.explore = await visit("/explore", null, 4500);
  results.desktop.detail = await visit("/heritage/15", "taj-mahal-detail-desktop.png", 6000);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  results.mobile.home = await visit("/", "home-mobile.png", 5000);
  results.mobile.explore = await visit("/explore", "explore-mobile.png", 5000);

  results.consoleErrors = consoleErrors;
  results.exceptions = exceptions;
  results.httpErrors = httpErrors;
  results.tileResponses = tileResponses;
  results.mediaResponses = mediaResponses;
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "browser-check.json"), `${JSON.stringify(results, null, 2)}\n`);
  socket.close();

  const failed = !results.desktop.home.mapPresent || results.desktop.explore.overflow ||
    results.desktop.detail.overflow || results.mobile.home.overflow || results.mobile.explore.overflow ||
    results.desktop.detail.images.filter((image) => image.complete && image.width > 0 && /thumb\.wikimedia\.org/i.test(image.src)).length < 2 ||
    !tileResponses.some((response) => response.status === 200 && response.mimeType === "image/png") ||
    mediaResponses.filter((response) => response.status === 200 && response.mimeType === "image/jpeg").length < 2 ||
    exceptions.length > 0 || consoleErrors.length > 0 || httpErrors.length > 0;
  console.log(JSON.stringify({
    status: failed ? "FAIL" : "PASS",
    homeMap: results.desktop.home.mapPresent,
    markers: results.desktop.home.markerCount,
    desktopExploreOverflow: results.desktop.explore.overflow,
    detailLoadedImages: results.desktop.detail.images.filter((image) => image.complete && image.width > 0).length,
    mobileHomeOverflow: results.mobile.home.overflow,
    mobileExploreOverflow: results.mobile.explore.overflow,
    successfulOsmTiles: tileResponses.filter((response) => response.status === 200 && response.mimeType === "image/png").length,
    successfulThenNowImages: mediaResponses.filter((response) => response.status === 200 && response.mimeType === "image/jpeg").length,
    consoleErrors: consoleErrors.length,
    exceptions: exceptions.length,
    httpErrors: httpErrors.length,
  }, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
