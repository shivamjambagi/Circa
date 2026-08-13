"use client";

import { useEffect, useMemo, useState } from "react";
import { listMemberProjects } from "../cloud/communityRepository";
import { useFirebaseUser } from "../firebase/FirebaseProvider";

type Membership = { id: string; projectId: string; projectName: string; projectMode: string; role: string; status: string };

export default function AccountPage() {
  const { user, loading, profileSyncWarning } = useFirebaseUser();
  const [memberships, setMemberships] = useState<Membership[]>([]); const [error, setError] = useState("");
  useEffect(() => { if (!user || user.isAnonymous) return; void listMemberProjects(user.uid).then(setMemberships).catch((next) => setError(next instanceof Error ? next.message : "Circa could not load your shared spaces.")); }, [user]);
  const groups = useMemo(() => ({ communities: memberships.filter((item) => item.projectMode === "community"), networks: memberships.filter((item) => item.projectMode === "network") }), [memberships]);
  if (loading) return <main className="cloud-page centred-state" role="status">Opening your Circa…</main>;
  if (!user || user.isAnonymous) return <main className="cloud-page centred-state"><h1>Sign in to see your shared Circa spaces.</h1><a className="button button-dark" href="/auth?returnTo=/account">Sign in</a></main>;
  return <main className="cloud-page account-page"><header className="cloud-header"><a className="brand" href="/"><span className="brand-mark"><i /><i /></span><span className="brand-name">Circa<sup>beta</sup></span></a><a href="/">Open local workspace</a></header><section className="account-heading"><p className="eyebrow"><span /> Your Circa</p><h1>Welcome back,<br /><em>{user.displayName?.split(/\s+/)[0] || "friend"}.</em></h1><p>Personal maps stay local by default. Shared Communities and Networks live with your account.</p></section>{profileSyncWarning && <p className="cloud-warning" role="status">{profileSyncWarning}</p>}{error && <p className="cloud-warning" role="alert">{error}</p>}<section className="account-grid"><article className="paper-panel account-local"><small>Local workspace</small><h2>Your private maps</h2><p>Open the browser-based workspace and continue sketching without moving anything to the cloud.</p><a className="button button-paper" href="/">Open local workspace</a></article><AccountCollection title="Communities" items={groups.communities} empty="You have not joined a Community yet." hrefPrefix="/community" actionHref="/community/new" action="Create Community" /><AccountCollection title="Networks" items={groups.networks} empty="You have not created or joined a Network yet." hrefPrefix="/network" actionHref="/network/new" action="Create Network" /></section></main>;
}

function AccountCollection({ title, items, empty, hrefPrefix, actionHref, action }: { title: string; items: Membership[]; empty: string; hrefPrefix: string; actionHref: string; action: string }) {
  return <article className="paper-panel account-collection"><header><div><small>Shared with your account</small><h2>{title}</h2></div><a href={actionHref}>{action} +</a></header>{items.length ? <div className="account-rows">{items.map((item) => <a key={item.id} href={`${hrefPrefix}/${item.projectId}`}><span><strong>{item.projectName || `Untitled ${title.slice(0, -1)}`}</strong><small>{item.role === "owner" ? "Owner" : item.role === "admin" ? "Admin" : "Member"}</small></span><i>Open →</i></a>)}</div> : <p className="quiet">{empty}</p>}</article>;
}
