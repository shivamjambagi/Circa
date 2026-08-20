import { NextResponse } from "next/server";
import { enforceSharedRateLimit, getAdminFirestore, privacyPreservingNetworkSignal, readJsonBodyWithLimit, reportServerFailure, serverErrorStatus } from "../../server/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const signal = privacyPreservingNetworkSignal(request);
    await enforceSharedRateLimit("join-code-redemption", signal, 10, 15 * 60_000);
    const body = await readJsonBodyWithLimit(request, 1024);
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return NextResponse.json({ error: "That invitation code is not valid." }, { status: 404 });
    const snapshot = await (await getAdminFirestore()).collection("joinCodes").doc(code).get(); const data = snapshot.data();
    const expiresAt = data?.expiresAt?.toDate?.() ?? (data?.expiresAt ? new Date(data.expiresAt) : null);
    if (!snapshot.exists || data?.status !== "active" || !data?.token || (expiresAt && expiresAt.getTime() <= Date.now())) return NextResponse.json({ error: "That invitation code is not valid." }, { status: 404 });
    return NextResponse.json({ invite: {
      token: String(data.token), projectId: String(data.projectId), projectMode: data.projectMode === "network" ? "network" : "community",
      projectName: String(data.projectName || "Circa Community").slice(0, 80), description: String(data.description || "").slice(0, 800), location: String(data.location || "").slice(0, 120),
      status: "active", expiresAt: expiresAt?.toISOString() ?? null, previewSections: Array.isArray(data.previewSections) ? data.previewSections.slice(0, 8) : [], schemaVersion: Number(data.schemaVersion || 2), code: "",
    } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { const failure = serverErrorStatus(error); const requestId = failure.status >= 500 ? reportServerFailure("join-code", error, request) : ""; return NextResponse.json({ error: failure.message }, { status: failure.status, headers: requestId ? { "x-circa-request-id": requestId } : undefined }); }
}
