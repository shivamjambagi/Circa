import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Add Employee uses bounded two-column controls and stacks on phones", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.employee-popover \.employee-grid \{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css, /\.employee-popover > label, \.employee-popover \.employee-grid > label \{ min-width:0; \}/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.employee-popover \.employee-grid \{ grid-template-columns:minmax\(0,1fr\); \}/);
  assert.match(css, /\.add-popover input, \.add-popover select \{ width:100%; max-width:100%; min-width:0;/);
});

test("Group resize path uses minimum-only dimensions", async () => {
  const source = await readFile(new URL("../app/SketchCanvas.tsx", import.meta.url), "utf8");
  assert.match(source, /nextSize\(MIN_GROUP_WIDTH, MIN_GROUP_HEIGHT\)/);
  assert.doesNotMatch(source, /nextSize\(220, 1400, 160, 900\)/);
});
