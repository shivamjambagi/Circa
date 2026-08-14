"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudMigrationCard } from "../firebase/CloudMigrationCard";
import { emailSignIn, emailSignUp, friendlyAuthError, googleSignIn, resetPassword, signOutOfCirca, upgradeAnonymousWithEmail, upgradeAnonymousWithGoogle } from "../firebase/auth";
import { useFirebaseUser } from "../firebase/FirebaseProvider";
import { safeReturnTo } from "../firebase/authLogic";
import { Workspace, createEmptyWorkspace, createWorkspaceStore } from "../graphStore";

function Mark() { return <span className="brand-mark" aria-hidden="true"><i /><i /></span>; }

export default function AuthPage() {
  const router = useRouter();
  const { user, loading, profileSyncWarning } = useFirebaseUser();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>(() => createEmptyWorkspace());
  const [returnTo, setReturnTo] = useState("/account");
  const context = returnTo.startsWith("/start") || returnTo.includes("workspace=1") ? "Sign in once, then choose whether you want a private Personal Map or a shared Community." : returnTo.startsWith("/community/new") ? "Create an account to create and manage a shared Community." : returnTo.startsWith("/network") ? "Create an account to import and protect your professional network." : "Keep your Communities, Networks and optional cloud features with you.";

  useEffect(() => {
    const timer = window.setTimeout(() => setReturnTo(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"))), 0);
    void createWorkspaceStore().loadWorkspace().then(setWorkspace).catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = user?.isAnonymous ? await upgradeAnonymousWithEmail(email, password, name) : mode === "signup" ? await emailSignUp(email, password, name) : await emailSignIn(email, password);
      setMessage(result.profileSyncError || "You are signed in. Continue when you are ready.");
      if (result.user) router.replace(returnTo);
    } catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  return <main className="cloud-page auth-page">
    <header className="cloud-header"><a className="brand" href="/"><Mark /><span className="brand-name">Circa<sup>beta</sup></span></a><a href="/">Back to Circa</a></header>
    <section className="auth-editorial"><div className="auth-story"><p className="eyebrow"><span /> Your Circa account</p><h1>Welcome to<br /><em>Circa.</em></h1><p>{context}</p><div className="auth-sketch" aria-hidden="true"><i>You</i><span /><i>Community</i><span /><i>Network</i></div></div><div className="auth-card paper-panel">
      <h2>{user && !user.isAnonymous ? "Account ready." : user?.isAnonymous ? "Keep your Community membership." : mode === "signup" ? "Create your account." : "Continue securely."}</h2>
      {loading ? <p role="status">Checking your Circa session…</p> : user && !user.isAnonymous ? <>
        <p>Signed in as <strong>{user.displayName || user.email}</strong>.</p>
        <div className="auth-success-actions"><a className="button button-dark" href={returnTo}>Continue</a><a className="button button-paper" href="/">Open Circa</a><button className="button button-paper" onClick={() => void signOutOfCirca()}>Sign out</button></div>
        <CloudMigrationCard workspace={workspace} />
      </> : <>
        {user?.isAnonymous && <p className="warm-notice">You joined a Community as a temporary member. Upgrade this identity so your membership stays with you—Circa will link the account rather than create a second member.</p>}
        <button className="button button-paper google-button" disabled={busy} onClick={async () => { setBusy(true); setMessage(""); try { const result = user?.isAnonymous ? await upgradeAnonymousWithGoogle() : await googleSignIn(); if (result.redirectStarted) setMessage("Opening secure Google sign-in…"); else if (result.user) { setMessage(result.profileSyncError || "You are signed in."); router.replace(returnTo); } } catch (error) { setMessage(friendlyAuthError(error)); } finally { setBusy(false); } }}>Continue with Google</button>
        <div className="auth-divider"><span>or use email</span></div>
        <form className="auth-form" onSubmit={submit}>
          {(mode === "signup" || user?.isAnonymous) && <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>}
          <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input required minLength={6} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="button button-dark" disabled={busy}>{busy ? "Please wait…" : user?.isAnonymous ? "Upgrade this account" : mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        {!user?.isAnonymous && <div className="auth-links"><button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Create an account" : "Already have an account?"}</button>{mode === "signin" && <button disabled={!email.trim()} onClick={async () => { try { await resetPassword(email); setMessage("Password reset email sent."); } catch (error) { setMessage(friendlyAuthError(error)); } }}>Reset password</button>}</div>}
      </>}
      {(message || profileSyncWarning) && <p className="form-message" role="status">{message || profileSyncWarning}</p>}
    </div></section>
  </main>;
}
