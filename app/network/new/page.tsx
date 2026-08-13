"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createNetwork } from "../../cloud/networkRepository";
import { useFirebaseUser } from "../../firebase/FirebaseProvider";

export default function CreateNetworkPage() {
  const router = useRouter();
  const { user, loading } = useFirebaseUser(); const [name, setName] = useState("My Professional Network"); const [description, setDescription] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (!user || user.isAnonymous) return; setBusy(true); try { const projectId = await createNetwork(user, name, description); router.push(`/network/${projectId}/import`); } catch (next) { setError(next instanceof Error ? next.message : "Circa could not create this Network."); setBusy(false); } }
  return <main className="cloud-page"><header className="cloud-header"><a className="brand" href="/"><span className="brand-mark"><i /><i /></span><span className="brand-name">Circa<sup>beta</sup></span></a><a href="/">Back to Circa</a></header><section className="cloud-hero"><p className="eyebrow"><span /> Circa Networks</p><h1>Bring in<br /><em>your network.</em></h1><p>Import your own LinkedIn connections export, then explore only the pathways supported by real stored connections.</p></section><section className="paper-panel create-community-panel">{loading ? <p>Checking your account…</p> : !user || user.isAnonymous ? <div className="auth-required"><h2>Create your Circa account to import and protect your network.</h2><p>Professional connection data cannot be stored under a temporary Community identity.</p><a className="button button-dark" href="/auth?returnTo=/network/new">Create account or sign in</a></div> : <form className="community-form" onSubmit={submit}><label>Network name<input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label><label>Description <small>optional</small><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={800} placeholder="What you want to understand about this network" /></label><div className="privacy-callout"><strong>Private by default</strong><p>Imported connections stay private. Joining does not share anything. Network contribution is a separate, reversible choice.</p></div><button className="button button-dark" disabled={busy}>{busy ? "Creating…" : "Create Network"}</button>{error && <p role="alert">{error}</p>}</form>}</section></main>;
}
