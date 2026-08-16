import assert from "node:assert/strict";
import test from "node:test";
import { queryCommunity } from "../app/shared/communityQueryEngine.ts";

test("legacy approved Green bin record still answers tolerant bin questions", () => {
  const records = [
    { listId: "bins", listTitle: "Bins", itemId: "green", title: "Green bin", details: "Collected tomorrow morning", category: "Recycling" },
  ];
  assert.match(queryCommunity("what bin is tomorrow please", records).answer, /Green bin/i);
});

test("directory Bin cleaning service cannot become a collection answer", () => {
  const records = [
    { listId: "services", listTitle: "Local services", itemId: "cleaner", title: "Neva Bin Cleana", details: "Domestic bin cleaning", category: "Bin cleaning", itemType: "directory", phone: "07000 000000" },
  ];
  const result = queryCommunity("what bin is tomorrow please", records);
  assert.doesNotMatch(result.answer, /Neva Bin Cleana/i);
  assert.equal(result.itemIds.length, 0);
});

test("explicit scheduled bin records remain supported", () => {
  const records = [
    { listId: "bins", listTitle: "Bin collections", itemId: "blue", title: "Blue bin", details: "Recycling", category: "Recycling", itemType: "bin", schedule: { type: "weekly", firstCollectionDate: "2026-08-17", intervalWeeks: 1 } },
  ];
  const result = queryCommunity("what bin is tomorrow", records, { now: new Date("2026-08-16T12:00:00Z"), timezone: "Europe/London" });
  assert.match(result.answer, /Blue bin/i);
});
