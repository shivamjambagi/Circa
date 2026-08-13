"use client";

import { useEffect, useState } from "react";
import { Workspace } from "../graphStore";
import { getLocalMigrationStatus, migrateLocalWorkspace, MigrationStatus } from "./migration";
import { useFirebaseUser } from "./FirebaseProvider";

export function CloudMigrationCard({ workspace }: { workspace: Workspace }) {
  const { user } = useFirebaseUser();
  const [status, setStatus] = useState<MigrationStatus>("not-needed");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    void getLocalMigrationStatus(user, workspace).then(setStatus).catch(() => setStatus("available"));
  }, [user, workspace]);

  if (!user || user.isAnonymous || status === "not-needed") return null;
  if (status === "complete") return <aside className="cloud-migration-card complete"><strong>Cloud copy ready</strong><p>Your verified cloud copy exists. Your original local workspace remains in this browser.</p></aside>;
  return <aside className="cloud-migration-card">
    <strong>Keep a cloud copy?</strong>
    <p>Circa can copy these local Projects to your account. Nothing is removed from this browser, and a recovery backup is kept.</p>
    <button className="button button-paper" disabled={busy} onClick={async () => { setBusy(true); setMessage(""); try { await migrateLocalWorkspace(user, workspace); setStatus("complete"); setMessage("Cloud copy verified. Your local data is still here."); } catch (error) { setMessage(error instanceof Error ? error.message : "Circa could not finish the cloud copy."); } finally { setBusy(false); } }}>{busy ? "Copying safely…" : "Copy Projects to cloud"}</button>
    {message && <p role="status">{message}</p>}
  </aside>;
}
