"use client";

import { User, onAuthStateChanged } from "firebase/auth";
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { syncProfileSafely } from "./auth";
import { firebaseConfigured, getFirebaseServices } from "./client";

type FirebaseContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  profileSyncWarning: string;
};

const FirebaseContext = createContext<FirebaseContextValue>({ user: null, loading: true, configured: true, profileSyncWarning: "" });

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const configured = firebaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [profileSyncWarning, setProfileSyncWarning] = useState("");
  const [firebaseError, setFirebaseError] = useState("");

  useEffect(() => {
    if (!configured) return;
    let unsubscribe: () => void = () => undefined;
    const timeout = window.setTimeout(() => { setFirebaseError("Circa could not reach its cloud services. Check your connection and retry."); setLoading(false); }, 12_000);
    try {
      const { auth } = getFirebaseServices();
      unsubscribe = onAuthStateChanged(auth, (next) => {
        window.clearTimeout(timeout);
        setUser(next);
        setLoading(false);
        if (next) void syncProfileSafely(next).then((result) => setProfileSyncWarning(result.profileSyncError || ""));
        else setProfileSyncWarning("");
      }, () => { window.clearTimeout(timeout); setFirebaseError("Circa could not verify this cloud session. Retry or return to Personal Maps."); setLoading(false); });
    } catch { window.clearTimeout(timeout); queueMicrotask(() => { setFirebaseError("Circa cloud is not configured or is temporarily unavailable."); setLoading(false); }); }
    return () => { window.clearTimeout(timeout); unsubscribe(); };
  }, [configured]);

  const value = useMemo(() => ({ user, loading, configured, profileSyncWarning }), [user, loading, configured, profileSyncWarning]);
  if (!configured || firebaseError) return <main className="cloud-page centred-state cloud-unavailable" role="alert"><h1>Circa cloud is unavailable.</h1><p>{firebaseError || "This cloud feature has not been configured on this release."}</p><div><button className="button button-paper" onClick={() => window.location.reload()}>Retry</button><a className="button button-dark" href="/?workspace=1">Open Personal Maps</a></div></main>;
  return <FirebaseContext.Provider value={value}>{children}{profileSyncWarning && <aside className="profile-sync-warning" role="status">{profileSyncWarning}</aside>}</FirebaseContext.Provider>;
}

export function useFirebaseUser() {
  return useContext(FirebaseContext);
}
