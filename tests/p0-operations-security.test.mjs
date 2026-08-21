import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

function extractCsp(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} must define a Content-Security-Policy header.`);
  return match[1];
}

function cspDirectives(policy) {
  return new Map(policy.split(";").map((directive) => directive.trim()).filter(Boolean).map((directive) => {
    const [name, ...values] = directive.split(/\s+/);
    return [name, values];
  }));
}

test("production headers cover the required browser boundaries", () => {
  const netlify = read("netlify.toml"); const next = read("next.config.ts");
  for (const pattern of [/Content-Security-Policy/, /Strict-Transport-Security/, /X-Content-Type-Options/, /frame-ancestors 'none'/, /Referrer-Policy/, /Permissions-Policy/]) assert.match(netlify, pattern);
  assert.match(next, /firebaseappcheck\.googleapis\.com/); assert.match(next, /frame-ancestors 'none'/);
});

test("Firebase Google sign-in CSP is exact and consistent across both header sources", () => {
  const netlifyCsp = extractCsp(read("netlify.toml"), /Content-Security-Policy\s*=\s*"([^"]+)"/, "Netlify");
  const nextCsp = extractCsp(read("next.config.ts"), /key:\s*"Content-Security-Policy",\s*value:\s*"([^"]+)"/, "Next.js");
  assert.equal(nextCsp, netlifyCsp, "Netlify and the production worker must enforce the same CSP.");

  const directives = cspDirectives(netlifyCsp);
  assert.ok(directives.get("script-src")?.includes("https://apis.google.com"), "Firebase Auth must be able to load its GAPI script.");
  assert.ok(directives.get("frame-src")?.includes("https://circa-4bea4.firebaseapp.com"), "Firebase Auth must be able to load Circa's hidden auth iframe.");
  assert.ok(directives.get("connect-src")?.includes("https://*.googleapis.com"), "Firebase API connections must remain scoped to Google APIs.");
  assert.ok(directives.get("connect-src")?.includes("https://securetoken.googleapis.com"));
  assert.ok(directives.get("connect-src")?.includes("https://identitytoolkit.googleapis.com"));
  assert.ok(directives.get("connect-src")?.includes("https://firebaseappcheck.googleapis.com"));
  assert.ok(directives.get("frame-ancestors")?.includes("'none'"));
  assert.ok(directives.get("object-src")?.includes("'none'"));
  assert.ok(!netlifyCsp.includes("'unsafe-eval'"));
  for (const values of directives.values()) {
    assert.ok(!values.includes("*"));
    assert.ok(!values.includes("https://*"));
  }
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
  assert.match(ci, /test:netlify-package/); assert.ok(pkg.scripts["test:netlify-package"]);
});

test("monitoring and controlled operations are privacy bounded", () => {
  const server = read("app/server/firebaseAdmin.ts"); const operations = read("docs/OPERATIONS_RUNBOOK.md");
  assert.match(server, /circa_server_failure/); assert.doesNotMatch(server, /console\.error\([^\n]*request\.body/);
  assert.match(server, /circa_firebase_admin_diagnostic/); assert.match(server, /verifyIdToken\(match\[1\], true\)/);
  assert.doesNotMatch(server, /firebaseAdminDiagnostic[^\n]*(?:authorization|match\[1\]|request\.headers)/i);
  assert.match(read("netlify.toml"), /external_node_modules\s*=\s*\["firebase-admin"\]/);
  assert.match(operations, /Never log request bodies/); assert.match(operations, /35-day expiry/); assert.ok(fs.existsSync(".github/workflows/release-firestore.yml"));
});
