import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { DocumentData, DocumentReference, Query } from "firebase-admin/firestore";
import { enforceSharedRateLimit, getAdminAuth, getAdminFirestore, getAdminFirestoreModule, privacyPreservingNetworkSignal, readJsonBodyWithLimit, reportServerFailure, serverErrorStatus, verifyPermanentFirebaseRequest } from "../../server/firebaseAdmin";
import { deleteOwnedProject, reportOwnedProjectDeletionFailure, type OwnedProjectDeletionStage } from "../../server/ownedProjectDeletion";

export const runtime = "nodejs";
const MAX_EXPORT_DOCUMENTS = 20_000;
const safeText = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";

function monitoredFailure(error: unknown, request: Request, scope: string) { const failure = serverErrorStatus(error); const requestId = failure.status >= 500 ? reportServerFailure(scope, error, request) : ""; return NextResponse.json({ error: failure.message }, { status: failure.status, headers: requestId ? { "x-circa-request-id": requestId } : undefined }); }

function jsonValue(value: unknown): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return ((value as { toDate(): Date }).toDate()).toISOString();
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return String(value ?? "");
}

async function exportDocument(ref: DocumentReference<DocumentData>, state: { count: number }): Promise<Record<string, unknown> | null> {
  if (state.count >= MAX_EXPORT_DOCUMENTS) throw new Error("EXPORT_TOO_LARGE");
  const snapshot = await ref.get(); if (!snapshot.exists) return null; state.count += 1;
  const collections: Record<string, unknown[]> = {};
  for (const child of await ref.listCollections()) {
    const rows: unknown[] = []; const children = await child.get();
    for (const document of children.docs) { const exported = await exportDocument(document.ref, state); if (exported) rows.push(exported); }
    collections[child.id] = rows;
  }
  return { id: snapshot.id, data: jsonValue(snapshot.data()), collections };
}

async function queryData(query: Query<DocumentData>) {
  const snapshot = await query.get();
  return snapshot.docs.map((document) => ({ id: document.id, data: jsonValue(document.data()) }));
}

async function userMemberships(uid: string) {
  return (await (await getAdminFirestore()).collection(`users/${uid}/memberships`).get()).docs;
}

async function ownedProjects(uid: string) {
  return (await (await getAdminFirestore()).collection("projects").where("ownerId", "==", uid).get()).docs;
}

function requireRecentAuthentication(token: DecodedIdToken) {
  if (!token.auth_time || Math.floor(Date.now() / 1000) - token.auth_time > 10 * 60) throw new Error("RECENT_AUTH_REQUIRED");
}

async function deleteInPages(makeQuery: () => Query<DocumentData>) {
  const db = await getAdminFirestore();
  for (;;) { const page = await makeQuery().limit(400).get(); if (page.empty) break; const batch = db.batch(); page.docs.forEach((item) => batch.delete(item.ref)); await batch.commit(); if (page.size < 400) break; }
}

async function removeUserDataFromProject(projectId: string, uid: string, retainMembership = true) {
  const db = await getAdminFirestore(); const { FieldValue } = await getAdminFirestoreModule(); const now = FieldValue.serverTimestamp();
  const memberRef = db.doc(`projects/${projectId}/members/${uid}`); const directoryRef = db.doc(`projects/${projectId}/memberDirectory/${uid}`); const membershipRef = db.doc(`users/${uid}/memberships/${projectId}`); const contributionRef = db.doc(`projects/${projectId}/networkContributions/${uid}`);
  const [member, directory, membership, contribution] = await Promise.all([memberRef.get(), directoryRef.get(), membershipRef.get(), contributionRef.get()]); const batch = db.batch();
  if (retainMembership && member.exists) batch.set(memberRef, { status: "removed", updatedAt: now }, { merge: true }); else if (member.exists) batch.delete(memberRef);
  if (retainMembership && directory.exists) batch.set(directoryRef, { displayName: "Former member", status: "removed", updatedAt: now }, { merge: true }); else if (directory.exists) batch.delete(directoryRef);
  if (retainMembership && membership.exists) batch.set(membershipRef, { status: "removed", updatedAt: now }, { merge: true }); else if (membership.exists) batch.delete(membershipRef);
  if (contribution.exists) batch.set(contributionRef, { enabled: false, revokedAt: now, updatedAt: now }, { merge: true });
  const eventRef = db.collection(`projects/${projectId}/moderationEvents`).doc(); batch.set(eventRef, { action: "member-left", actorUid: uid, targetId: uid, details: {}, schemaVersion: 1, createdAt: now }); await batch.commit();
  await Promise.all([
    deleteInPages(() => db.collection(`projects/${projectId}/networkImports`).where("importedBy", "==", uid)),
    deleteInPages(() => db.collection(`projects/${projectId}/networkPeople`).where("ownerUid", "==", uid)),
    deleteInPages(() => db.collection(`projects/${projectId}/networkEdges`).where("ownerUid", "==", uid)),
    deleteInPages(() => db.collection(`projects/${projectId}/networkPrivateFields`).where("ownerUid", "==", uid)),
  ]);
}

