import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const rendered = spawnSync(process.execPath, ["--test", "tests/rendered-html.test.mjs"], { stdio: "inherit" });
if (rendered.status !== 0) process.exit(rendered.status ?? 1);

const BROWSER_START_TIMEOUT_MS = 15_000;
const WORKSPACE_READY_TIMEOUT_MS = 20_000;
const BROWSER_EXIT_TIMEOUT_MS = 10_000;

function browserBinary() {
  const candidates = [process.env.CIRCA_E2E_BROWSER, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "google-chrome", "chromium", "chromium-browser"];
  for (const candidate of candidates.filter(Boolean)) {
    if (candidate.includes("\\")) { if (existsSync(candidate)) return candidate; }
    else { const result = spawnSync(process.platform === "win32" ? "where" : "which", [candidate], { encoding: "utf8" }); if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0]; }
  }
  throw new Error("Chrome or Chromium is required for the critical browser smoke suite.");
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function excerpt(value, length = 1_200) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function webSocketText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

class CdpConnection {
  static async connect(url) {
    const socket = new WebSocket(url);
    await withTimeout(new Promise((resolveConnection, rejectConnection) => {
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("error", () => rejectConnection(new Error(`Could not connect to Chromium DevTools at ${url}.`)), { once: true });
    }), BROWSER_START_TIMEOUT_MS, "Timed out connecting to Chromium DevTools.");
    return new CdpConnection(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(webSocketText(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Chromium DevTools connection closed."));
      this.pending.clear();
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

async function devToolsPages(browserWebSocketUrl) {
  const browserUrl = new URL(browserWebSocketUrl);
  const endpoint = `http://${browserUrl.host}/json/list`;
  const deadline = Date.now() + BROWSER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return response.json();
    } catch { /* Chromium may announce DevTools just before the HTTP endpoint is ready. */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Chromium DevTools did not expose a page target at ${endpoint}.`);
}

async function launchBrowser(browser, profile) {
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-breakpad", "--disable-crash-reporter", "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"];
  const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
  const output = { stdout: "", stderr: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output.stdout += chunk; });

  let resolveDevTools;
  const devToolsUrl = new Promise((resolveUrl) => { resolveDevTools = resolveUrl; });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk;
    const match = output.stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) resolveDevTools(match[1]);
  });
  const exit = new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (status, signal) => resolveExit({ status: status ?? 1, signal }));
  });
  const browserWebSocketUrl = await withTimeout(Promise.race([
    devToolsUrl,
    exit.then(({ status, signal }) => { throw new Error(`Chromium exited before DevTools was ready (exit ${status}${signal ? `, signal ${signal}` : ""}).`); }),
  ]), BROWSER_START_TIMEOUT_MS, "Chromium DevTools did not start in time.");
  const pages = await devToolsPages(browserWebSocketUrl);
  const page = pages.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page) throw new Error("Chromium started without a debuggable page target.");
  return {
    browserConnection: await CdpConnection.connect(browserWebSocketUrl),
    child,
    exit,
    output,
    pageConnection: await CdpConnection.connect(page.webSocketDebuggerUrl),
  };
}

async function closeBrowser(launched) {
  if (!launched) return { status: 1, signal: null };
  try { await withTimeout(launched.browserConnection.send("Browser.close"), 2_000, "Browser.close was not acknowledged."); } catch { /* Browser.close commonly closes the socket before acknowledging. */ }
  const exit = await withTimeout(launched.exit, BROWSER_EXIT_TIMEOUT_MS, "Chromium did not exit after Browser.close.").catch(() => {
    launched.child.kill();
    return { status: 1, signal: "timeout" };
  });
  launched.pageConnection.close();
  launched.browserConnection.close();
  return exit;
}

const workerUrl = pathToFileURL(`${process.cwd()}/dist/server/index.js`);
workerUrl.searchParams.set("critical-e2e", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const serverErrors = [];
const server = createServer(async (incoming, outgoing) => {
  try {
    const incomingUrl = new URL(`http://circa.test${incoming.url}`);
    if (incomingUrl.pathname.startsWith("/assets/")) {
      const clientRoot = resolve("dist/client"); const assetPath = resolve("dist/client", `.${incomingUrl.pathname}`);
      if (!assetPath.startsWith(`${clientRoot}\\`) && !assetPath.startsWith(`${clientRoot}/`)) throw new Error("Invalid asset path.");
      const contentTypes = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
      outgoing.writeHead(200, { "content-type": contentTypes[extname(assetPath)] || "application/octet-stream" }).end(await readFile(assetPath)); return;
    }
    const request = new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, { method: incoming.method, headers: incoming.headers });
    const response = await worker.fetch(request, process.env, { waitUntil(promise) { void promise.catch(() => undefined); }, passThroughOnException() {} });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
  } catch (error) {
    serverErrors.push(error instanceof Error ? error.stack || error.message : String(error));
    outgoing.writeHead(500).end("Critical smoke server failed.");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const browser = browserBinary();
const allRoutes = [
  ["/?workspace=1", /Your projects|What are you mapping/i, "Personal workspace"],
  ["/auth", /Welcome to|Continue securely/i, "authentication"],
  ["/community/new", /Create a useful/i, "Community"],
  ["/network/new", /Bring in/i, "Network"],
  ["/", /Describe the people|Try Compose/i, "Compose entry"],
];
const routes = process.argv.includes("--personal-only") ? [allRoutes[0], allRoutes[4]] : allRoutes;

async function checkProductionServer() {
  const requestedUrl = `${baseUrl}/?workspace=1`;
  try {
    const response = await fetch(requestedUrl, { headers: { accept: "text/html" } });
    const html = await response.text();
    const healthy = response.status === 200 && /<!doctype html|<html/i.test(html) && /Circa/i.test(html);
    return { healthy, requestedUrl, status: response.status, output: html, errors: [...serverErrors] };
  } catch (error) {
    return { healthy: false, requestedUrl, status: null, output: "", errors: [...serverErrors, error instanceof Error ? error.stack || error.message : String(error)] };
  }
}

async function readPage(pageConnection) {
  const evaluation = await pageConnection.send("Runtime.evaluate", {
    expression: `({ finalUrl: location.href, text: document.body?.innerText ?? "", dom: document.documentElement?.outerHTML ?? "", readyState: document.readyState })`,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text || "Could not inspect the rendered page.");
  return evaluation.result.value;
}

async function inspectRoute(requestedUrl, expected) {
  const profile = await mkdtemp(join(tmpdir(), "circa-browser-smoke-"));
  let launched;
  let page = { finalUrl: "", text: "", dom: "", readyState: "" };
  let navigationStatus = null;
  const runtimeErrors = [];
  let failure = null;
  let matched = false;
  try {
    launched = await launchBrowser(browser, profile);
    const { pageConnection } = launched;
    pageConnection.on("Network.responseReceived", ({ response, type }) => {
      if (type === "Document") navigationStatus = response.status;
    });
    pageConnection.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      runtimeErrors.push(exceptionDetails?.exception?.description || exceptionDetails?.text || "Unknown page exception.");
    });
    await Promise.all([
      pageConnection.send("Network.enable"),
      pageConnection.send("Page.enable"),
      pageConnection.send("Runtime.enable"),
    ]);
    const navigation = await pageConnection.send("Page.navigate", { url: requestedUrl });
    if (navigation.errorText) throw new Error(`Chromium navigation failed: ${navigation.errorText}`);

    const deadline = Date.now() + WORKSPACE_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      page = await readPage(pageConnection);
      matched = expected.test(page.text);
      if (matched && page.readyState === "complete") break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  } catch (error) {
    failure = error instanceof Error ? error.stack || error.message : String(error);
    if (launched) {
      try { page = await readPage(launched.pageConnection); } catch { /* Preserve the original browser failure. */ }
    }
  }
  const exit = await closeBrowser(launched);
  await rm(profile, { recursive: true, force: true });
  return {
    browserExitStatus: exit.status,
    browserSignal: exit.signal,
    browserStderr: launched?.output.stderr || "",
    browserStdout: launched?.output.stdout || "",
    failure,
    matched,
    navigationStatus,
    page,
    runtimeErrors,
  };
}

function smokeFailure(name, expected, requestedUrl, health, result) {
  return new Error([
    `${name} browser smoke failed (exit ${result.browserExitStatus}).`,
    `Expected DOM marker: ${expected}.`,
    `Requested URL: ${requestedUrl}.`,
    `Final URL: ${result.page.finalUrl || "unavailable"}.`,
    `Production server healthy before Chromium: ${health.healthy} (HTTP ${health.status ?? "unavailable"}).`,
    `Navigation response: HTTP ${result.navigationStatus ?? "unavailable"}; document.readyState=${result.page.readyState || "unavailable"}.`,
    `Matched expected marker: ${result.matched}.`,
    `Dumped DOM: ${excerpt(result.page.dom) || "<empty>"}`,
    `Rendered text: ${excerpt(result.page.text) || "<empty>"}`,
    `Browser stdout: ${excerpt(result.browserStdout) || "<empty>"}`,
    `Browser stderr: ${excerpt(result.browserStderr) || "<empty>"}`,
    `Page exceptions: ${result.runtimeErrors.join(" | ") || "none"}.`,
    `Harness failure: ${result.failure || "none"}.`,
    `Server errors: ${[...health.errors, ...serverErrors].join(" | ") || "none"}.`,
  ].join("\n"));
}

function printDiagnostics(name, expected, requestedUrl, health, result) {
  if (process.env.CIRCA_E2E_DIAGNOSTICS !== "1") return;
  console.log([
    `[critical-browser diagnostics: ${name}]`,
    `requested URL: ${requestedUrl}`,
    `final URL: ${result.page.finalUrl || "unavailable"}`,
    `production server healthy before Chromium: ${health.healthy} (HTTP ${health.status ?? "unavailable"})`,
    `navigation response: HTTP ${result.navigationStatus ?? "unavailable"}`,
    `browser exit status: ${result.browserExitStatus}`,
    `expected rendered-text marker: ${expected}`,
    `rendered text: ${excerpt(result.page.text) || "<empty>"}`,
    `dumped DOM: ${excerpt(result.page.dom) || "<empty>"}`,
    `browser stdout: ${excerpt(result.browserStdout) || "<empty>"}`,
    `browser stderr: ${excerpt(result.browserStderr) || "<empty>"}`,
  ].join("\n"));
}

try {
  const health = await checkProductionServer();
  if (!health.healthy) throw new Error(`Production server health check failed before Chromium launch (HTTP ${health.status ?? "unavailable"}). HTML: ${excerpt(health.output)} Errors: ${health.errors.join(" | ") || "none"}`);
  console.log(`Production server health passed before Chromium launch: ${health.requestedUrl} (HTTP ${health.status}).`);
  for (const [path, expected, name] of routes) {
    const requestedUrl = `${baseUrl}${path}`;
    const result = await inspectRoute(requestedUrl, expected);
    printDiagnostics(name, expected, requestedUrl, health, result);
    const finalUrlMatches = result.page.finalUrl === requestedUrl;
    const passed = result.browserExitStatus === 0 && result.navigationStatus === 200 && result.matched && finalUrlMatches && !result.failure;
    if (!passed) throw smokeFailure(name, expected, requestedUrl, health, result);
    console.log(`Browser smoke passed: ${name} (HTTP ${result.navigationStatus}, final URL ${result.page.finalUrl}, exit ${result.browserExitStatus}).`);
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
