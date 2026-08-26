import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const community = fs.readFileSync("app/community/[projectId]/CommunityClient.tsx", "utf8");
const queryEngine = fs.readFileSync("app/shared/communityQueryEngine.ts", "utf8");

test("Community Home isolates the next collection from directory contacts", () => {
  assert.match(community, /const collectionRecords = records\.filter\(\(record\) => record\.itemType === "bin" \|\| Boolean\(record\.schedule\)\);/);
  assert.match(community, /queryCommunity\("What is the next collection\?", collectionRecords,/);
});

test("shared bin query ignores directory services such as Bin cleaning", () => {
  assert.match(queryEngine, /record\.itemType === "bin" \|\| Boolean\(record\.schedule\)/);
  assert.doesNotMatch(queryEngine, /record\.schedule \|\| \/bin\|waste\|recycl\|rubbish\/i/);
});

test("collection card still keeps its clean empty state", () => {
  assert.match(community, /"No upcoming collections"/);
  assert.match(community, /No future collection dates have been published yet/);
});