export async function GET(request: Request) {
  try {
    const identity = await verifyPermanentFirebaseRequest(request, process.env.ACCOUNT_REQUIRE_APPCHECK === "true");
    await enforceSharedRateLimit("account-export", `${identity.uid}:${privacyPreservingNetworkSignal(request)}`, 5, 60 * 60_000);
    const db = await getAdminFirestore(); const state = { count: 0 }; const user = await exportDocument(db.doc(`users/${identity.uid}`), state); const memberships = await userMemberships(identity.uid); const projects: unknown[] = [];
    for (const membership of memberships) {
      const projectId = safeText(membership.data().projectId || membership.id); if (!projectId) continue; const project = await db.doc(`projects/${projectId}`).get(); if (!project.exists) continue;
      if (project.data()?.ownerId === identity.uid) projects.push(await exportDocument(project.ref, state));
      else projects.push({ id: projectId, project: jsonValue(project.data()), membership: jsonValue((await db.doc(`projects/${projectId}/members/${identity.uid}`).get()).data()), proposals: await queryData(db.collection(`projects/${projectId}/editProposals`).where("submittedBy", "==", identity.uid)), networkImports: await queryData(db.collection(`projects/${projectId}/networkImports`).where("importedBy", "==", identity.uid)), networkPeople: await queryData(db.collection(`projects/${projectId}/networkPeople`).where("ownerUid", "==", identity.uid)), networkEdges: await queryData(db.collection(`projects/${projectId}/networkEdges`).where("ownerUid", "==", identity.uid)), networkPrivateFields: await queryData(db.collection(`projects/${projectId}/networkPrivateFields`).where("ownerUid", "==", identity.uid)), contribution: jsonValue((await db.doc(`projects/${projectId}/networkContributions/${identity.uid}`).get()).data()) });
    }
    const body = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), accountUid: identity.uid, user, projects }, null, 2);
    if (Buffer.byteLength(body) > 25 * 1024 * 1024) throw new Error("EXPORT_TOO_LARGE");
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="circa-cloud-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : ""; if (message === "EXPORT_TOO_LARGE") return NextResponse.json({ error: "This export is too large for instant download. Contact Circa support for a secure export." }, { status: 413 }); return monitoredFailure(error, request, "account-export"); }
}

