"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { importBinCollections } from "../../cloud/communityRepository";
import { groupBinCollectionsByMonth, parseBinCollectionImport, type BinCollectionInput } from "../binCollections";

const MAX_IMPORT_BYTES = 256 * 1024;

export default function BinCollectionImportTool({ projectId, timezone, ensureList }: { projectId: string; timezone: string; ensureList: () => Promise<string> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [collections, setCollections] = useState<BinCollectionInput[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const months = useMemo(() => groupBinCollectionsByMonth(collections.map((collection) => ({ id: collection.date, ...collection })), timezone), [collections, timezone]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCollections([]); setFileName(""); setError(""); setStatus("");
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Choose a bin collection JSON file smaller than 256 KB.");
      const parsed = JSON.parse(await file.text());
      setCollections(parseBinCollectionImport(parsed));
      setFileName(file.name);
    } catch (next) {
      setError(next instanceof Error ? next.message : "Circa could not read that collection file.");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!collections.length || busy) return;
    setBusy(true); setError(""); setStatus(`Importing ${collections.length} collection dates…`);
    try {
      const listId = await ensureList();
      const result = await importBinCollections(projectId, listId, collections);
      setStatus(`${result.count} collection dates imported or updated. Re-importing this schedule will reuse the same dates.`);
    } catch (next) {
      setError(next instanceof Error ? next.message : "Circa could not import that collection schedule.");
      setStatus("");
    } finally { setBusy(false); }
  }

  return <section className="paper-panel bin-import-card" aria-labelledby="bin-import-title">
    <header><div><p className="eyebrow"><span /> JSON import</p><h3 id="bin-import-title">Import collection dates</h3><p>The file is parsed and validated locally. Review the months below before importing.</p></div></header>
    <label className="bin-import-file"><input ref={inputRef} type="file" accept=".json,application/json" onChange={(event) => void chooseFile(event)} /><span><strong>{fileName || "Choose collection JSON"}</strong><small>Up to 400 dates · green, blue, grey and brown bins only</small></span></label>
    {collections.length > 0 && <div className="bin-import-review"><strong>{collections.length} dates ready across {months.length} {months.length === 1 ? "month" : "months"}</strong><div>{months.map((month) => <span key={month.key}>{month.label}<strong>{month.collections.length}</strong></span>)}</div><button className="button button-dark" disabled={busy} onClick={() => void confirmImport()}>{busy ? "Importing…" : `Confirm import of ${collections.length} dates`}</button></div>}
    {status && <p className="admin-success" role="status">{status}</p>}
    {error && <p className="cloud-warning" role="alert">{error}</p>}
  </section>;
}
