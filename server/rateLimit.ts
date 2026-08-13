import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { getAdminServices } from "./firebaseAdmin";

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const { db } = getAdminServices(); const bucket = Math.floor(Date.now() / (windowSeconds * 1000)); const id = createHash("sha256").update(`${key}:${bucket}`).digest("hex"); const ref = db.collection("serverRateLimits").doc(id);
  await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); const count = Number(snapshot.data()?.count || 0); if (count >= limit) throw new Error("Too many requests. Please wait a moment and try again."); transaction.set(ref, { count: FieldValue.increment(1), expiresAt: new Date((bucket + 2) * windowSeconds * 1000), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
}
