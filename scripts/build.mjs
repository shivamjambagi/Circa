import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

function currentCommit() {
  const fromHost = process.env.COMMIT_REF || process.env.GITHUB_SHA;
  if (fromHost && /^[a-f0-9]{7,40}$/i.test(fromHost)) return fromHost;
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const commit = result.stdout.trim();
  if (result.status !== 0 || !/^[a-f0-9]{7,40}$/i.test(commit)) throw new Error("A Git commit is required to build a release artifact.");
  return commit;
}

function workingTreeIsDirty() {
  const result = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Git status is required to build release metadata.");
  return Boolean(result.stdout.trim());
}

const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: ".wrangler/logs", MINIFLARE_REGISTRY_PATH: ".wrangler/registry" },
});
const timeout = setTimeout(() => child.kill(), Number(process.env.CIRCA_BUILD_TIMEOUT_MS || 240_000));
const exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1)); });
clearTimeout(timeout);
if (exitCode !== 0) process.exit(exitCode);

const commit = currentCommit();
const metadata = { product: "Circa", hosting: "netlify", commit, dirty: workingTreeIsDirty(), builtAt: new Date().toISOString() };
await mkdir("dist/client", { recursive: true });
await writeFile("dist/client/release.json", `${JSON.stringify(metadata, null, 2)}\n`);
const validation = spawnSync(process.execPath, ["scripts/validate-artifact.mjs"], { stdio: "inherit" });
process.exit(validation.status ?? 1);