export async function PATCH(request: Request) {
  let lifecycleAction = "unknown";
  let lifecycleProjectId = "invalid";
  let deletionStage: OwnedProjectDeletionStage | "request" = "request";
  try {
    const identity = await verifyPermanentFirebaseRequest(request, process.env.ACCOUNT_REQUIRE_APPCHECK === "true");
    const body = await readJsonBodyWithLimit(request, 8 * 1024);
    const action = safeText(body.action, 40);
    const projectId = safeText(body.projectId, 160);
    lifecycleAction = action;
    lifecycleProjectId = projectId;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(projectId)) return NextResponse.json({ error: "Choose a valid Circa space." }, { status: 400 });
    const db = await getAdminFirestore();

    if (action === "delete-owned-project") {
      await enforceSharedRateLimit("account-lifecycle", `${identity.uid}:${privacyPreservingNetworkSignal(request)}`, 20, 60 * 60_000);
      requireRecentAuthentication(identity.token);
      const result = await deleteOwnedProject(db, {
        projectId,
        ownerUid: identity.uid,
        confirmation: safeText(body.confirmation, 180),
        onStage(stage) { deletionStage = stage; },
      });
      if (result.status === "not-found") return NextResponse.json({ error: "That Circa space was not found." }, { status: 404 });
      if (result.status === "forbidden") return NextResponse.json({ error: "Only the owner can permanently delete this space." }, { status: 403 });
      if (result.status === "confirmation-mismatch") return NextResponse.json({ error: "Type the exact space name to confirm permanent deletion." }, { status: 400 });
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }

    const project = await db.doc(`projects/${projectId}`).get();
    const membership = await db.doc(`projects/${projectId}/members/${identity.uid}`).get();
    if (!project.exists || !membership.exists || membership.data()?.status !== "active") return NextResponse.json({ error: "That active membership was not found." }, { status: 404 });
    await enforceSharedRateLimit("account-lifecycle", `${identity.uid}:${privacyPreservingNetworkSignal(request)}`, 20, 60 * 60_000);
    if (action === "leave") { if (project.data()?.ownerId === identity.uid || membership.data()?.role === "owner") return NextResponse.json({ error: "Transfer ownership or permanently delete this space before leaving." }, { status: 409 }); await removeUserDataFromProject(projectId, identity.uid); return NextResponse.json({ ok: true }); }
    requireRecentAuthentication(identity.token);
    if (action === "transfer-ownership") {
      if (project.data()?.ownerId !== identity.uid || membership.data()?.role !== "owner") return NextResponse.json({ error: "Only the current owner can transfer ownership." }, { status: 403 }); const newOwnerUid = safeText(body.newOwnerUid, 160); if (!newOwnerUid || newOwnerUid === identity.uid) return NextResponse.json({ error: "Choose another active member." }, { status: 400 }); const nextMemberRef = db.doc(`projects/${projectId}/members/${newOwnerUid}`); const nextMember = await nextMemberRef.get(); if (!nextMember.exists || nextMember.data()?.status !== "active") return NextResponse.json({ error: "Choose an active member." }, { status: 400 }); const nextAuth = await (await getAdminAuth()).getUser(newOwnerUid); if (!nextAuth.providerData.length) return NextResponse.json({ error: "Ownership requires a permanent Circa account." }, { status: 400 }); const { FieldValue } = await getAdminFirestoreModule(); await db.runTransaction(async (transaction) => { const fresh = await transaction.get(project.ref); if (fresh.data()?.ownerId !== identity.uid) throw new Error("OWNERSHIP_CHANGED"); transaction.update(project.ref, { ownerId: newOwnerUid, updatedAt: FieldValue.serverTimestamp() }); transaction.update(membership.ref, { role: "admin", updatedAt: FieldValue.serverTimestamp() }); transaction.update(nextMemberRef, { role: "owner", updatedAt: FieldValue.serverTimestamp() }); transaction.set(db.doc(`users/${identity.uid}/memberships/${projectId}`), { role: "admin", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.set(db.doc(`users/${newOwnerUid}/memberships/${projectId}`), { role: "owner", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.set(db.collection(`projects/${projectId}/moderationEvents`).doc(), { action: "ownership-transferred", actorUid: identity.uid, targetId: newOwnerUid, details: {}, schemaVersion: 1, createdAt: FieldValue.serverTimestamp() }); }); return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown lifecycle action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "RECENT_AUTH_REQUIRED") return NextResponse.json({ error: "Sign in again before this sensitive action." }, { status: 401 });
    if (message === "OWNERSHIP_CHANGED") return NextResponse.json({ error: "Ownership changed. Refresh and try again." }, { status: 409 });
    if (lifecycleAction === "delete-owned-project") reportOwnedProjectDeletionFailure(lifecycleAction, lifecycleProjectId, deletionStage, error);
    return monitoredFailure(error, request, "account-lifecycle");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await verifyPermanentFirebaseRequest(request, process.env.ACCOUNT_REQUIRE_APPCHECK === "true"); requireRecentAuthentication(identity.token); await enforceSharedRateLimit("account-delete", `${identity.uid}:${privacyPreservingNetworkSignal(request)}`, 3, 24 * 60 * 60_000); const db = await getAdminFirestore(); const owned = await ownedProjects(identity.uid);
    if (owned.length) return NextResponse.json({ error: "Transfer ownership or permanently delete every owned Community and Network first.", ownedProjects: owned.map((item) => ({ id: item.id, name: safeText(item.data().name, 180) })) }, { status: 409 });
    const memberships = await userMemberships(identity.uid); for (const item of memberships) await removeUserDataFromProject(safeText(item.data().projectId || item.id), identity.uid, false);
    for (const item of memberships) {
      const projectId = safeText(item.data().projectId || item.id); const proposals = await db.collection(`projects/${projectId}/editProposals`).where("submittedBy", "==", identity.uid).get(); for (const proposal of proposals.docs) { if (proposal.data().status === "approved") await proposal.ref.update({ submittedBy: "deleted-account", submittedByName: "Former member", reason: "", deletionRedactedAt: new Date() }); else await proposal.ref.delete(); }
      const events = await db.collection(`projects/${projectId}/moderationEvents`).where("actorUid", "==", identity.uid).get(); for (const event of events.docs) await event.ref.update({ actorUid: "deleted-account", details: {}, deletionRedactedAt: new Date() });
    }
    await db.recursiveDelete(db.doc(`users/${identity.uid}`)); await (await getAdminAuth()).deleteUser(identity.uid);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : ""; if (message === "RECENT_AUTH_REQUIRED") return NextResponse.json({ error: "Sign in again before deleting your account." }, { status: 401 }); return monitoredFailure(error, request, "account-delete"); }
}
