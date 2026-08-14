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

test("homepage preserves Circa and presents exactly three product experiences", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, />Map your people</);
  assert.match(source, />Bring in your network</);
  assert.match(source, />Circa Communities</);
  assert.match(source, /className="experience-card map"/);
  assert.match(source, /className="experience-card network"/);
  assert.match(source, /className="experience-card community"/);
  assert.doesNotMatch(source, /className="experience-card join"/);
  assert.match(source, /Already have a Community or Network invite/);
  assert.doesNotMatch(source, />Connect LinkedIn</);
});

test("cloud screens preserve return paths and invitation persistence", async () => {
  const createCommunity = await readFile(new URL("../app/community/new/page.tsx", import.meta.url), "utf8");
  const createNetwork = await readFile(new URL("../app/network/new/page.tsx", import.meta.url), "utf8");
  const community = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(createCommunity, /returnTo=\/community\/new/);
  assert.match(createNetwork, /returnTo=\/network\/new/);
  assert.match(community, /watchInvitations/);
  assert.match(community, /Contacts/);
  assert.match(community, /Manage/);
  assert.match(community, /currentItem/);
});

test("invitation UI requires explicit consent and a persistent account", async () => {
  const source = await readFile(new URL("../app/join/JoinClient.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /beginAnonymousCommunitySession/);
  assert.match(source, /!user \|\| user\.isAnonymous/);
  assert.match(source, /if \(!invite \|\| !consent/);
  assert.match(source, /disabled=\{!consent/);
});
