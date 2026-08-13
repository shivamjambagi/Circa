import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminServices, verifyFirebaseRequest } from "../../server/firebaseAdmin";
import { errorResponse, json } from "./_shared/http";

const Input = z.object({ projectId: z.string().min(8).max(180) });

export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const decoded = await verifyFirebaseRequest(request); const { projectId } = Input.parse(await request.json()); const { db } = getAdminServices(); const memberRef = db.doc(`projects/${projectId}/members/${decoded.uid}`); const subscriptionRef = db.doc(`projects/${projectId}/whatsappSubscriptions/${decoded.uid}`);
    await db.runTransaction(async (transaction) => {
      const [member, subscription] = await Promise.all([transaction.get(memberRef), transaction.get(subscriptionRef)]); if (!member.exists || member.data()?.status !== "active") throw new Error("Active Community membership is required.");
      if (subscription.exists && subscription.data()?.identityId) { const identityRef = db.doc(`whatsappIdentities/${subscription.data()!.identityId}`); const identity = await transaction.get(identityRef); if (identity.exists && identity.data()?.uid === decoded.uid) transaction.update(identityRef, { communities: (identity.data()?.communities || []).filter((id: string) => id !== projectId), updatedAt: FieldValue.serverTimestamp() }); }
      if (subscription.exists) transaction.delete(subscriptionRef); transaction.update(memberRef, { whatsappConnected: false, reminderOptIn: false, maskedPhone: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    });
    return json({ disconnected: true });
  } catch (error) { return errorResponse(error); }
}
