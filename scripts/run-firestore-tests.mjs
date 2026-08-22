import { spawn, spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  if (!port) throw new Error("Could not allocate a Firestore emulator test port.");
  return port;
}

function stopLingeringWindowsListener(port) {
  if (process.platform !== "win32") return;
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  if (result.status !== 0) return;
  for (const line of result.stdout.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5 || fields[3] !== "LISTENING" || !fields[1].endsWith(`:${port}`)) continue;
    const listenerPid = Number(fields[4]);
    if (Number.isInteger(listenerPid) && listenerPid > 0 && listenerPid !== process.pid) {
      try { process.kill(listenerPid); } catch { /* The emulator may have completed its delayed shutdown. */ }
    }
  }
}

const source = JSON.parse(await readFile("firebase.json", "utf8"));
const [firestorePort, websocketPort] = await Promise.all([freePort(), freePort()]);
source.firestore.rules = resolve(source.firestore.rules);
source.firestore.indexes = resolve(source.firestore.indexes);
source.emulators = {
  ...source.emulators,
  firestore: { ...source.emulators?.firestore, host: "127.0.0.1", port: firestorePort, websocketPort },
};

const temporaryConfig = resolve(`.circa-firestore-test-${process.pid}.json`);
await writeFile(temporaryConfig, `${JSON.stringify(source, null, 2)}\n`);
const child = spawn(process.execPath, [
  "node_modules/firebase-tools/lib/bin/firebase.js",
  "emulators:exec",
  "--config", temporaryConfig,
  "--project", "circa-rules-test",
  "--only", "firestore",
  "node --experimental-strip-types --test --test-concurrency=1 tests/firestore-rules.test.ts tests/owned-project-deletion.test.ts",
], { stdio: "inherit" });
const timer = setTimeout(() => child.kill(), 120_000);
let exitCode = 1;
try {
  exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
} finally {
  clearTimeout(timer);
  await rm(temporaryConfig, { force: true });
  stopLingeringWindowsListener(firestorePort);
  stopLingeringWindowsListener(websocketPort);
}
process.exit(exitCode);
