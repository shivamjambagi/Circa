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

function browserBinary() {
  const candidates = [process.env.CIRCA_E2E_BROWSER, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "google-chrome", "chromium", "chromium-browser"];
  for (const candidate of candidates.filter(Boolean)) {
    if (candidate.includes("\\")) { if (existsSync(candidate)) return candidate; }
    else { const result = spawnSync(process.platform === "win32" ? "where" : "which", [candidate], { encoding: "utf8" }); if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0]; }
  }
  throw new Error("Chrome or Chromium is required for the critical browser smoke suite.");
}

const workerUrl = pathToFileURL(`${process.cwd()}/dist/server/index.js`); workerUrl.searchParams.set("critical-e2e", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
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
  } catch { outgoing.writeHead(500).end("Critical smoke server failed."); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port; const profile = await mkdtemp(join(tmpdir(), "circa-browser-smoke-")); const browser = browserBinary();
const allRoutes = [
  ["/?workspace=1", /Your projects|What are you mapping/i, "Personal workspace"],
  ["/auth", /Welcome to|Continue securely/i, "authentication"],
  ["/community/new", /Create a useful/i, "Community"],
  ["/network/new", /Bring in/i, "Network"],
  ["/", /Describe the people|Try Compose/i, "Compose entry"],
];
const routes = process.argv.includes("--personal-only") ? [allRoutes[0], allRoutes[4]] : allRoutes;
async function dumpDom(url) {
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-breakpad", "--disable-crash-reporter", "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync", "--no-first-run", `--user-data-dir=${profile}`, "--virtual-time-budget=5000", "--dump-dom", url];
  const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 30_000);
  const status = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1)); });
  clearTimeout(timer); return { status, stdout, stderr };
}
try {
  for (const [path, expected, name] of routes) {
    const result = await dumpDom(`http://127.0.0.1:${port}${path}`);
    if (result.status !== 0 || !expected.test(result.stdout)) throw new Error(`${name} browser smoke failed (exit ${result.status}). DOM: ${result.stdout.replace(/\s+/g, " ").slice(0, 600)}${result.stderr ? ` Browser: ${result.stderr.slice(-300)}` : ""}`);
    console.log(`Browser smoke passed: ${name}.`);
  }
} finally { await new Promise((resolve) => server.close(resolve)); await rm(profile, { recursive: true, force: true }); }
