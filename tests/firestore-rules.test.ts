import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

let environment: RulesTestEnvironment;
const ownerId = "owner_user"; const adminId = "admin_user"; const memberId = "member_user"; const otherId = "other_user"; const projectId = "community_project";
const auth = (uid: string) => environment.authenticatedContext(uid, { firebase: { sign_in_provider: "password" } }).firestore();

before(async () => {
  environment = await initializeTestEnvironment({ projectId: "circa-rules-test", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
after(async () => { await environment.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "projects", projectId), { name: "Prestwich", description: "Approved local information", location: "Manchester", projectMode: "community", category: "community", ownerId, schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "members", ownerId), { uid: ownerId, role: "owner", status: "active", joinedViaInviteId: "", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "members", adminId), { uid: adminId, role: "admin", status: "active", joinedViaInviteId: "invite_123456789012345678901234", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "members", memberId), { uid: memberId, role: "member", status: "active", joinedViaInviteId: "invite_123456789012345678901234", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "memberDirectory", ownerId), { uid: ownerId, displayName: "Owner", role: "owner", status: "active", joinedAt: new Date(), schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "memberDirectory", memberId), { uid: memberId, displayName: "Member", role: "member", status: "active", joinedAt: new Date(), schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices"), { title: "Notices", order: 1, schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "lists", "bins"), { title: "Bin collections", listType: "bin", order: 2, schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "lists", "bins", "items", "2026-09-01"), { title: "Green", itemType: "bin", date: "2026-09-01", bins: ["green"], schedule: { type: "once", firstCollectionDate: "2026-09-01" }, order: 20260901, schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "approved"), { title: "Approved", details: "Published", order: 1, contentVersion: 3, schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "member-owned"), { title: "Member contribution", createdBy: memberId, order: 2, contentVersion: 1, schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "other-owned"), { title: "Someone else contribution", createdBy: otherId, order: 3, schemaVersion: 2 });
    await setDoc(doc(db, "projects", "unrelated"), { name: "Private", projectMode: "community", ownerId: otherId, schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network"), { name: "Network", projectMode: "network", ownerId, schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network", "members", ownerId), { uid: ownerId, role: "owner", status: "active", joinedViaInviteId: "", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", "network", "members", memberId), { uid: memberId, role: "member", status: "active", joinedViaInviteId: "invite_123456789012345678901234", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", "network", "networkPeople", "private"), { displayName: "Private person", ownerUid: ownerId, visibility: "private", schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network", "networkPeople", "shared"), { displayName: "Shared person", ownerUid: ownerId, visibility: "project", schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network", "networkPrivateFields", "private"), { ownerUid: ownerId, email: "owner@example.com", schemaVersion: 2 });
    await setDoc(doc(db, "invites", "invite_123456789012345678901234"), { projectId, projectMode: "community", projectName: "Prestwich", status: "active", expiresAt: null, schemaVersion: 3 });
    await setDoc(doc(db, "invites", "revoked_12345678901234567890123"), { projectId, projectMode: "community", projectName: "Prestwich", status: "revoked", expiresAt: null, schemaVersion: 3 });
    await setDoc(doc(db, "invites", "expired_12345678901234567890123"), { projectId, projectMode: "community", projectName: "Prestwich", status: "active", expiresAt: new Date(Date.now() - 60_000), schemaVersion: 3 });
  });
});

describe("Community database permissions", () => {
  it("lets members read approved data and create only their own pending proposal", async () => {
    const db = auth(memberId);
    await assertSucceeds(getDoc(doc(db, "projects", projectId, "lists", "notices", "items", "approved")));
    await assertSucceeds(setDoc(doc(db, "projects", projectId, "editProposals", "mine"), { projectId, listId: "notices", itemId: "", operation: "create", currentItem: null, proposedItem: { title: "Suggestion" }, baseVersion: 0, reason: "Useful", status: "pending", submittedBy: memberId, submittedByName: "Member", submittedAt: serverTimestamp(), schemaVersion: 3 }));
    await assertFails(setDoc(doc(db, "projects", projectId, "editProposals", "forged"), { projectId, listId: "notices", itemId: "", operation: "create", proposedItem: {}, status: "approved", submittedBy: memberId }));
  });

  it("lets Community members list safe member summaries but not raw membership records", async () => {
    const db = auth(memberId);
    await assertSucceeds(getDocs(collection(db, "projects", projectId, "memberDirectory")));
    await assertFails(getDocs(collection(db, "projects", projectId, "members")));
  });

  it("lets active members read Bin Collections while only owners and admins can modify them", async () => {
    const itemPath = ["projects", projectId, "lists", "bins", "items"] as const;
    await assertSucceeds(getDocs(collection(auth(memberId), ...itemPath)));
    await assertFails(getDocs(collection(auth(otherId), ...itemPath)));
    await assertFails(setDoc(doc(auth(memberId), ...itemPath, "2026-09-08"), { title: "Blue + Brown", itemType: "bin", date: "2026-09-08", bins: ["blue", "brown"], order: 20260908, schemaVersion: 2 }));
    await assertSucceeds(setDoc(doc(auth(ownerId), ...itemPath, "2026-09-08"), { title: "Blue + Brown", itemType: "bin", date: "2026-09-08", bins: ["blue", "brown"], order: 20260908, schemaVersion: 2 }));
    await assertSucceeds(updateDoc(doc(auth(adminId), ...itemPath, "2026-09-08"), { bins: ["grey"], title: "Grey" }));
    await assertFails(deleteDoc(doc(auth(memberId), ...itemPath, "2026-09-08")));
    await assertSucceeds(deleteDoc(doc(auth(adminId), ...itemPath, "2026-09-08")));
  });

  it("blocks member publication, review, self-promotion and unrelated Community reads", async () => {
    const db = auth(memberId);
    await assertFails(setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "direct"), { title: "Bypass", order: 2, schemaVersion: 1 }));
    await assertFails(updateDoc(doc(db, "projects", projectId, "members", memberId), { role: "admin" }));
    await assertFails(getDoc(doc(db, "projects", "unrelated")));
  });

  it("routes every member deletion through proposals", async () => {
    const db = auth(memberId);
    await assertFails(deleteDoc(doc(db, "projects", projectId, "lists", "notices", "items", "member-owned")));
    await assertFails(deleteDoc(doc(db, "projects", projectId, "lists", "notices", "items", "other-owned")));
    await assertFails(deleteDoc(doc(db, "projects", projectId, "lists", "notices", "items", "approved")));
  });

  it("lets the owner publish while unknown server-only records stay denied", async () => {
    const db = auth(ownerId);
    await assertSucceeds(setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "owner-item"), { title: "Published by owner", order: 3, schemaVersion: 1 }));
    await assertFails(getDoc(doc(db, "serverOnlyRecords", "owner-bucket")));
    await assertFails(setDoc(doc(db, "serverOnlyRecords", "owner-bucket"), { count: 1 }));
  });

  it("protects owner role and immutable membership provenance", async () => {
    await assertFails(updateDoc(doc(auth(ownerId), "projects", projectId, "members", ownerId), { role: "member" }));
    await assertFails(updateDoc(doc(auth(memberId), "projects", projectId, "members", memberId), { joinedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(auth(memberId), "projects", projectId, "members", memberId), { joinedViaInviteId: "forged_invite_12345678901234567890" }));
  });
});

