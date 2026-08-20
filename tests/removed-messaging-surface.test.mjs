import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenName = /whatsapp/i;

const removedRuntimePaths = [
  "app/cloud/whatsappClient.ts",
  "netlify/functions/whatsapp-disconnect.ts",
  "netlify/functions/whatsapp-integration-status.ts",
  "netlify/functions/whatsapp-link-start.ts",
  "netlify/functions/whatsapp-preferences.ts",
  "netlify/functions/whatsapp-reminders.ts",
  "netlify/functions/whatsapp-status.ts",
  "netlify/functions/whatsapp-webhook.ts",
  "netlify/functions/_shared/http.ts",
  "server/messaging/WhatsAppAdapter.ts",
  "server/messaging/CommunityMessagingAdapter.ts",
  "server/firebaseAdmin.ts",
  "server/rateLimit.ts",
  "server/whatsappSecurity.ts",
  "tests/whatsapp-security.test.ts",
];

const activeFiles = [
  ".env.example",
  "CLOUD_ARCHITECTURE.md",
  "FIREBASE_SETUP.md",
  "MANUAL_EXTERNAL_HARDENING.md",
  "README.md",
  "firestore.indexes.json",
  "firestore.rules",
  "netlify.toml",
  "package.json",
];

function collectFiles(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? collectFiles(relativePath) : [relativePath];
  });
}

test("removed messaging runtime and public surface stay absent", () => {
  for (const relativePath of removedRuntimePaths) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must stay removed`);
  }

  const shippedFiles = [
    ...activeFiles,
    ...collectFiles("app"),
    ...collectFiles("netlify"),
    ...collectFiles("public"),
    ...collectFiles("server"),
  ];

  const violations = shippedFiles.filter((relativePath) => {
    if (forbiddenName.test(relativePath)) return true;
    const source = readFileSync(path.join(root, relativePath), "utf8");
    return forbiddenName.test(source);
  });

  assert.deepEqual(violations, [], `removed messaging references found in shipped surfaces: ${violations.join(", ")}`);

  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies?.["firebase-admin"], "14.3.0", "Firebase Admin is retained only for authenticated server boundaries");
  assert.match(readFileSync(path.join(root, "app/server/firebaseAdmin.ts"), "utf8"), /verifyPermanentFirebaseRequest/);
  assert.equal(packageJson.dependencies?.zod, undefined, "feature-only schema dependency must stay removed");
});
