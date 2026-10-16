const fs = require("node:fs");
const path = require("node:path");
const origin = "http://127.0.0.1:5173";
const outputDir = __dirname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const target = targets.find((item) => item.type === "page");
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
  const mapTiles = [];
  const thenNowImages = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails?.text || "JavaScript exception");
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") consoleErrors.push(message.params.entry.text);
    if (message.method === "Network.responseReceived") {
      const response = message.params.response;
      if (response.status >= 400) httpErrors.push({ status: response.status, url: response.url });
      if (/tile\.openstreetmap\.org/i.test(response.url)) mapTiles.push({ status: response.status, mimeType: response.mimeType });
      if (/thumb\.wikimedia\.org/i.test(response.url)) thenNowImages.push({ status: response.status, mimeType: response.mimeType });
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  };
  const screenshot = async (filename) => {
    const response = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(outputDir, filename), Buffer.from(response.data, "base64"));
  };
  const visit = async (route, delay = 1000) => {
    await send("Page.navigate", { url: `${origin}${route}` });
    await sleep(delay);
    return evaluate(`(() => ({
      title: document.title,
      heading: document.querySelector("h1")?.innerText || "",
      eyebrow: document.querySelector("main p")?.innerText || "",
      text: (document.body?.innerText || "").slice(0, 600),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      isNotFound: (document.body?.innerText || "").includes("Page not found"),
      signInLink: [...document.querySelectorAll("a")].some((link) => link.innerText.trim().toLowerCase().includes("sign in") && link.getAttribute("href") === "/login"),
    }))()`);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  const results = { startedAt: new Date().toISOString(), thenNow: {}, adminRoutes: { desktop: {}, mobile: {} } };

  await visit("/", 5000);
  await evaluate("(() => { const section = document.querySelector('#then-now'); const select = section?.querySelector('select'); const option = [...(select?.options || [])].find((item) => /taj mahal/i.test(item.text)); if (option) { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); } return { selected: select?.selectedOptions[0]?.textContent || '', tajOptionFound: Boolean(option) }; })()");
  await sleep(500);
  await evaluate("document.querySelector('#then-now')?.scrollIntoView({behavior:'instant',block:'start'})");
  await sleep(7000);
  results.thenNow.desktop = await evaluate(`(() => {
    const section = document.querySelector("#then-now");
    const images = [...(section?.querySelectorAll("img") || [])];
    return {
      heading: section?.querySelector("h2")?.innerText || "",
      selectedSite: section?.querySelector("select")?.selectedOptions[0]?.textContent || "",
      text: (section?.innerText || "").slice(-1100),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      images: images.map((img) => ({ complete: img.complete, width: img.naturalWidth, alt: img.alt, src: img.currentSrc || img.src })),
    };
  })()`);
  await screenshot("then-now-desktop.png");

  for (const route of ["/admin", "/admin/heritage", "/admin/categories"]) {
    results.adminRoutes.desktop[route] = await visit(route, 1000);
    await screenshot(`admin${route.replaceAll("/", "-")}-desktop.png`);
  }

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await visit("/", 5000);
  await evaluate("(() => { const section = document.querySelector('#then-now'); const select = section?.querySelector('select'); const option = [...(select?.options || [])].find((item) => /taj mahal/i.test(item.text)); if (option) { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); } return { selected: select?.selectedOptions[0]?.textContent || '', tajOptionFound: Boolean(option) }; })()");
  await sleep(500);
  await evaluate("document.querySelector('#then-now')?.scrollIntoView({behavior:'instant',block:'start'})");
  await sleep(7000);
  results.thenNow.mobile = await evaluate(`(() => {
    const section = document.querySelector("#then-now");
    const images = [...(section?.querySelectorAll("img") || [])];
    return {
      heading: section?.querySelector("h2")?.innerText || "",
      selectedSite: section?.querySelector("select")?.selectedOptions[0]?.textContent || "",
      text: (section?.innerText || "").slice(-1100),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      images: images.map((img) => ({ complete: img.complete, width: img.naturalWidth, alt: img.alt, src: img.currentSrc || img.src })),
    };
  })()`);
  await screenshot("then-now-mobile.png");
  for (const route of ["/admin", "/admin/heritage", "/admin/categories"]) {
    results.adminRoutes.mobile[route] = await visit(route, 1000);
    await screenshot(`admin${route.replaceAll("/", "-")}-mobile.png`);
  }

  results.mapTiles = mapTiles;
  results.thenNowImageResponses = thenNowImages;
  results.consoleErrors = consoleErrors;
  results.exceptions = exceptions;
  results.httpErrors = httpErrors;
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "focused-check.json"), `${JSON.stringify(results, null, 2)}\n`);
  socket.close();

  const routeChecks = [...Object.values(results.adminRoutes.desktop), ...Object.values(results.adminRoutes.mobile)];
  const fails = results.thenNow.desktop.overflow || results.thenNow.mobile.overflow ||
    results.thenNow.desktop.images.filter((image) => image.complete && image.width > 0).length < 2 ||
    results.thenNow.mobile.images.filter((image) => image.complete && image.width > 0).length < 2 ||
    routeChecks.some((route) => route.isNotFound || !route.signInLink || route.overflow) ||
    exceptions.length > 0 || consoleErrors.length > 0 || httpErrors.length > 0;
  console.log(JSON.stringify({
    status: fails ? "FAIL" : "PASS",
    thenNowDesktopImages: results.thenNow.desktop.images.filter((image) => image.complete && image.width > 0).length,
    thenNowMobileImages: results.thenNow.mobile.images.filter((image) => image.complete && image.width > 0).length,
    thenNowDesktopOverflow: results.thenNow.desktop.overflow,
    thenNowMobileOverflow: results.thenNow.mobile.overflow,
    adminRouteChecks: routeChecks.map((route) => ({ heading: route.heading, signInLink: route.signInLink, isNotFound: route.isNotFound, overflow: route.overflow })),
    successfulMapTiles: mapTiles.filter((item) => item.status === 200).length,
    successfulThenNowImageResponses: thenNowImages.filter((item) => item.status === 200).length,
    consoleErrors: consoleErrors.length,
    exceptions: exceptions.length,
    httpErrors: httpErrors.length,
  }, null, 2));
  if (fails) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

