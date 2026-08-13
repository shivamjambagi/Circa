import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { Auth, getAuth } from "firebase-admin/auth";

let adminApp: App | null = null;

export function adminConfigured() {
  return Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY);
}

export function getAdminServices(): { app: App; auth: Auth; db: Firestore } {
  if (!adminConfigured()) throw new Error("Firebase Admin is not configured.");
  if (!adminApp) adminApp = getApps()[0] || initializeApp({ credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
  return { app: adminApp, auth: getAuth(adminApp), db: getFirestore(adminApp) };
}

export async function verifyFirebaseRequest(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Sign in is required.");
  return getAdminServices().auth.verifyIdToken(token, true);
}
