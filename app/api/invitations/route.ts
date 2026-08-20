import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminFirestore, getAdminFirestoreModule, readJsonBodyWithLimit, reportServerFailure, serverErrorStatus, verifyPermanentFirebaseRequest } from "../../server/firebaseAdmin";

export const runtime = "nodejs";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const token = () => randomBytes(24).toString("hex");
const code = () => [...randomBytes(8)].map((value) => alphabet[value % alphabet.length]).join("");
const safeText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  try {
    const identity = await verifyPermanentFirebaseRequest(request);
    const body = await readJsonBodyWithLimit(request, 8 * 1024); const projectId = safeText(body.projectId, 160);
    const [db, { FieldValue, Timestamp }] = await Promise.all([getAdminFirestore(), getAdminFirestoreModule()]); const [project, member] = await Promise.all([db.collection("projects").doc(projectId).get(), db.doc(`projects/${projectId}/members/${identity.uid}`).get()]);
    if (!project.exists || member.data()?.status !== "active" || !["owner", "admin"].includes(member.data()?.role)) return NextResponse.json({ error: "Only an active Community admin can create invitations." }, { status: 403 });
    const projectData = project.data()!; const inviteToken = token(); let inviteCode = "";
    for (let attempt = 0; attempt < 8 && !inviteCode; attempt += 1) {
      const candidate = code(); const existing = await db.collection("joinCodes").doc(candidate).get(); if (!existing.exists) inviteCode = candidate;
    }
    if (!inviteCode) throw new Error("INVITE_CODE_COLLISION");
    const expiryInput = safeText(body.expiresAt, 80); const expiresAt = expiryInput && Number.isFinite(new Date(expiryInput).getTime()) ? Timestamp.fromDate(new Date(expiryInput)) : null;
    const publicData = { projectId, projectMode: projectData.projectMode === "network" ? "network" : "community", projectName: safeText(projectData.name, 80), description: safeText(projectData.description, 800), location: safeText(projectData.location, 120), previewSections: Array.isArray(projectData.previewSections) ? projectData.previewSections.slice(0, 8) : [], label: safeText(body.label, 80), status: "active", expiresAt, schemaVersion: 3, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    const privateData = { ...publicData, code: inviteCode, createdBy: identity.uid };
    const batch = db.batch(); batch.create(db.collection("invites").doc(inviteToken), publicData); batch.create(db.collection("joinCodes").doc(inviteCode), { ...privateData, token: inviteToken }); batch.create(db.doc(`projects/${projectId}/invitations/${inviteToken}`), { ...privateData, token: inviteToken }); batch.create(db.doc(`projects/${projectId}/moderationEvents/invite-${inviteToken}`), { action: "invitation-created", actorUid: identity.uid, targetId: inviteToken, details: {}, schemaVersion: 1, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
    return NextResponse.json({ token: inviteToken, code: inviteCode }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { const failure = serverErrorStatus(error); const requestId = failure.status >= 500 ? reportServerFailure("invitations", error, request) : ""; return NextResponse.json({ error: failure.message }, { status: failure.status, headers: requestId ? { "x-circa-request-id": requestId } : undefined }); }
}
