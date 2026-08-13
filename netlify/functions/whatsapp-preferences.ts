import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, verifyFirebaseRequest } from "../../server/firebaseAdmin";
import { errorResponse, json } from "./_shared/http";

const Input = z.object({ projectId: z.string().min(8).max(180), questionOptIn: z.boolean(), reminderCategories: z.array(z.enum(["bins", "events", "announcements"])).max(3) });

export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const decoded = await verifyFirebaseRequest(request); const input = Input.parse(await request.json()); const { db } = getAdminServices(); const memberRef = db.doc(`projects/${input.projectId}/members/${decoded.uid}`); const member = await memberRef.get(); if (!member.exists || member.data()?.status !== "active") throw new Error("Active Community membership is required."); const subscriptionRef = db.doc(`projects/${input.projectId}/whatsappSubscriptions/${decoded.uid}`); const subscription = await subscriptionRef.get(); if (!subscription.exists) throw new Error("Connect WhatsApp before changing preferences."); const reminderOptIn = input.reminderCategories.length > 0; const batch = db.batch(); batch.set(subscriptionRef, { questionOptIn: input.questionOptIn, reminderCategories: input.reminderCategories, reminderOptIn, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); batch.update(memberRef, { reminderOptIn, updatedAt: FieldValue.serverTimestamp() }); await batch.commit(); return json({ questionOptIn: input.questionOptIn, reminderCategories: input.reminderCategories });
  } catch (error) { return errorResponse(error); }
}
