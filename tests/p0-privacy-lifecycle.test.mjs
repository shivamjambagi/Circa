import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("public privacy information is versioned and discoverable", () => {
  const privacy = read("app/privacy/page.tsx"); const landing = read("app/page.tsx");
  assert.match(privacy, /Version 0\.9/); assert.match(privacy, /Information about other people/); assert.match(privacy, /Your choices and rights/); assert.match(privacy, /aged 18 or over/);
  assert.match(landing, /href="\/privacy"/); assert.match(landing, /href="\/terms"/); assert.match(landing, /href="\/help"/);
});

test("non-essential Analytics is absent pending a storage-access decision", () => {
  const client = read("app/firebase/client.ts"); const environment = read(".env.example");
  assert.doesNotMatch(client, /firebase\/analytics|getAnalytics|ANALYTICS_ENABLED/);
  assert.doesNotMatch(environment, /ANALYTICS_ENABLED|MEASUREMENT_ID/);
});

test("cloud lifecycle API verifies identity, recent auth and ownership", () => {
  const route = read("app/api/account-data/route.ts");
  assert.match(route, /verifyPermanentFirebaseRequest/); assert.match(route, /requireRecentAuthentication/); assert.match(route, /transfer-ownership/); assert.match(route, /delete-owned-project/); assert.match(route, /recursiveDelete/); assert.match(route, /ownedProjects/); assert.match(route, /content-disposition/);
  assert.match(route, /enabled: false/); assert.match(route, /deleteUser/); assert.match(route, /EXPORT_TOO_LARGE/);
});

test("users can reach export, leave, contribution withdrawal and deletion", () => {
  const account = read("app/account/page.tsx"); const network = read("app/network/[projectId]/NetworkDashboard.tsx"); const lifecycle = read("app/cloud/accountLifecycle.ts");
  assert.match(account, /Download cloud export/); assert.match(account, /Delete cloud account/); assert.match(account, /Leave/); assert.match(account, /Delete owned space/);
  assert.match(network, /Stop contributing/); assert.match(network, /Transfer ownership/); assert.match(lifecycle, /x-firebase-appcheck/);
});

test("privacy inventory and external legal gates are explicit", () => {
  const map = read("docs/PRIVACY_DATA_MAP.md"); const gates = read("docs/PRIVACY_RELEASE_GATES.md"); const prompt = read("app/composeSystemPrompt.ts");
  assert.match(map, /serverRateLimits/); assert.match(map, /networkPrivateFields/); assert.match(map, /No-sensitive-inference invariant/);
  assert.match(gates, /Requires external action/); assert.match(gates, /DPIA/); assert.match(gates, /Children's Code/);
  assert.match(prompt, /Never infer or propose health/);
});