describe("Network privacy rules", () => {
  it("allows the owner to read private imports", async () => { await assertSucceeds(getDoc(doc(auth(ownerId), "projects", "network", "networkPeople", "private"))); });
  it("blocks another member until the owner explicitly enables their contribution", async () => {
    const privateRecord = doc(auth(memberId), "projects", "network", "networkPeople", "private");
    const sharedRecord = doc(auth(memberId), "projects", "network", "networkPeople", "shared");
    await assertFails(getDoc(privateRecord));
    await assertFails(getDoc(sharedRecord));
    await assertSucceeds(setDoc(doc(auth(ownerId), "projects", "network", "networkContributions", ownerId), { ownerUid: ownerId, enabled: true, consentVersion: 1, updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(privateRecord));
    await assertSucceeds(getDoc(sharedRecord));
  });

  it("enforces immutable proposal provenance, server review metadata and no self-review", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "projects", projectId, "editProposals", "member-proposal"), { projectId, listId: "notices", itemId: "", operation: "create", currentItem: null, proposedItem: { title: "Member idea" }, baseVersion: 0, reason: "Useful", status: "pending", submittedBy: memberId, submittedByName: "Member", submittedAt: new Date(), schemaVersion: 3 });
      await setDoc(doc(db, "projects", projectId, "editProposals", "owner-proposal"), { projectId, listId: "notices", itemId: "", operation: "create", currentItem: null, proposedItem: { title: "Owner idea" }, baseVersion: 0, reason: "Useful", status: "pending", submittedBy: ownerId, submittedByName: "Owner", submittedAt: new Date(), schemaVersion: 3 });
    });
    await assertFails(updateDoc(doc(auth(ownerId), "projects", projectId, "editProposals", "member-proposal"), { status: "approved", reviewedBy: otherId, reviewedAt: serverTimestamp(), reviewNote: "Forged" }));
    await assertFails(updateDoc(doc(auth(ownerId), "projects", projectId, "editProposals", "owner-proposal"), { status: "rejected", reviewedBy: ownerId, reviewedAt: serverTimestamp(), reviewNote: "Self review" }));
    await assertSucceeds(updateDoc(doc(auth(ownerId), "projects", projectId, "editProposals", "member-proposal"), { status: "approved", reviewedBy: ownerId, reviewedAt: serverTimestamp(), reviewNote: "Checked" }));
  });

  it("rejects a stale proposal base and accepts an exact current version", async () => {
    const db = auth(memberId); const currentItem = { title: "Approved", details: "Published", order: 1, contentVersion: 3, schemaVersion: 2 };
    await assertFails(setDoc(doc(db, "projects", projectId, "editProposals", "stale"), { projectId, listId: "notices", itemId: "approved", operation: "update", currentItem, proposedItem: { title: "Changed", contentVersion: 3 }, baseVersion: 2, reason: "Correction", status: "pending", submittedBy: memberId, submittedByName: "Member", submittedAt: serverTimestamp(), schemaVersion: 3 }));
    await assertSucceeds(setDoc(doc(db, "projects", projectId, "editProposals", "current"), { projectId, listId: "notices", itemId: "approved", operation: "update", currentItem, proposedItem: { title: "Changed", contentVersion: 4 }, baseVersion: 3, reason: "Correction", status: "pending", submittedBy: memberId, submittedByName: "Member", submittedAt: serverTimestamp(), schemaVersion: 3 }));
  });

  it("allows a removed member to rejoin only through a current invite", async () => {
    await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), "projects", projectId, "members", memberId), { status: "removed" }));
    const ref = doc(auth(memberId), "projects", projectId, "members", memberId);
    await assertFails(setDoc(ref, { status: "active", displayName: "Member", isAnonymous: false, joinedViaInviteId: "revoked_12345678901234567890123", consented: true, consentedAt: serverTimestamp(), consentVersion: 1, updatedAt: serverTimestamp(), schemaVersion: 2 }, { merge: true }));
    await assertFails(setDoc(ref, { status: "active", displayName: "Member", isAnonymous: false, joinedViaInviteId: "expired_12345678901234567890123", consented: true, consentedAt: serverTimestamp(), consentVersion: 1, updatedAt: serverTimestamp(), schemaVersion: 2 }, { merge: true }));
    await assertSucceeds(setDoc(ref, { status: "active", displayName: "Member", isAnonymous: false, joinedViaInviteId: "invite_123456789012345678901234", consented: true, consentedAt: serverTimestamp(), consentVersion: 1, updatedAt: serverTimestamp(), schemaVersion: 2 }, { merge: true }));
  });

  it("keeps join codes server-only, owner deletion blocked and moderation events immutable", async () => {
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "joinCodes", "ABCDEFGH")));
    await assertFails(deleteDoc(doc(auth(ownerId), "projects", projectId)));
    const db = auth(ownerId); const batch = writeBatch(db); const event = doc(db, "projects", projectId, "moderationEvents", "event-one");
    batch.set(event, { action: "item-published", actorUid: ownerId, targetId: "approved", details: {}, schemaVersion: 1, createdAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(event, { targetId: "forged" }));
    await assertFails(deleteDoc(event));
  });

  it("keeps membership index writes idempotent on retries", async () => {
    const db = auth(memberId); const index = doc(db, "users", memberId, "memberships", projectId); const payload = { projectId, projectName: "Prestwich", projectMode: "community", role: "member", status: "active", updatedAt: serverTimestamp(), schemaVersion: 1 };
    await assertSucceeds(setDoc(index, payload, { merge: true }));
    await assertSucceeds(setDoc(index, payload, { merge: true }));
  });
  it("prevents one member from changing another member's contribution", async () => {
    await assertFails(setDoc(doc(auth(memberId), "projects", "network", "networkContributions", ownerId), { ownerUid: memberId, enabled: true, visibility: "project" }));
  });
  it("keeps another contributor's private email unreadable", async () => {
    await assertFails(getDoc(doc(auth(memberId), "projects", "network", "networkPrivateFields", "private")));
    await assertSucceeds(getDoc(doc(auth(ownerId), "projects", "network", "networkPrivateFields", "private")));
  });
});
