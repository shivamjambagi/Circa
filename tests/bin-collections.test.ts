import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { binCollectionItem, binCollectionOccurrences, formatBinNames, groupBinCollectionsByMonth, nextBinCollection, parseBinCollectionImport, validateBinCollection } from "../app/community/binCollections.ts";
import type { CommunityItem } from "../app/cloud/types.ts";

const communitySource = readFileSync("app/community/[projectId]/CommunityClient.tsx", "utf8");
const panelSource = readFileSync("app/community/[projectId]/BinCollectionsPanel.tsx", "utf8");
const importerSource = readFileSync("app/community/[projectId]/BinCollectionImportTool.tsx", "utf8");
const repositorySource = readFileSync("app/cloud/communityRepository.ts", "utf8");

test("structured collections accept canonical dates and multiple bins", () => {
  const collection = validateBinCollection({ date: "2026-09-08", bins: ["brown", "blue"] });
  assert.deepEqual(collection, { date: "2026-09-08", bins: ["blue", "brown"] });
  const item = binCollectionItem(collection);
  assert.equal(item.title, "Blue + Brown");
  assert.equal(item.date, "2026-09-08");
  assert.deepEqual(item.bins, ["blue", "brown"]);
  assert.deepEqual(item.schedule, { type: "once", firstCollectionDate: "2026-09-08" });
  assert.equal(formatBinNames(collection.bins), "Blue + Brown");
});

test("invalid dates, unsupported bins, empty bins and duplicate bins are rejected", () => {
  assert.throws(() => validateBinCollection({ date: "2026-02-30", bins: ["green"] }), /valid collection date/i);
  assert.throws(() => validateBinCollection({ date: "2026-09-08", bins: [] }), /at least one bin/i);
  assert.throws(() => validateBinCollection({ date: "2026-09-08", bins: ["black"] }), /unsupported bin/i);
  assert.throws(() => validateBinCollection({ date: "2026-09-08", bins: ["blue", "blue"] }), /duplicate bin/i);
});

test("JSON imports are deterministic, idempotent by date and reject duplicate dates", () => {
  const payload = { collections: [{ date: "2026-09-08", bins: ["blue", "brown"] }, { date: "2026-09-01", bins: ["green"] }] };
  const first = parseBinCollectionImport(payload);
  const second = parseBinCollectionImport(payload);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((collection) => collection.date), ["2026-09-01", "2026-09-08"]);
  assert.match(repositorySource, /"items", collection\.date/);
  assert.match(repositorySource, /batch\.set\(ref,[\s\S]*\{ merge: true \}\)/);
  assert.match(repositorySource, /!sourceDate && target\.exists\(\).*collection already exists for that date/i);
  assert.match(panelSource, /stored\.find\(\(collection\) => collection\.date === date/);
  assert.throws(() => parseBinCollectionImport([{ date: "2026-09-08", bins: ["blue"] }, { date: "2026-09-08", bins: ["brown"] }]), /duplicate date/i);
});

test("next collection selects the earliest date that is today or later", () => {
  const collections = [
    { id: "2026-09-01", date: "2026-09-01", bins: ["green"] as const },
    { id: "2026-09-08", date: "2026-09-08", bins: ["blue", "brown"] as const },
    { id: "2026-09-15", date: "2026-09-15", bins: ["grey"] as const },
  ].map((collection) => ({ ...collection, bins: [...collection.bins] }));
  assert.equal(nextBinCollection(collections, "2026-09-08")?.date, "2026-09-08");
  assert.equal(nextBinCollection(collections, "2026-09-09")?.date, "2026-09-15");
  assert.equal(nextBinCollection(collections, "2026-09-16"), null);
});

test("collections are grouped by calendar month in date order", () => {
  const groups = groupBinCollectionsByMonth([
    { id: "2026-10-06", date: "2026-10-06", bins: ["green"] },
    { id: "2026-09-15", date: "2026-09-15", bins: ["grey"] },
    { id: "2026-09-01", date: "2026-09-01", bins: ["green"] },
  ]);
  assert.deepEqual(groups.map((group) => group.label), ["September 2026", "October 2026"]);
  assert.deepEqual(groups[0].collections.map((collection) => collection.date), ["2026-09-01", "2026-09-15"]);
});

test("structured occurrences merge every bin collected on the same date", () => {
  const items = [
    { id: "blue", title: "Blue", bins: ["blue"], date: "2026-09-08", schedule: { type: "once", firstCollectionDate: "2026-09-08" } },
    { id: "brown", title: "Brown", bins: ["brown"], date: "2026-09-08", schedule: { type: "once", firstCollectionDate: "2026-09-08" } },
  ] as CommunityItem[];
  assert.deepEqual(binCollectionOccurrences(items, "2026-09-01"), [{ id: "2026-09-08", date: "2026-09-08", bins: ["blue", "brown"] }]);
});

test("existing canonical recurring schedules remain visible without migration", () => {
  const legacy = [{ id: "green", title: "Green bin", binType: "green", schedule: { type: "weekly", firstCollectionDate: "2026-09-01" } }] as CommunityItem[];
  const occurrences = binCollectionOccurrences(legacy, "2026-09-08", "2026-09-22");
  assert.deepEqual(occurrences.map((collection) => collection.date), ["2026-09-08", "2026-09-15", "2026-09-22"]);
});

test("members receive a read-only month-grouped schedule while Manage owns mutations", () => {
  assert.match(communitySource, /\["collections", "Bin Collections"\]/);
  assert.match(communitySource, /tab === "collections" && <BinCollectionsView/);
  assert.match(communitySource, /section === "bins" && <BinCollectionsManager/);
  assert.match(panelSource, /groupBinCollectionsByMonth/);
  const memberView = panelSource.slice(panelSource.indexOf("export function BinCollectionsView"), panelSource.indexOf("export function BinCollectionsManager"));
  assert.doesNotMatch(memberView, /saveBinCollection|deletePublishedItem|importBinCollections|Edit|Delete/);
  assert.match(panelSource, /Add collection/);
  assert.match(panelSource, />Edit</);
  assert.match(panelSource, />Delete</);
});

test("homepage renders Next Collection and a clean empty state", () => {
  assert.match(communitySource, /queryCommunity\("What is the next collection\?"/);
  assert.match(communitySource, /<small>Next collection<\/small>/);
  assert.match(communitySource, /formatBinCollectionDate\(nextCollection\.targetDate, timezone\)/);
  assert.match(communitySource, /"No upcoming collections"/);
  assert.match(communitySource, /"No future collection dates have been published yet\."/);
});

test("bin imports stay local until review and Reminders remain available without a duplicate bin type", () => {
  assert.match(importerSource, /JSON\.parse\(await file\.text\(\)\)/);
  assert.match(importerSource, /Confirm import of/);
  assert.match(importerSource, /file\.size > MAX_IMPORT_BYTES/);
  assert.match(communitySource, /watchReminders\(projectId, setReminders\)/);
  assert.match(communitySource, /createReminder\(project\.id/);
  const reminders = communitySource.slice(communitySource.indexOf("function RemindersManager"));
  assert.doesNotMatch(reminders, /\["bin", "Bin collection"\]/);
  assert.match(reminders, /reminder-history/);
});
