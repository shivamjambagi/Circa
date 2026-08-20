"use client";

import { getFirebaseServices } from "../firebase/client";

async function authHeaders() {
  const services = getFirebaseServices(); const user = services.auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in with a permanent Circa account.");
  let appCheckToken = "";
  try { const { getToken } = await import("firebase/app-check"); if (services.appCheck) appCheckToken = (await getToken(services.appCheck, false)).token; } catch { /* server enforcement decides whether a token is required */ }
  return { authorization: `Bearer ${await user.getIdToken()}`, ...(appCheckToken ? { "x-firebase-appcheck": appCheckToken } : {}) };
}

async function lifecycleRequest(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
  const response = await fetch("/api/account-data", { method, headers: { ...(await authHeaders()), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json() as { ok?: boolean; error?: string; ownedProjects?: Array<{ id: string; name: string }> };
  if (!response.ok) throw new Error(payload.error || "Circa could not complete that account action.");
  return payload;
}

export async function downloadCloudExport() {
  const response = await fetch("/api/account-data", { headers: await authHeaders(), cache: "no-store" });
  if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || "Circa could not prepare your export."); }
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `circa-cloud-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function leaveCloudProject(projectId: string) { return lifecycleRequest("PATCH", { action: "leave", projectId }); }
export function transferCloudProject(projectId: string, newOwnerUid: string) { return lifecycleRequest("PATCH", { action: "transfer-ownership", projectId, newOwnerUid }); }
export function deleteOwnedCloudProject(projectId: string, confirmation: string) { return lifecycleRequest("PATCH", { action: "delete-owned-project", projectId, confirmation }); }
export function deleteCircaAccount() { return lifecycleRequest("DELETE"); }
