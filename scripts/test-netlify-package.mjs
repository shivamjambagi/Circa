import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipFunctions } from "@netlify/zip-it-and-ship-it";

const repositoryRoot = process.cwd();
const generatedFunction = path.join(repositoryRoot, "dist", "netlify", "functions", "circa-app.mjs");
const netlifyConfiguration = await readFile(path.join(repositoryRoot, "netlify.toml"), "utf8");
const functionsBlock = netlifyConfiguration.match(/\[functions\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
const nodeBundler = functionsBlock.match(/node_bundler\s*=\s*"([^"]+)"/)?.[1];
const externalNodeModules = [...functionsBlock.matchAll(/external_node_modules\s*=\s*\[([^\]]*)\]/g)]
  .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((module) => module[1]));

assert.equal(nodeBundler, "esbuild", "Netlify must use the configured esbuild function packager.");
assert.deepEqual(externalNodeModules, ["firebase-admin"], "Firebase Admin must be preserved as one intact external Node package.");
const generatedFunctionSource = await readFile(generatedFunction, "utf8");
for (const specifier of ["firebase-admin/app", "firebase-admin/auth", "firebase-admin/firestore", "firebase-admin/app-check"]) {
  assert.match(generatedFunctionSource, new RegExp(`import ["']${specifier}["']`), `${specifier} must be a static dependency of the final Netlify entry point.`);
}

const outputsDirectory = path.join(repositoryRoot, "outputs");
await mkdir(outputsDirectory, { recursive: true });
const temporaryRoot = await mkdtemp(path.join(outputsDirectory, "netlify-runtime-package-"));
const packageDirectory = path.join(temporaryRoot, "functions");

try {
  const packaged = await zipFunctions(path.relative(repositoryRoot, path.dirname(generatedFunction)), packageDirectory, {
    archiveFormat: "none",
    config: {
      "*": {
        nodeBundler,
        externalNodeModules,
        nodeVersion: "22",
      },
    },
  });
  assert.equal(packaged.length, 1, "Netlify must produce exactly one Circa function package.");
  assert.equal(packaged[0].name, "circa-app");
  assert.ok(["esbuild", "nft"].includes(packaged[0].bundler), `Unexpected Netlify bundler: ${packaged[0].bundler}`);
  assert.ok(packaged[0].path, "The Netlify packager must return an executable artifact path.");

  const artifactRoot = path.resolve(packaged[0].path);
  const firebasePackage = JSON.parse(await readFile(path.join(artifactRoot, "node_modules", "firebase-admin", "package.json"), "utf8"));
  assert.equal(firebasePackage.name, "firebase-admin");
  assert.equal(firebasePackage.version, "14.3.0");

  const probePath = path.join(artifactRoot, "firebase-admin-runtime-probe.mjs");
  await writeFile(probePath, `
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactRoot = path.dirname(fileURLToPath(import.meta.url));
const expectedPackageRoot = path.join(artifactRoot, "node_modules", "firebase-admin") + path.sep;
const modules = [
  ["firebase-admin/app", ["cert", "getApps", "initializeApp"]],
  ["firebase-admin/auth", ["getAuth"]],
  ["firebase-admin/firestore", ["getFirestore"]],
  ["firebase-admin/app-check", ["getAppCheck"]],
];

for (const [specifier, expectedExports] of modules) {
  const resolved = fileURLToPath(import.meta.resolve(specifier));
  assert.ok(resolved.startsWith(expectedPackageRoot), specifier + " resolved outside the packaged function: " + resolved);
  const loaded = await import(specifier);
  for (const name of expectedExports) assert.equal(typeof loaded[name], "function", specifier + " is missing " + name);
  console.log(specifier + " -> " + path.relative(artifactRoot, resolved));
}
`, "utf8");

  const probe = spawnSync(process.execPath, [probePath], {
    cwd: artifactRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "" },
  });
  if (probe.error) throw probe.error;
  assert.equal(probe.status, 0, `Packaged Firebase Admin runtime probe failed:\n${probe.stdout}\n${probe.stderr}`);
  assert.doesNotMatch(`${probe.stdout}\n${probe.stderr}`, /Bearer\s|PRIVATE KEY|FIREBASE_SERVICE_ACCOUNT_JSON/i);
  console.log(probe.stdout.trim());
  console.log(`Verified Firebase Admin ${firebasePackage.version} in the isolated Netlify ${packaged[0].bundler} function package.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
