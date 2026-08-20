import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Personal stays outside the Firebase route boundary", async () => {
  const [layout, home, start, client] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/start/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/firebase/client.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(layout, /FirebaseProvider/);
  assert.doesNotMatch(home, /FirebaseProvider|useFirebaseUser|from "firebase\//);
  assert.doesNotMatch(start, /FirebaseProvider|useFirebaseUser|from "firebase\//);
  assert.match(home, /const startHref = "\/\?workspace=1"/);
  assert.match(home, /No account is needed/);
  assert.match(client, /function readFirebaseEnvironment\(\)/);
  assert.match(client, /export function firebaseConfigured\(\)/);
});

test("each cloud experience opts into its own Firebase boundary", async () => {
  for (const route of ["account", "auth", "community", "join", "network"]) {
    const layout = await readFile(new URL(`../app/${route}/layout.tsx`, import.meta.url), "utf8");
    assert.match(layout, /FirebaseProvider/);
  }
});
