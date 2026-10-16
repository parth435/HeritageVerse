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
  const errors = { console: [], exceptions: [], http: [] };
  const requestMethods = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    if (message.method === "Runtime.exceptionThrown") errors.exceptions.push(message.params.exceptionDetails?.text || "JavaScript exception");
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.console.push(message.params.entry.text);
    if (message.method === "Network.responseReceived" && message.params.response.status >= 400) errors.http.push({ status: message.params.response.status, url: message.params.response.url });
    if (message.method === "Network.requestWillBeSent" && /^POST|PUT|PATCH|DELETE$/i.test(message.params.request.method)) requestMethods.push({ method: message.params.request.method, url: message.params.request.url });
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
  const navigate = async (route, delay = 1800) => {
    await send("Page.navigate", { url: `${origin}${route}` });
    await sleep(delay);
  };
  const setInput = (selector, value) => evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); if(!element)return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(element,${JSON.stringify(value)}); element.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  const setSelectByText = (selector, fragment) => evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); if(!element)return {found:false}; const option=[...element.options].find((item)=>item.text.toLowerCase().includes(${JSON.stringify(fragment.toLowerCase())})); if(!option)return {found:false,options:[...element.options].map((item)=>item.text)}; element.value=option.value; element.dispatchEvent(new Event('change',{bubbles:true})); return {found:true,text:option.text,value:option.value}; })()`);
  const metrics = () => evaluate(`(() => ({
    path: location.pathname,
    heading: document.querySelector("h1")?.innerText || "",
    text: (document.body?.innerText || "").slice(0, 900),
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))()`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  const results = { startedAt: new Date().toISOString(), readOnly: true, public: {}, protected: {}, navigation: {}, authValidation: {} };

  await navigate("/");
  results.public.home = await evaluate(`(() => ({heading:document.querySelector("h1")?.innerText||"",mapPresent:Boolean(document.querySelector(".leaflet-container")),markers:document.querySelectorAll(".leaflet-marker-icon").length,attribution:document.querySelector(".leaflet-control-attribution")?.innerText||""}))()`);

  await navigate("/explore", 2500);
  const filters = 'section[aria-label="Filter heritage places"]';
  const resultCount = () => evaluate(`document.querySelector(${JSON.stringify(filters)}+' p[aria-live="polite"]')?.innerText || ""`);
  const cards = () => evaluate(`[...document.querySelectorAll('div[aria-live="polite"] article h2')].map((item)=>item.innerText)`);
  results.public.exploreInitial = { ...(await metrics()), resultCount: await resultCount(), categories: await evaluate(` [...document.querySelectorAll(${JSON.stringify(filters)}+' select')][0] ? [...document.querySelectorAll(${JSON.stringify(filters)}+' select')[0].options].map((item)=>item.text) : []`) };

  await setInput(`${filters} input[type="search"]`, "Taj Mahal");
  await sleep(1300);
  results.public.search = { resultCount: await resultCount(), cards: await cards() };
  results.public.categorySelection = await setSelectByText(`${filters} label:nth-of-type(2) select`, "mausoleum");
  await sleep(1000);
  results.public.categoryFilter = { resultCount: await resultCount(), cards: await cards() };
  results.public.stateSelection = await setSelectByText(`${filters} label:nth-of-type(3) select`, "uttar pradesh");
  await sleep(1000);
  results.public.stateFilter = { resultCount: await resultCount(), cards: await cards() };
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(filters)}+' button')].find((button)=>button.innerText.toLowerCase().includes('reset'))?.click()`);
  await sleep(1300);
  results.public.reset = { resultCount: await resultCount(), search: await evaluate(`document.querySelector(${JSON.stringify(filters)}+' input[type="search"]')?.value||""`) };

  await setInput(`${filters} input[type="search"]`, "Taj Mahal");
  await sleep(1200);
  await evaluate(`document.querySelector('a[href^="/heritage/"]')?.click()`);
  await sleep(2500);
  results.public.detail = await evaluate(`(() => ({
    heading:document.querySelector("h1")?.innerText||"",
    citationLinks:document.querySelectorAll('#sources a[href^="https://"]').length,
    sourceSection:Boolean(document.querySelector("#sources")),
    reviewHeading:[...document.querySelectorAll("h2")].find((item)=>item.innerText.includes("Visitor reviews"))?.innerText||"",
    anonymousReviewPrompt:(document.body?.innerText||"").includes("Sign in to write a review."),
    mapPresent:Boolean(document.querySelector(".leaflet-container")),
    overflow:document.documentElement.scrollWidth>innerWidth,
  }))()`);
  results.public.detailH1 = results.public.detail.heading;

  await evaluate("history.back()");
  await sleep(700);
  results.navigation.backToExplore = await metrics();
  await evaluate("history.forward()");
  await sleep(900);
  results.navigation.forwardToDetail = await metrics();

  for (const route of ["/favorites", "/visited", "/profile", "/journeys"]) {
    await navigate(route);
    results.protected[route] = await metrics();
  }
  await navigate("/login");
  await setInput('input[type="email"]', "qa@example.invalid");
  await setInput('input[type="password"]', "1234567");
  await evaluate('document.querySelector("form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
  await sleep(500);
  results.authValidation = await evaluate(`({message:[...document.querySelectorAll("form p")].map((item)=>item.innerText).find((text)=>text.includes("Password must"))||"",passwordPlaceholder:document.querySelector('input[type="password"]')?.placeholder||""})`);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/");
  await evaluate(`([...document.querySelectorAll("button")].find((button)=>button.getAttribute("aria-label")==="Toggle menu"))?.click()`);
  await sleep(200);
  results.navigation.mobileMenuOpened = await evaluate(`Boolean([...document.querySelectorAll("button")].find((button)=>button.getAttribute("aria-label")==="Toggle menu")?.getAttribute("aria-expanded") === "true")`);
  await evaluate(`([...document.querySelectorAll('a[href="/explore"]')].find((link)=>link.offsetParent!==null))?.click()`);
  await sleep(1000);
  results.navigation.mobileExplore = await metrics();
  results.navigation.mobileMenuClosed = await evaluate(`[...document.querySelectorAll("button")].find((button)=>button.getAttribute("aria-label")==="Toggle menu")?.getAttribute("aria-expanded") === "false"`);
  await navigate("/heritage/15", 2500);
  results.public.mobileDetail = await metrics();

  results.mutationRequests = requestMethods;
  results.errors = errors;
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "workflow-check.json"), `${JSON.stringify(results, null, 2)}\n`);
  socket.close();

  const failed = !results.public.home.mapPresent || results.public.home.markers < 1 ||
    !results.public.search.cards.some((name) => /taj mahal/i.test(name)) ||
    !results.public.categorySelection.found || !results.public.stateSelection.found ||
    !results.public.stateFilter.cards.some((name) => /taj mahal/i.test(name)) ||
    results.public.detail.heading !== "Taj Mahal" || !results.public.detail.sourceSection || !results.public.detail.anonymousReviewPrompt ||
    results.navigation.backToExplore.heading !== "Explore the heritage atlas." || results.navigation.forwardToDetail.heading !== "Taj Mahal" ||
    !results.navigation.mobileMenuOpened || !results.navigation.mobileMenuClosed || results.navigation.mobileExplore.heading !== "Explore the heritage atlas." ||
    results.public.mobileDetail.overflow || !results.authValidation.message.includes("at least 8 characters") ||
    Object.values(results.protected).some((page) => page.overflow || page.text.length === 0) ||
    requestMethods.length > 0 || errors.console.length > 0 || errors.exceptions.length > 0 || errors.http.length > 0;
  console.log(JSON.stringify({
    status: failed ? "FAIL" : "PASS",
    homeMarkers: results.public.home.markers,
    search: results.public.search,
    categorySelection: results.public.categorySelection,
    categoryFilter: results.public.categoryFilter,
    stateSelection: results.public.stateSelection,
    stateFilter: results.public.stateFilter,
    reset: results.public.reset,
    detail: results.public.detail,
    backForward: { back: results.navigation.backToExplore.heading, forward: results.navigation.forwardToDetail.heading },
    protectedPaths: Object.fromEntries(Object.entries(results.protected).map(([route,page])=>[route,page.heading])),
    authValidation: results.authValidation,
    mobileMenuOpened: results.navigation.mobileMenuOpened,
    mobileMenuClosed: results.navigation.mobileMenuClosed,
    mobileExploreOverflow: results.navigation.mobileExplore.overflow,
    mobileDetailOverflow: results.public.mobileDetail.overflow,
    mutationRequests: requestMethods.length,
    consoleErrors: errors.console.length,
    exceptions: errors.exceptions.length,
    httpErrors: errors.http.length,
  }, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });


