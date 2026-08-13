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

  useEffect(() => {
    if (!configured) return;
    let unsubscribe: () => void = () => undefined;
    try {
      const { auth } = getFirebaseServices();
      unsubscribe = onAuthStateChanged(auth, (next) => {
        setUser(next);
        setLoading(false);
        if (next) void syncProfileSafely(next).then((result) => setProfileSyncWarning(result.profileSyncError || ""));
        else setProfileSyncWarning("");
      }, () => setLoading(false));
    } catch { queueMicrotask(() => setLoading(false)); }
    return unsubscribe;
  }, [configured]);

  const value = useMemo(() => ({ user, loading, configured, profileSyncWarning }), [user, loading, configured, profileSyncWarning]);
  return <FirebaseContext.Provider value={value}>{children}{profileSyncWarning && <aside className="profile-sync-warning" role="status">{profileSyncWarning}</aside>}</FirebaseContext.Provider>;
}

export function useFirebaseUser() {
  return useContext(FirebaseContext);
}
