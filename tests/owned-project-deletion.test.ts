import assert from "node:assert/strict";
import { after, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { deleteOwnedProject } from "../app/server/ownedProjectDeletion.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("owned-project-deletion.test.ts requires the Firestore emulator.");

const projectNamespace = `owned-delete-${process.pid}`;
const app = initializeApp({ projectId: "circa-rules-test" }, projectNamespace);
const db = getFirestore(app);

after(async () => {
  await db.terminate();
  await deleteApp(app);
});

async function seedOwnedProject(options: {
  projectId: string;
  ownerUid: string;
  projectMode?: "community" | "network";
  memberUids?: string[];
}) {
  const { projectId, ownerUid, projectMode = "community", memberUids = [ownerUid, `${ownerUid}-member`] } = options;
  const projectRef = db.doc(`projects/${projectId}`);
  const projectBatch = db.batch();
  projectBatch.set(projectRef, { ownerId: ownerUid, name: "The Mount", projectMode, schemaVersion: 3 });
  for (const uid of memberUids) {
    const role = uid === ownerUid ? "owner" : "member";
    projectBatch.set(db.doc(`projects/${projectId}/members/${uid}`), { uid, role, status: "active" });
    projectBatch.set(db.doc(`users/${uid}/memberships/${projectId}`), { projectId, projectMode, role, status: "active" });
  }
  await projectBatch.commit();

  const related = db.batch();
  related.set(db.doc(`projects/${projectId}/memberDirectory/${ownerUid}`), { uid: ownerUid, role: "owner", status: "active" });
  related.set(db.doc(`projects/${projectId}/lists/contacts`), { title: "Contacts" });
  related.set(db.doc(`projects/${projectId}/lists/contacts/items/contact-one`), { title: "Private contact" });
  related.set(db.doc(`projects/${projectId}/editProposals/proposal-one`), { projectId, status: "pending" });
  related.set(db.doc(`projects/${projectId}/invitations/local-invite`), { projectId, status: "active" });
  related.set(db.doc(`projects/${projectId}/networkPeople/person-one`), { ownerUid, visibility: "private" });
  related.set(db.doc(`projects/${projectId}/networkEdges/edge-one`), { ownerUid, visibility: "private" });
  related.set(db.doc(`invites/global-${projectId}`), { projectId, status: "active" });
  related.set(db.doc(`joinCodes/code-${projectId}`), { projectId, status: "active" });
  await related.commit();
  return projectRef;
}

async function assertProjectTreeDeleted(database: Firestore, projectId: string) {
  assert.equal((await database.doc(`projects/${projectId}`).get()).exists, false);
  assert.equal((await database.doc(`projects/${projectId}/lists/contacts/items/contact-one`).get()).exists, false);
  assert.equal((await database.doc(`projects/${projectId}/editProposals/proposal-one`).get()).exists, false);
  assert.equal((await database.doc(`projects/${projectId}/invitations/local-invite`).get()).exists, false);
  assert.equal((await database.doc(`projects/${projectId}/networkPeople/person-one`).get()).exists, false);
  assert.equal((await database.doc(`projects/${projectId}/networkEdges/edge-one`).get()).exists, false);
  assert.deepEqual(await database.doc(`projects/${projectId}`).listCollections(), []);
}

test("owner deletion removes Community data, members, invitations, proposals and account pointers", async () => {
  const projectId = `${projectNamespace}-success`;
  const ownerUid = `${projectNamespace}-owner`;
  const memberUid = `${projectNamespace}-member`;
  await seedOwnedProject({ projectId, ownerUid, memberUids: [ownerUid, memberUid] });

  const stages: string[] = [];
  const result = await deleteOwnedProject(db, { projectId, ownerUid, confirmation: "The Mount", onStage: (stage) => stages.push(stage) });

  assert.deepEqual(result, { status: "deleted" });
  assert.deepEqual(stages, ["verify-ownership", "collect-account-pointers", "delete-account-pointers", "delete-global-invitations", "delete-project-tree", "complete-operation"]);
  await assertProjectTreeDeleted(db, projectId);
  assert.equal((await db.doc(`users/${ownerUid}/memberships/${projectId}`).get()).exists, false);
  assert.equal((await db.doc(`users/${memberUid}/memberships/${projectId}`).get()).exists, false);
  assert.equal((await db.doc(`invites/global-${projectId}`).get()).exists, false);
  assert.equal((await db.doc(`joinCodes/code-${projectId}`).get()).exists, false);
  assert.equal((await db.doc(`users/${ownerUid}/projectDeletionOperations/${projectId}`).get()).data()?.status, "completed");
});

test("non-owner deletion is rejected without changing the project", async () => {
  const projectId = `${projectNamespace}-non-owner`;
  const ownerUid = `${projectNamespace}-real-owner`;
  const intruderUid = `${projectNamespace}-intruder`;
  await seedOwnedProject({ projectId, ownerUid, memberUids: [ownerUid, intruderUid] });

  const result = await deleteOwnedProject(db, { projectId, ownerUid: intruderUid, confirmation: "The Mount" });

  assert.deepEqual(result, { status: "forbidden" });
  assert.equal((await db.doc(`projects/${projectId}`).get()).exists, true);
  assert.equal((await db.doc(`projects/${projectId}/lists/contacts/items/contact-one`).get()).exists, true);
  assert.equal((await db.doc(`users/${intruderUid}/projectDeletionOperations/${projectId}`).get()).exists, false);
});

test("a missing project without an owner deletion receipt returns not found", async () => {
  const projectId = `${projectNamespace}-missing`;
  const ownerUid = `${projectNamespace}-missing-owner`;

  const result = await deleteOwnedProject(db, { projectId, ownerUid, confirmation: "The Mount" });

  assert.deepEqual(result, { status: "not-found" });
  assert.equal((await db.doc(`users/${ownerUid}/projectDeletionOperations/${projectId}`).get()).exists, false);
});

test("retry resumes a partially deleted Network and a completed retry is safe", async () => {
  const projectId = `${projectNamespace}-retry`;
  const ownerUid = `${projectNamespace}-retry-owner`;
  await seedOwnedProject({ projectId, ownerUid, projectMode: "network" });
  await db.doc(`users/${ownerUid}/projectDeletionOperations/${projectId}`).set({ action: "delete-owned-project", ownerUid, projectId, projectMode: "network", status: "deleting", stage: "delete-project-tree", schemaVersion: 1 });
  await db.doc(`projects/${projectId}/members/${ownerUid}`).delete();
  await db.doc(`users/${ownerUid}/memberships/${projectId}`).delete();

  const resumed = await deleteOwnedProject(db, { projectId, ownerUid, confirmation: "confirmation is not re-evaluated after the secure start" });
  const repeated = await deleteOwnedProject(db, { projectId, ownerUid, confirmation: "" });

  assert.deepEqual(resumed, { status: "deleted" });
  assert.deepEqual(repeated, { status: "already-deleted" });
  await assertProjectTreeDeleted(db, projectId);
  assert.equal((await db.doc(`invites/global-${projectId}`).get()).exists, false);
  assert.equal((await db.doc(`joinCodes/code-${projectId}`).get()).exists, false);
});
