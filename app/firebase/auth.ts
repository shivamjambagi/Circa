"use client";

import { EmailAuthProvider, GoogleAuthProvider, User, createUserWithEmailAndPassword, linkWithCredential, linkWithPopup, sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { clearFirebaseCloudCache, getFirebaseServices } from "./client";
import { friendlyAuthMessage, settleAuthenticatedUser } from "./authLogic";

export type AuthResult = {
  user: User | null;
  profileSynced: boolean;
  profileSyncError?: string;
  redirectStarted?: boolean;
};

export async function ensureUserDocument(user: User) {
  const { db } = getFirebaseServices();
  const ref = doc(db, "users", user.uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const profile = {
      uid: user.uid,
      displayName: user.displayName || null,
      email: user.email || null,
      photoURL: user.photoURL || null,
      accountType: user.isAnonymous ? "anonymous" : "permanent",
      isAnonymous: user.isAnonymous,
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
    };
    if (snapshot.exists()) transaction.set(ref, profile, { merge: true });
    else transaction.set(ref, { ...profile, createdAt: serverTimestamp() });
  });
}

export async function syncProfileSafely(user: User, sync: (user: User) => Promise<void> = ensureUserDocument): Promise<AuthResult> {
  const result = await settleAuthenticatedUser(user, sync);
  if (!result.profileSynced) console.error("Circa profile synchronisation failed after authentication.", result.error);
  return { user: result.user, profileSynced: result.profileSynced, ...(!result.profileSynced ? { profileSyncError: result.profileSyncError } : {}) };
}

export async function emailSignUp(email: string, password: string, displayName: string) {
  const { auth } = getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName.trim()) await updateProfile(credential.user, { displayName: displayName.trim().slice(0, 80) });
  return syncProfileSafely(credential.user);
}

export async function emailSignIn(email: string, password: string) {
  const { auth } = getFirebaseServices();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return syncProfileSafely(credential.user);
}

export async function googleSignIn() {
  const { auth } = getFirebaseServices();
  const provider = new GoogleAuthProvider();
  try {
    const credential = await signInWithPopup(auth, provider);
    return syncProfileSafely(credential.user);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code.includes("popup-blocked")) {
      await signInWithRedirect(auth, provider);
      return { user: null, profileSynced: false, redirectStarted: true };
    }
    throw error;
  }
}

export async function beginAnonymousCommunitySession() {
  const { auth } = getFirebaseServices();
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  void syncProfileSafely(credential.user);
  return credential.user;
}

export async function upgradeAnonymousWithEmail(email: string, password: string, displayName = "") {
  const { auth } = getFirebaseServices();
  if (!auth.currentUser?.isAnonymous) return emailSignUp(email, password, displayName);
  const credential = EmailAuthProvider.credential(email.trim(), password);
  const linked = await linkWithCredential(auth.currentUser, credential);
  if (displayName.trim()) await updateProfile(linked.user, { displayName: displayName.trim().slice(0, 80) });
  return syncProfileSafely(linked.user);
}

export async function upgradeAnonymousWithGoogle() {
  const { auth } = getFirebaseServices();
  if (!auth.currentUser?.isAnonymous) return googleSignIn();
  const linked = await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
  return syncProfileSafely(linked.user);
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(getFirebaseServices().auth, email.trim());
}

export async function signOutOfCirca() {
  const { auth } = getFirebaseServices();
  await signOut(auth);
  await clearFirebaseCloudCache();
}

export function friendlyAuthError(error: unknown) {
  console.error("Circa authentication request failed.", error);
  return friendlyAuthMessage(error);
}
