import { getAdminServices, verifyFirebaseRequest } from "../../server/firebaseAdmin";
import { errorResponse, json } from "./_shared/http";

export default async function handler(request: Request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  try {
    const decoded = await verifyFirebaseRequest(request); const projectId = new URL(request.url).searchParams.get("projectId") || ""; const { db } = getAdminServices();
    const member = await db.doc(`projects/${projectId}/members/${decoded.uid}`).get(); if (!member.exists || member.data()?.status !== "active") throw new Error("Active Community membership is required.");
    const available = Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.CIRCA_WHATSAPP_NUMBER);
    if (!available) return json({ available: false, connected: false, questionOptIn: false, reminderCategories: [] });
    const subscription = await db.doc(`projects/${projectId}/whatsappSubscriptions/${decoded.uid}`).get();
    return json({ available: true, connected: subscription.exists, maskedPhone: member.data()?.maskedPhone || undefined, questionOptIn: subscription.data()?.questionOptIn !== false, reminderCategories: subscription.data()?.reminderCategories || (subscription.data()?.reminderOptIn ? ["bins", "events", "announcements"] : []) });
  } catch (error) { return errorResponse(error); }
}
