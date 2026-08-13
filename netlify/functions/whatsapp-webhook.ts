import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { getAdminServices } from "../../server/firebaseAdmin";
import { WhatsAppOneToOneAdapter } from "../../server/messaging/WhatsAppAdapter";
import { queryCommunity, type PublishedCommunityRecord } from "../../app/shared/communityQueryEngine";
import { verifyWebhookSignature } from "../../server/whatsappSecurity";
import { errorResponse, json } from "./_shared/http";

const adapter = new WhatsAppOneToOneAdapter();
function phoneHash(phone: string) { return createHash("sha256").update(phone).digest("hex"); }

async function approvedRecords(projectId: string): Promise<PublishedCommunityRecord[]> {
  const { db } = getAdminServices(); const lists = await db.collection(`projects/${projectId}/lists`).orderBy("order", "asc").limit(40).get(); const records: PublishedCommunityRecord[] = [];
  for (const list of lists.docs) { const items = await list.ref.collection("items").orderBy("order", "asc").limit(500).get(); for (const item of items.docs) { const data = item.data(); records.push({ listId: list.id, listTitle: String(list.data().title || "Information"), itemId: item.id, title: String(data.title || ""), details: String(data.details || ""), category: String(data.category || ""), itemType: data.itemType || list.data().listType || "custom", phone: String(data.phone || ""), email: String(data.email || ""), url: String(data.url || data.website || ""), website: String(data.website || data.url || ""), address: String(data.address || ""), notes: String(data.notes || ""), date: String(data.date || ""), startDate: String(data.startDate || ""), startTime: String(data.startTime || ""), endTime: String(data.endTime || ""), location: String(data.location || ""), binType: String(data.binType || ""), schedule: data.schedule, timezone: String(data.timezone || ""), enabled: data.enabled !== false }); } }
  return records;
}

async function processJoin(sender: string, token: string) {
  const { db } = getAdminServices(); const tokenHash = createHash("sha256").update(token).digest("hex"); const requests = await db.collection("whatsappLinkRequests").where("tokenHash", "==", tokenHash).limit(1).get();
  if (requests.empty) return "That Circa link is invalid or has already been used. Create a new link from the Community.";
  const requestRef = requests.docs[0].ref; const requestData = requests.docs[0].data(); const expiresAt = requestData.expiresAt instanceof Timestamp ? requestData.expiresAt.toDate() : new Date(requestData.expiresAt);
  if (requestData.status !== "pending" || expiresAt.getTime() <= Date.now()) return "That Circa link has expired. Create a new link from the Community.";
  const memberRef = db.doc(`projects/${requestData.projectId}/members/${requestData.uid}`); const member = await memberRef.get(); if (!member.exists || member.data()?.status !== "active") return "That Community membership is no longer active.";
  const id = phoneHash(sender); const identityRef = db.doc(`whatsappIdentities/${id}`);
  await db.runTransaction(async (transaction) => { const current = await transaction.get(requestRef); if (!current.exists || current.data()?.status !== "pending") throw new Error("That link has already been used."); const identity = await transaction.get(identityRef); if (identity.exists && identity.data()?.uid !== requestData.uid) throw new Error("This WhatsApp number is already linked to another Circa identity."); const communities = [...new Set([...(identity.data()?.communities || []), requestData.projectId])]; transaction.set(identityRef, { uid: requestData.uid, phoneE164: sender, maskedPhone: `•••• ${sender.slice(-4)}`, communities, updatedAt: FieldValue.serverTimestamp(), createdAt: identity.exists ? identity.data()?.createdAt : FieldValue.serverTimestamp(), schemaVersion: 1 }, { merge: true }); transaction.update(requestRef, { status: "used", usedAt: FieldValue.serverTimestamp(), senderHash: id }); transaction.set(db.doc(`projects/${requestData.projectId}/whatsappSubscriptions/${requestData.uid}`), { uid: requestData.uid, identityId: id, questionOptIn: true, reminderOptIn: false, updatedAt: FieldValue.serverTimestamp(), schemaVersion: 1 }, { merge: true }); transaction.update(memberRef, { whatsappConnected: true, maskedPhone: `•••• ${sender.slice(-4)}`, updatedAt: FieldValue.serverTimestamp() }); });
  const project = await db.doc(`projects/${requestData.projectId}`).get(); return `WhatsApp is now linked to ${project.data()?.name || "your Circa Community"}. Ask about approved Community information here. Reminders stay off until you opt in separately.`;
}

async function processQuestion(sender: string, text: string) {
  const { db } = getAdminServices(); const identityRef = db.doc(`whatsappIdentities/${phoneHash(sender)}`); const identity = await identityRef.get();
  if (!identity.exists) return "This WhatsApp number is not linked to Circa. Open your Community in Circa and choose Connect WhatsApp.";
  const communities = identity.data()?.communities as string[] || [];
  if (/^stop\b/i.test(text.trim())) { for (const projectId of communities) await db.doc(`projects/${projectId}/whatsappSubscriptions/${identity.data()?.uid}`).set({ questionOptIn: false, reminderOptIn: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return "Circa WhatsApp messages are now off. You can reconnect or change preferences from the Community site."; }
  const projects = await Promise.all(communities.map((id) => db.doc(`projects/${id}`).get()));
  const named = projects.filter((project) => project.exists && text.toLowerCase().includes(String(project.data()?.name || "").toLowerCase()));
  if (communities.length !== 1 && named.length !== 1) return `Which Community do you mean? Include one of these Community names in your question: ${projects.map((item) => item.data()?.name).filter(Boolean).join(", ")}.`;
  const projectId = named[0]?.id || communities[0]; const subscription = await db.doc(`projects/${projectId}/whatsappSubscriptions/${identity.data()?.uid}`).get(); if (!subscription.exists || subscription.data()?.questionOptIn === false) return "WhatsApp questions are off for this Community. Change your preference in Circa first.";
  const project = projects.find((item) => item.id === projectId); return queryCommunity(text, await approvedRecords(projectId), { timezone: String(project?.data()?.timezone || "Europe/London") }).answer;
}

export default async function handler(request: Request) {
  if (request.method === "GET") { const url = new URL(request.url); const mode = url.searchParams.get("hub.mode"); const token = url.searchParams.get("hub.verify_token"); const challenge = url.searchParams.get("hub.challenge"); if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) return new Response(challenge, { status: 200 }); return new Response("Forbidden", { status: 403 }); }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const raw = new Uint8Array(await request.arrayBuffer()); if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256") || "", process.env.META_APP_SECRET || "")) return new Response("Invalid signature", { status: 401 }); const payload = JSON.parse(new TextDecoder().decode(raw)); const messages = adapter.receive(payload); const { db } = getAdminServices();
    for (const message of messages) { const processedRef = db.doc(`whatsappProcessedMessages/${message.id}`); const claimed = await db.runTransaction(async (transaction) => { const existing = await transaction.get(processedRef); if (existing.exists) return false; transaction.set(processedRef, { senderHash: phoneHash(message.sender), receivedAt: FieldValue.serverTimestamp(), schemaVersion: 1 }); return true; }); if (!claimed) continue; const join = message.text.trim().match(/^JOIN\s+([A-Za-z0-9_-]+)$/i); const reply = join ? await processJoin(message.sender, join[1]) : await processQuestion(message.sender, message.text); await adapter.send(message.sender, reply); }
    return json({ received: true });
  } catch (error) { return errorResponse(error, "Webhook processing failed."); }
}
