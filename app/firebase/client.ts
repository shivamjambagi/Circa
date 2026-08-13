"use client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from "firebase/app-check";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";
import { Auth, browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { Firestore, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDsSYguV1Y1If_SqrKvYr05cH9PN0b-KDA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "circa-4bea4.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "circa-4bea4",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "circa-4bea4.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "551343145367",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:551343145367:web:37cebecc12eac6713944d2",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-GLBV318TDK",
};

const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY || "6Leb-lEtAAAAAJVLLrjf2-P9_VsmU-94LMH5MhA3";

export type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore };

let services: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (services) return services;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  if (typeof window !== "undefined") {
    try {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG === "true") {
        (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
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

  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_FIREBASE_ANALYTICS_ENABLED === "true") {
    void analyticsIsSupported().then((supported) => { if (supported) getAnalytics(app); }).catch(() => undefined);
  }
  services = { app, auth, db };
  return services;
}

export function firebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}
