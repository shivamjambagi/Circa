import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("failed Personal saves block navigation and expose all recovery choices", async () => {
  const source = await read("app/SketchCanvas.tsx");
  assert.match(source, /await performSave\(graphRef\.current\);/);
  assert.doesNotMatch(source, /await performSave\(graphRef\.current\)\.catch/);
  assert.match(source, /navigateAfterSave/);
  for (const copy of ["Stay here", "Export recovery backup", "Retry and"]) assert.match(source, new RegExp(copy));
  assert.match(source, /mergeProjectGraph\(workspace, project\.id, graphRef\.current\)/);
});

test("backup imports cap file size before file.text and recovery is visible", async () => {
  const graphStore = await read("app/graphStore.ts");
  const hub = await read("app/ProjectHub.tsx");
  assert.match(graphStore, /validateWorkspaceBackupSize\(file\.size\);\s*return parseWorkspaceBackup\(await file\.text\(\)\)/s);
  assert.match(hub, /Keep a portable backup/);
  assert.match(hub, /Review recovery copy/);
  assert.match(graphStore, /WORKSPACE_CORRUPT_COPY_KEY/);
});

test("stale tab copy makes discard and overwrite choices explicit", async () => {
  const source = await read("app/SketchCanvas.tsx");
  assert.match(source, /Discard this tab and load newer/);
  assert.match(source, /Overwrite newer with this tab/);
});
