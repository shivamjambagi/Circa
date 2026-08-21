import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(path, "utf8");

test("jwks-rsa uses the scoped dual-module jose compatibility release", () => {
  const packageJson = JSON.parse(read("package.json"));
  const jwksPackage = require("jwks-rsa/package.json");
  const requireFromJwks = createRequire(require.resolve("jwks-rsa/package.json"));
  const josePackage = requireFromJwks("jose/package.json");

  assert.equal(packageJson.overrides?.["jwks-rsa"]?.jose, "4.15.9");
  assert.match(jwksPackage.version, /^4\./);
  assert.equal(josePackage.version, "4.15.9");
});

test("Firebase Admin Auth and App Check load with strict CommonJS ESM interop disabled", () => {
  const probe = spawnSync(process.execPath, [
    "--no-experimental-require-module",
    "-e",
    [
      "require('jwks-rsa')",
      "require('firebase-admin/app')",
      "require('firebase-admin/auth')",
      "require('firebase-admin/app-check')",
      "require('firebase-admin/firestore')",
      "process.stdout.write('firebase-admin-runtime-ok')",
    ].join(";"),
  ], { cwd: process.cwd(), encoding: "utf8" });

  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  assert.equal(probe.stdout, "firebase-admin-runtime-ok");
});

test("Firebase Admin remains lazy and absent from the production entry", () => {
  const server = read("app/server/firebaseAdmin.ts");
  const adapter = read("netlify/functions/circa-app.ts");
  const build = read("scripts/build.mjs");
  const runtimeImports = server.split(/\r?\n/).filter((line) => line.includes('import(/* @vite-ignore */ "firebase-admin/'));

  assert.equal(runtimeImports.length, 4);
  for (const line of runtimeImports) assert.match(line, /(?:await |return )import\(/);
  assert.doesNotMatch(adapter, /firebase-admin/);
  assert.doesNotMatch(build, /import ["']firebase-admin\//);
  assert.match(build, /import artifact from "\.\.\/\.\.\/server\/index\.js"/);
});
