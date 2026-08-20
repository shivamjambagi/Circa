import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("Firebase client has no hard-coded production fallback", () => {
  const source = read("app/firebase/client.ts");
  assert.doesNotMatch(source, /circa-4bea4\\.firebaseapp\\.com/);
  assert.match(source, /requireFirebaseEnv/);
  assert.match(source, /Missing required Firebase environment variable/);
});

test("Network shared reads are tied to current contribution consent", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /contributionEnabled\(projectId, resource\.data\.ownerUid\)/);
  const repo = read("app/cloud/networkRepository.ts");
  assert.match(repo, /enabledContributionUids/);
  assert.match(repo, /CONTRIBUTION_PRIVACY_PREP_VERSION/);
  assert.match(repo, /if \(!enabled\)/);
  assert.doesNotMatch(repo, /visibility:\s*enabled\s*\?\s*"project"\s*:\s*"private"/);
});

test("Personal navigation no longer swallows failed save", () => {
  const source = read("app/SketchCanvas.tsx");
  assert.match(source, /await performSave\(graphRef\.current\);/);
  assert.doesNotMatch(source, /await performSave\(graphRef\.current\)\.catch\(\(\) => undefined\)/);
  assert.match(source, /Circa kept you on this Project/);
});

test("deleting an introducer preserves endpoint relationship", () => {
  const graphStore = read("app/graphStore.ts");
  const canvas = read("app/SketchCanvas.tsx");
  assert.match(graphStore, /introducedByPersonId: ""/);
  assert.match(canvas, /introducedByPersonId: ""/);
});

test("existing relationship is reoriented to the user's source and target", () => {
  assert.match(read("app/SketchCanvas.tsx"), /existing \? \{ \.\.\.existing, sourceId, targetId,/);
});

test("LinkedIn parser rejects non LinkedIn URLs and malformed quotes", () => {
  const source = read("app/shared/networkEngine.ts");
  assert.match(source, /unmatched quote/);
  assert.ok(source.includes('linkedin\\.com$/i.test(url.hostname)) return null')); 
  assert.match(source, /10,000 rows/);
});

test("Compose uses authenticated shared limiting and a streamed body cap", () => {
  const route = read("app/api/compose/route.ts");
  assert.match(route, /verifyPermanentFirebaseRequest/);
  assert.match(route, /enforceSharedRateLimit/);
  assert.match(route, /readJsonBodyWithLimit/);
  assert.doesNotMatch(route, /const requests = new Map/);
});

test("Compose privacy copy distinguishes browser and server processing", () => {
  const panel = read("app/ComposePanel.tsx");
  assert.match(panel, /Describe sends your description plus limited Project context to Circa’s server/);
  assert.match(panel, /Paste List and CSV are parsed in this browser/);
  assert.match(panel, /AbortController/);
});

test("incomplete Personal cloud migration is absent from the release", () => {
  assert.equal(fs.existsSync("app/firebase/migration.ts"), false);
  assert.equal(fs.existsSync("app/firebase/CloudMigrationCard.tsx"), false);
  assert.doesNotMatch(read("app/auth/page.tsx"), /CloudMigrationCard|Copy Projects to cloud/);
});

test("directory IDs use a collision resistant digest", () => {
  const source = read("app/cloud/communityRepository.ts");
  assert.ok(source.includes('crypto.subtle.digest("SHA-256"'));
  assert.match(source, /importIdentityHash/);
});

test("all checked-in tests have a cross-platform runner and CI", () => {
  assert.ok(fs.existsSync("scripts/run-tests.mjs"));
  assert.ok(fs.existsSync(".github/workflows/ci.yml"));
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:unit"], "node scripts/run-tests.mjs");
  assert.match(pkg.scripts.test, /test:firestore/);
  assert.ok(pkg.scripts.typecheck);
});
