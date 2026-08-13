import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendlyAuthMessage, safeReturnTo, settleAuthenticatedUser } from "../app/firebase/authLogic.ts";
import { dateKeyInTimezone, nextScheduleOccurrence, queryCommunity } from "../app/shared/communityQueryEngine.ts";

describe("Authentication navigation and errors", () => {
  it("allows only internal return paths", () => {
    assert.equal(safeReturnTo("/community/new?step=details"), "/community/new?step=details");
    assert.equal(safeReturnTo("https://evil.example"), "/account");
    assert.equal(safeReturnTo("//evil.example/path"), "/account");
    assert.equal(safeReturnTo("/\\evil.example"), "/account");
  });
  it("turns technical Firebase errors into professional copy", () => {
    assert.match(friendlyAuthMessage({ code: "auth/unauthorized-domain" }), /main Circa site/);
    assert.doesNotMatch(friendlyAuthMessage({ code: "auth/operation-not-allowed" }), /FirebaseError/);
  });
  it("keeps authentication successful when profile synchronisation fails", async () => {
    const authenticatedUser = { uid: "authenticated-user" };
    const result = await settleAuthenticatedUser(authenticatedUser, async () => { throw new Error("permission-denied"); });
    assert.equal(result.user, authenticatedUser); assert.equal(result.profileSynced, false); assert.match(result.profileSyncError || "", /session is still active/i);
  });
});

describe("Deterministic Community schedules", () => {
  const records = [{ listId: "bins", listTitle: "Bin collections", itemId: "recycling", title: "Recycling", details: "", category: "Bins", itemType: "bin" as const, binType: "recycling", schedule: { type: "fortnightly" as const, firstCollectionDate: "2026-08-05", intervalWeeks: 2 }, timezone: "Europe/London", enabled: true }];
  it("calculates tomorrow without a stored tomorrow keyword", () => {
    const result = queryCommunity("Which bin goes out tomorrow?", records, { timezone: "Europe/London", now: new Date("2026-08-18T12:00:00Z") });
    assert.equal(result.intent, "bin"); assert.match(result.answer, /Recycling/); assert.equal(result.targetDate, "2026-08-19");
  });
  it("calculates next collection and named weekdays", () => {
    assert.equal(nextScheduleOccurrence(records[0].schedule, "2026-08-06"), "2026-08-19");
    assert.match(queryCommunity("When is the next recycling collection?", records, { timezone: "Europe/London", now: new Date("2026-08-06T08:00:00Z") }).answer, /Wednesday 19 August/);
  });
  it("uses the Community timezone around the UK daylight-saving transition", () => {
    assert.equal(dateKeyInTimezone(new Date("2026-03-29T00:30:00Z"), "Europe/London"), "2026-03-29");
    assert.equal(dateKeyInTimezone(new Date("2026-03-29T23:30:00Z"), "Europe/London"), "2026-03-30");
  });
  it("does not hallucinate missing collection types", () => {
    assert.match(queryCommunity("When is the next garden bin?", records, { timezone: "Europe/London", now: new Date("2026-08-06T08:00:00Z") }).answer, /does not have/i);
  });
});
