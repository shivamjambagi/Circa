import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("production headers cover the required browser boundaries", () => {
  const netlify = read("netlify.toml"); const next = read("next.config.ts");
  for (const pattern of [/Content-Security-Policy/, /Strict-Transport-Security/, /X-Content-Type-Options/, /frame-ancestors 'none'/, /Referrer-Policy/, /Permissions-Policy/]) assert.match(netlify, pattern);
  assert.match(next, /firebaseappcheck\.googleapis\.com/); assert.match(next, /frame-ancestors 'none'/);
});

test("cloud failure, offline and application boundaries are explicit", () => {
  assert.match(read("app/firebase/FirebaseProvider.tsx"), /12_000/); assert.match(read("app/firebase/FirebaseProvider.tsx"), /Circa cloud is unavailable/);
  assert.match(read("app/OfflineNotice.tsx"), /navigator\.onLine/); assert.ok(fs.existsSync("app/not-found.tsx")); assert.ok(fs.existsSync("app/error.tsx")); assert.ok(fs.existsSync("app/global-error.tsx"));
});

test("sign-out clears Firestore IndexedDB without touching Personal LocalStorage", () => {
  const client = read("app/firebase/client.ts"); const auth = read("app/firebase/auth.ts");
  assert.match(client, /clearIndexedDbPersistence/); assert.match(client, /terminate/); assert.match(client, /deleteApp/); assert.match(auth, /clearFirebaseCloudCache/);
  assert.doesNotMatch(auth, /localStorage\.clear|circa_workspace/);
});

test("CI scans secrets, dependencies and the client artifact", () => {
  const ci = read(".github/workflows/ci.yml"); const pkg = JSON.parse(read("package.json"));
  assert.match(ci, /gitleaks/); assert.match(ci, /audit:production/); assert.match(ci, /scan:artifact/); assert.ok(pkg.scripts["audit:production"]); assert.ok(pkg.scripts["scan:artifact"]);
});

test("monitoring and controlled operations are privacy bounded", () => {
  const server = read("app/server/firebaseAdmin.ts"); const operations = read("docs/OPERATIONS_RUNBOOK.md");
  assert.match(server, /circa_server_failure/); assert.doesNotMatch(server, /console\.error\([^\n]*request\.body/);
  assert.match(operations, /Never log request bodies/); assert.match(operations, /35-day expiry/); assert.ok(fs.existsSync(".github/workflows/release-firestore.yml"));
});
