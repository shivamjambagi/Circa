import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminServices } from "../../server/firebaseAdmin";
import { WhatsAppOneToOneAdapter } from "../../server/messaging/WhatsAppAdapter";
import { errorResponse, json } from "./_shared/http";

const adapter = new WhatsAppOneToOneAdapter();
export const config = { schedule: "*/15 * * * *" };

export default async function handler() {
  try {
    const { db } = getAdminServices(); const due = await db.collectionGroup("reminders").where("enabled", "==", true).where("nextRunAt", "<=", Timestamp.now()).limit(100).get(); let sent = 0;
    for (const reminder of due.docs) { const path = reminder.ref.path.split("/"); const projectId = path[1]; const data = reminder.data(); const occurrence = data.nextRunAt instanceof Timestamp ? data.nextRunAt.toMillis() : Date.now(); const project = await db.doc(`projects/${projectId}`).get(); const subscriptions = await db.collection(`projects/${projectId}/whatsappSubscriptions`).where("reminderOptIn", "==", true).limit(500).get();
      for (const subscription of subscriptions.docs) { const categories = subscription.data().reminderCategories || (subscription.data().reminderOptIn ? ["bins", "events", "announcements"] : []); if (!categories.includes(data.category || "announcements")) continue; const deliveryRef = reminder.ref.collection("deliveries").doc(`${occurrence}_${subscription.id}`); const claimed = await db.runTransaction(async (transaction) => { const existing = await transaction.get(deliveryRef); if (existing.exists) return false; transaction.set(deliveryRef, { status: "sending", occurrence, uid: subscription.id, createdAt: FieldValue.serverTimestamp() }); return true; }); if (!claimed) continue; const identity = await db.doc(`whatsappIdentities/${subscription.data().identityId}`).get(); if (!identity.exists) { await deliveryRef.update({ status: "skipped", reason: "identity missing" }); continue; } try { await adapter.send(identity.data()!.phoneE164, `${project.data()?.name || "Circa Community"}: ${data.message}`); await deliveryRef.update({ status: "sent", sentAt: FieldValue.serverTimestamp() }); sent += 1; } catch (error) { await deliveryRef.update({ status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "send failed" }); } }
      const repeatMs = data.repeatType === "weekly" ? 7 * 86_400_000 : data.repeatType === "fortnightly" ? 14 * 86_400_000 : data.repeatType === "monthly" ? 30 * 86_400_000 : data.repeatMinutes ? Number(data.repeatMinutes) * 60_000 : 0;
      await reminder.ref.update({ lastRunAt: FieldValue.serverTimestamp(), nextRunAt: repeatMs ? Timestamp.fromMillis(occurrence + repeatMs) : null, enabled: Boolean(repeatMs), status: repeatMs ? "upcoming" : "sent", updatedAt: FieldValue.serverTimestamp() });
    }
    return json({ processed: due.size, sent });
  } catch (error) { return errorResponse(error, "Reminder run failed."); }
}
