const fs = require("node:fs");
const path = require("node:path");
const origin = "http://127.0.0.1:5173";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No browser page target available");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result || {}); }
    else if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails?.text || "JavaScript exception");
    else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const text = message.params.entry.text || "";
      if (!text.includes("Page entered Back-Forward Cache")) consoleErrors.push(text);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.text); return response.result?.value; };
  const pageState = () => evaluate(`(() => ({path:location.pathname, heading:document.querySelector("h1")?.innerText||"", hasSignInForm:Boolean(document.querySelector('input[type="email"]')&&document.querySelector('input[type="password"]')), isNotFound:(document.body?.innerText||"").includes("Page not found"), overflow:document.documentElement.scrollWidth>innerWidth}))()`);
  const results = { startedAt: new Date().toISOString(), routes: {}, history: {} };
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await send("Emulation.clearDeviceMetricsOverride");
  for (const route of ["/admin", "/admin/heritage", "/admin/categories"]) {
    await send("Page.navigate", { url: `${origin}${route}` }); await sleep(900);
    results.routes[route] = { direct: await pageState() };
    await send("Page.reload", { ignoreCache: true }); await sleep(900);
    results.routes[route].afterRefresh = await pageState();
  }
  await send("Page.navigate", { url: `${origin}/admin` }); await sleep(900);
  results.history.before = await pageState();
  await send("Page.navigate", { url: `${origin}/admin/heritage` }); await sleep(900);
  results.history.middle = await pageState();
  await send("Page.navigate", { url: `${origin}/admin/categories` }); await sleep(900);
  results.history.afterNavigate = await pageState();
  await evaluate("history.back()"); await sleep(900);
  results.history.afterBack = await pageState();
  await evaluate("history.forward()"); await sleep(900);
  results.history.afterForward = await pageState();
  results.consoleErrors = consoleErrors; results.exceptions = exceptions; results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, "admin-router-history-check.json"), `${JSON.stringify(results, null, 2)}\n`);
  socket.close();
  const routes = Object.values(results.routes).flatMap((result) => [result.direct, result.afterRefresh]);
  const failed = routes.some((page) => page.isNotFound || !page.hasSignInForm || page.overflow) ||
    results.history.before.path !== "/admin" || results.history.middle.path !== "/admin/heritage" ||
    results.history.afterNavigate.path !== "/admin/categories" || results.history.afterBack.path !== "/admin/heritage" ||
    results.history.afterForward.path !== "/admin/categories" || consoleErrors.length > 0 || exceptions.length > 0;
  console.log(JSON.stringify({ status: failed ? "FAIL" : "PASS", routes: Object.fromEntries(Object.entries(results.routes).map(([route,result])=>[route,{direct:result.direct,afterRefresh:result.afterRefresh}])), history: results.history, consoleErrors, exceptions }, null, 2));
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
