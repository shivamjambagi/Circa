import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function runNodeProbe(arguments_, label) {
  const result = spawnSync(process.execPath, arguments_, { cwd: process.cwd(), encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed.\n${result.stderr || result.stdout}`);
}

const required = ["dist/server/index.js", "dist/netlify/functions/circa-app.mjs", "dist/client", "dist/.openai/hosting.json", "dist/client/release.json"];
for (const path of required) await access(path);
JSON.parse(await readFile("dist/.openai/hosting.json", "utf8"));
const release = JSON.parse(await readFile("dist/client/release.json", "utf8"));
if (!/^[a-f0-9]{7,40}$/i.test(release.commit)) throw new Error("Release metadata must contain a Git commit SHA.");
if (release.hosting !== "netlify") throw new Error("Release metadata must identify Netlify as the canonical host.");
if (typeof release.dirty !== "boolean") throw new Error("Release metadata must record the working-tree state.");
if (process.env.CI && release.dirty) throw new Error("CI must never publish an artifact built from a dirty working tree.");

const workerUrl = pathToFileURL(`${process.cwd()}/dist/server/index.js`);
workerUrl.searchParams.set("artifact-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") throw new Error("The server artifact must export default.fetch(request, env, context).");

const functionUrl = pathToFileURL(`${process.cwd()}/dist/netlify/functions/circa-app.mjs`);
functionUrl.searchParams.set("artifact-validation", `${process.pid}-${Date.now()}`);
const netlifyFunction = await import(functionUrl.href);
if (typeof netlifyFunction.default !== "function") throw new Error("The generated Netlify artifact must export a default request handler.");
const response = await netlifyFunction.default(new Request("http://circa.test/?workspace=1", { headers: { accept: "text/html" } }));
if (!(response instanceof Response) || response.status !== 200) throw new Error("The generated Netlify request handler must serve the production worker.");

runNodeProbe([
  "--no-experimental-require-module",
  "-e",
  [
    "const { createRequire } = require('node:module')",
    "const requireFromFunction = createRequire(process.argv[1])",
    "for (const id of ['firebase-admin/app', 'firebase-admin/auth', 'firebase-admin/app-check', 'firebase-admin/firestore']) requireFromFunction(id)",
  ].join(";"),
  functionUrl.href,
], "Firebase Admin runtime resolution from the Netlify artifact");

const blockerSource = encodeURIComponent([
  "export async function resolve(specifier, context, nextResolve) {",
  "  if (specifier === 'firebase-admin' || specifier.startsWith('firebase-admin/')) throw new Error('Firebase Admin intentionally unavailable during Personal isolation probe.');",
  "  return nextResolve(specifier, context);",
  "}",
].join("\n"));
const isolationSource = [
  `const functionUrl = new URL(${JSON.stringify(functionUrl.href)})`,
  "functionUrl.searchParams.set('firebase-isolation', `${process.pid}-${Date.now()}`)",
  "const handler = (await import(functionUrl.href)).default",
  "const response = await handler(new Request('http://circa.test/?workspace=1', { headers: { accept: 'text/html' } }))",
  "const html = await response.text()",
  "if (response.status !== 200 || !/Circa|Your projects|What are you mapping/i.test(html)) throw new Error(`Personal isolation probe received HTTP ${response.status}.`)",
].join(";");
runNodeProbe([
  "--experimental-loader",
  `data:text/javascript,${blockerSource}`,
  "--input-type=module",
  "-e",
  isolationSource,
], "Personal route isolation from Firebase Admin");

console.log(`Validated Netlify artifact for commit ${release.commit}${release.dirty ? " (dirty local tree)" : ""}.`);
