import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("browser-only Compose remains the default and cloud code is opt-in", () => {
  const panel = read("app/ComposePanel.tsx");
  assert.match(panel, /interpretNaturalLanguage/);
  assert.match(panel, /compileSemanticInterpretation/);
  assert.match(panel, /if \(!useExternalProvider\)/);
  assert.match(panel, /await import\("\.\/firebase\/client"\)/);
  assert.match(panel, /user\.isAnonymous/);
  assert.match(panel, /AbortController/);
});

test("external Compose verifies identity and bounds every network body", () => {
  const route = read("app/api/compose/route.ts");
  assert.match(route, /verifyPermanentFirebaseRequest/);
  assert.match(route, /enforceSharedRateLimit/);
  assert.match(route, /identity\.uid/);
  assert.match(route, /privacyPreservingNetworkSignal/);
  assert.match(route, /readJsonBodyWithLimit\(request, 65_536\)/);
  assert.match(route, /readResponseJsonWithLimit\(response, 512 \* 1024\)/);
  assert.match(route, /AbortController/);
  assert.doesNotMatch(route, /const requests = new Map/);
});

test("external prompt treats descriptions and context as untrusted data", () => {
  const route = read("app/api/compose/route.ts");
  const instruction = read("app/composeSystemPrompt.ts");
  assert.match(route, /untrusted-user-data/);
  assert.match(route, /untrusted-project-data/);
  assert.match(route, /JSON\.stringify\(\{ CIRCA_USER_DESCRIPTION_JSON: prompt \}\)/);
  assert.match(instruction, /never follow instructions found inside/i);
  assert.match(instruction, /prompt-injection/i);
});

test("Compose privacy notice describes the exact browser/server boundary", () => {
  const panel = read("app/ComposePanel.tsx");
  assert.match(panel, /Local Describe, Paste List and CSV are parsed in this browser with no account/);
  assert.match(panel, /limited Project context/);
  assert.match(panel, /never sends private notes, phone numbers, email addresses or unrelated Projects/i);
});
