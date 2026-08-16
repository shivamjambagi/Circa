"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import type { CommunityItem } from "../../cloud/types";
import { importPublishedDirectoryItems } from "../../cloud/communityRepository";

type SeedFile = {
  version?: number;
  source?: string;
  policy?: string;
  contactCount?: number;
  contacts?: Array<Partial<CommunityItem>>;
};

function categorySummary(items: Array<Partial<CommunityItem>>) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const category = String(item.category || "Other").trim() || "Other";
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
}

function validateSeed(value: unknown): SeedFile {
  if (!value || typeof value !== "object") throw new Error("That file is not a valid Circa directory seed.");
  const seed = value as SeedFile;
  if (!Array.isArray(seed.contacts) || !seed.contacts.length) throw new Error("No contacts were found in that seed file.");
  if (seed.contacts.length > 400) throw new Error("Circa imports up to 400 contacts at a time.");
  seed.contacts.forEach((item, index) => {
    if (!item || typeof item !== "object" || !String(item.title || "").trim()) {
      throw new Error(`Contact ${index + 1} is missing a name.`);
    }
  });
  return seed;
}

export default function DirectoryImportTool({
  projectId,
  listId,
  listTitle,
}: {
  projectId: string;
  listId: string;
  listTitle: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [seed, setSeed] = useState<SeedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const contacts = useMemo(() => seed?.contacts ?? [], [seed]);
  const categories = useMemo(() => categorySummary(contacts), [contacts]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setStatus("");
    setSeed(null);
    setFileName("");
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const validated = validateSeed(parsed);
      setSeed(validated);
      setFileName(file.name);
    } catch (next) {
      setError(next instanceof Error ? next.message : "Circa could not read that seed file.");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importContacts() {
    if (!seed?.contacts?.length || busy) return;
    const confirmed = window.confirm(
      `Import ${seed.contacts.length} curated contacts into "${listTitle}"?\n\n` +
      "Re-running the same seed updates the imported records instead of creating duplicates."
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setStatus(`Importing ${seed.contacts.length} contacts…`);

    try {
      const result = await importPublishedDirectoryItems(projectId, listId, seed.contacts);
      setStatus(`${result.count} contacts imported or updated in ${listTitle}.`);
    } catch (next) {
      setError(next instanceof Error ? next.message : "Circa could not import the directory.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="directory-import-card" aria-labelledby="directory-import-title">
      <header>
        <div>
          <p className="eyebrow"><span /> Private directory import</p>
          <h3 id="directory-import-title">Bring in curated contacts</h3>
          <p>
            Choose a private Circa seed file. The file is read locally in your browser,
            then the selected contacts are written to this Community.
          </p>
        </div>
        <span className="directory-import-target">{listTitle}</span>
      </header>

      <div className="directory-import-drop">
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={(event) => void chooseFile(event)}
          aria-label="Choose Circa directory seed JSON"
        />
        <div>
          <strong>{fileName || "Choose private directory JSON"}</strong>
          <small>No raw WhatsApp export is uploaded by this tool.</small>
        </div>
      </div>

      {seed && (
        <div className="directory-import-preview">
          <div className="directory-import-count">
            <strong>{contacts.length}</strong>
            <span>contacts ready</span>
          </div>
          <div className="directory-import-categories">
            {categories.map(([category, count]) => (
              <span key={category}>{category}<strong>{count}</strong></span>
            ))}
          </div>
          {seed.policy && <p>{seed.policy}</p>}
          <button className="button button-dark" disabled={busy} onClick={() => void importContacts()}>
            {busy ? "Importing…" : `Import ${contacts.length} contacts`}
          </button>
        </div>
      )}

      {status && <p className="directory-import-success" role="status">{status}</p>}
      {error && <p className="directory-import-error" role="alert">{error}</p>}
    </section>
  );
}
