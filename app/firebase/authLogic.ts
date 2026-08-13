export type AuthErrorLike = { code?: unknown; message?: unknown };

export async function settleAuthenticatedUser<T>(user: T, sync: (user: T) => Promise<void>) {
  try {
    await sync(user);
    return { user, profileSynced: true as const };
  } catch (error) {
    return { user, profileSynced: false as const, profileSyncError: "You are signed in, but Circa could not synchronise your cloud profile. Your session is still active.", error };
  }
}

export function safeReturnTo(value: string | null | undefined, fallback = "/account") {
  if (!value) return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  try {
    const parsed = new URL(candidate, "https://circa.local");
    if (parsed.origin !== "https://circa.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function friendlyAuthMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as AuthErrorLike).code || "") : "";
  if (/wrong-password|invalid-credential|user-not-found/.test(code)) return "That email and password do not match.";
  if (code.includes("email-already-in-use")) return "An account already uses that email. Sign in instead.";
  if (code.includes("weak-password")) return "Choose a password with at least six characters.";
  if (code.includes("unauthorized-domain")) return "Google sign-in is not available from this address. Please open the main Circa site and try again.";
  if (code.includes("popup-blocked")) return "Your browser blocked the Google sign-in window. Circa is opening a secure redirect instead.";
  if (code.includes("popup-closed")) return "The Google sign-in window was closed before finishing.";
  if (code.includes("network-request-failed")) return "Circa could not reach the sign-in service. Check your connection and try again.";
  if (code.includes("too-many-requests")) return "Too many sign-in attempts were made. Wait a little, then try again.";
  if (code.includes("operation-not-allowed")) return "That sign-in method is not available right now. Choose another method or contact the Community owner.";
  if (/credential-already-in-use|account-exists-with-different-credential/.test(code)) return "That email already belongs to another sign-in method. Sign in with the method you used before.";
  if (/permission-denied|firestore/.test(code)) return "You are signed in, but Circa could not access your cloud data. Please try again after the cloud configuration has been verified.";
  return "Circa could not complete that sign-in request. Please try again.";
}
