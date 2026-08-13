"use client";

import { getFirebaseServices } from "../firebase/client";

async function authorised(path: string, body?: unknown) {
  const user = getFirebaseServices().auth.currentUser;
  if (!user) throw new Error("Sign in before connecting WhatsApp.");
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${await user.getIdToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "WhatsApp integration is not available for this Community yet.");
  return result;
}

export async function getWhatsAppAvailability() {
  const response = await fetch("/.netlify/functions/whatsapp-status");
  if (!response.ok) return { available: false };
  return response.json() as Promise<{ available: boolean; number?: string }>;
}

export function getWhatsAppIntegrationStatus(projectId: string) {
  return authorised(`whatsapp-integration-status?projectId=${encodeURIComponent(projectId)}`) as Promise<{ available: boolean; connected: boolean; maskedPhone?: string; questionOptIn: boolean; reminderCategories: string[] }>;
}

export function startWhatsAppLink(projectId: string, connectionConsent: boolean) {
  return authorised("whatsapp-link-start", { projectId, connectionConsent }) as Promise<{ deepLink: string; expiresAt: string }>;
}

export function updateWhatsAppPreferences(projectId: string, preferences: { questionOptIn: boolean; reminderCategories: string[] }) {
  return authorised("whatsapp-preferences", { projectId, ...preferences });
}

export function updateWhatsAppReminderPreference(projectId: string, reminderOptIn: boolean) {
  return updateWhatsAppPreferences(projectId, { questionOptIn: true, reminderCategories: reminderOptIn ? ["bins", "events", "announcements"] : [] });
}

export function disconnectWhatsApp(projectId: string) { return authorised("whatsapp-disconnect", { projectId }); }
