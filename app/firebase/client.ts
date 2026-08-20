"use client";

import { FirebaseApp, deleteApp, getApp, getApps, initializeApp } from "firebase/app";
import { AppCheck, ReCaptchaEnterpriseProvider, initializeAppCheck } from "firebase/app-check";
import { Auth, browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { Firestore, clearIndexedDbPersistence, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate } from "firebase/firestore";

function requireFirebaseEnv(name: string, value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }

  return value.trim();
}

function readFirebaseEnvironment() {
  return {
    config: {
      apiKey: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      authDomain: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
      projectId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      storageBucket: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
      messagingSenderId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
      appId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    },
    appCheckSiteKey: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY", process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY),
  };
}

export type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore; appCheck?: AppCheck };

let services: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (services) return services;
  const { config, appCheckSiteKey } = readFirebaseEnvironment();
  const app = getApps().length ? getApp() : initializeApp(config);

  let appCheck: AppCheck | undefined;
  if (typeof window !== "undefined") {
    try {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG === "true") {
        (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.info("Circa App Check already initialised or unavailable in this preview.", error);
    }
  }

  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  let db: Firestore;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = getFirestore(app);
  }

  services = { app, auth, db, appCheck };
  return services;
}

export function firebaseConfigured() {
  return [
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY,
  ].every((value) => Boolean(value?.trim()));
}

export async function clearFirebaseCloudCache() {
  const current = services;
  if (!current) return;
  services = null;
  try { await terminate(current.db); await clearIndexedDbPersistence(current.db); }
  finally { await deleteApp(current.app).catch(() => undefined); }
}
