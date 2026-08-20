import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const required = ["dist/server/index.js", "dist/client", "dist/.openai/hosting.json", "dist/client/release.json"];
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
console.log(`Validated Netlify artifact for commit ${release.commit}${release.dirty ? " (dirty local tree)" : ""}.`);
