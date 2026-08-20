import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let environment: RulesTestEnvironment;
const ownerId = "owner_user"; const memberId = "member_user"; const otherId = "other_user"; const projectId = "community_project";
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
    await setDoc(doc(db, "projects", projectId, "members", memberId), { uid: memberId, role: "member", status: "active", joinedViaInviteId: "invite_123456789012345678901234", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "memberDirectory", ownerId), { uid: ownerId, displayName: "Owner", role: "owner", status: "active", joinedAt: new Date(), schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "memberDirectory", memberId), { uid: memberId, displayName: "Member", role: "member", status: "active", joinedAt: new Date(), schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices"), { title: "Notices", order: 1, schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "approved"), { title: "Approved", details: "Published", order: 1, schemaVersion: 1 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "member-owned"), { title: "Member contribution", createdBy: memberId, order: 2, schemaVersion: 2 });
    await setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "other-owned"), { title: "Someone else contribution", createdBy: otherId, order: 3, schemaVersion: 2 });
    await setDoc(doc(db, "projects", "unrelated"), { name: "Private", projectMode: "community", ownerId: otherId, schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network"), { name: "Network", projectMode: "network", ownerId, schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network", "members", ownerId), { uid: ownerId, role: "owner", status: "active", joinedViaInviteId: "", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", "network", "members", memberId), { uid: memberId, role: "member", status: "active", joinedViaInviteId: "invite_123456789012345678901234", consented: true, consentVersion: 1, joinedAt: new Date(), schemaVersion: 2 });
    await setDoc(doc(db, "projects", "network", "networkPeople", "private"), { displayName: "Private person", ownerUid: ownerId, visibility: "private", schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network", "networkPeople", "shared"), { displayName: "Shared person", ownerUid: ownerId, visibility: "project", schemaVersion: 1 });
    await setDoc(doc(db, "projects", "network", "networkPrivateFields", "private"), { ownerUid: ownerId, email: "owner@example.com", schemaVersion: 2 });
  });
});

describe("Community database permissions", () => {
  it("lets members read approved data and create only their own pending proposal", async () => {
    const db = auth(memberId);
    await assertSucceeds(getDoc(doc(db, "projects", projectId, "lists", "notices", "items", "approved")));
    await assertSucceeds(setDoc(doc(db, "projects", projectId, "editProposals", "mine"), { projectId, listId: "notices", itemId: "", operation: "create", proposedItem: { title: "Suggestion" }, reason: "Useful", status: "pending", submittedBy: memberId, submittedByName: "Member", schemaVersion: 1 }));
    await assertFails(setDoc(doc(db, "projects", projectId, "editProposals", "forged"), { projectId, listId: "notices", itemId: "", operation: "create", proposedItem: {}, status: "approved", submittedBy: memberId }));
  });

  it("lets Community members list safe member summaries but not raw membership records", async () => {
    const db = auth(memberId);
    await assertSucceeds(getDocs(collection(db, "projects", projectId, "memberDirectory")));
    await assertFails(getDocs(collection(db, "projects", projectId, "members")));
  });

  it("blocks member publication, review, self-promotion and unrelated Community reads", async () => {
    const db = auth(memberId);
    await assertFails(setDoc(doc(db, "projects", projectId, "lists", "notices", "items", "direct"), { title: "Bypass", order: 2, schemaVersion: 1 }));
    await assertFails(updateDoc(doc(db, "projects", projectId, "members", memberId), { role: "admin" }));
    await assertFails(getDoc(doc(db, "projects", "unrelated")));
  });

  it("lets members delete only published information they originally added", async () => {
    const db = auth(memberId);
    await assertSucceeds(deleteDoc(doc(db, "projects", projectId, "lists", "notices", "items", "member-owned")));
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
  it("prevents one member from changing another member's contribution", async () => {
    await assertFails(setDoc(doc(auth(memberId), "projects", "network", "networkContributions", ownerId), { ownerUid: memberId, enabled: true, visibility: "project" }));
  });
  it("keeps another contributor's private email unreadable", async () => {
    await assertFails(getDoc(doc(auth(memberId), "projects", "network", "networkPrivateFields", "private")));
    await assertSucceeds(getDoc(doc(auth(ownerId), "projects", "network", "networkPrivateFields", "private")));
  });
});
