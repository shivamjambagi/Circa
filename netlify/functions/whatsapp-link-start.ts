import { FieldValue } from "firebase-admin/firestore";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAdminServices, verifyFirebaseRequest } from "../../server/firebaseAdmin";
import { enforceRateLimit } from "../../server/rateLimit";
import { errorResponse, json } from "./_shared/http";

const Input = z.object({ projectId: z.string().min(8).max(180), connectionConsent: z.literal(true) });

export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!process.env.CIRCA_WHATSAPP_NUMBER || !process.env.META_WHATSAPP_ACCESS_TOKEN) return json({ error: "WhatsApp integration is not available for this Community yet." }, 503);
  try {
    const decoded = await verifyFirebaseRequest(request); const input = Input.parse(await request.json()); await enforceRateLimit(`wa-link:${decoded.uid}`, 5, 900);
    const { db } = getAdminServices(); const member = await db.doc(`projects/${input.projectId}/members/${decoded.uid}`).get();
    if (!member.exists || member.data()?.status !== "active") throw new Error("Active Community membership is required.");
    const project = await db.doc(`projects/${input.projectId}`).get(); if (!project.exists || project.data()?.projectMode !== "community") throw new Error("That Community is unavailable.");
    const token = randomBytes(24).toString("base64url"); const tokenHash = createHash("sha256").update(token).digest("hex"); const expiresAt = new Date(Date.now() + 12 * 60 * 1000); const ref = db.collection("whatsappLinkRequests").doc();
    await ref.set({ tokenHash, uid: decoded.uid, projectId: input.projectId, status: "pending", connectionConsent: true, createdAt: FieldValue.serverTimestamp(), expiresAt, schemaVersion: 1 });
    const number = process.env.CIRCA_WHATSAPP_NUMBER.replace(/\D/g, ""); const message = encodeURIComponent(`JOIN ${token}`);
    return json({ deepLink: `https://wa.me/${number}?text=${message}`, expiresAt: expiresAt.toISOString() });
  } catch (error) { return errorResponse(error); }
}
