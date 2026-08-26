"use client";

import { FormEvent, useMemo, useState } from "react";
import { addPublishedList, deletePublishedItem, saveBinCollection } from "../../cloud/communityRepository";
import type { BinValue, CloudProject, CommunityItem, CommunityList } from "../../cloud/types";
import { dateKeyInTimezone } from "../../shared/communityQueryEngine";
import { SUPPORTED_BINS, binCollectionOccurrences, formatBinCollectionDate, formatBinNames, groupBinCollectionsByMonth, storedBinCollectionFromItem, type BinCollectionRecord } from "../binCollections";
import BinCollectionImportTool from "./BinCollectionImportTool";

type CommunityItems = Record<string, CommunityItem[]>;
type ManagedCollection = BinCollectionRecord & { itemId: string; listId: string };

function collectionItems(lists: CommunityList[], items: CommunityItems) {
  return lists.filter((list) => list.listType === "bin").flatMap((list) => (items[list.id] || []).map((item) => ({ listId: list.id, item })));
}

function BinSchedule({ collections, timezone, emptyCopy }: { collections: BinCollectionRecord[]; timezone: string; emptyCopy: string }) {
  const months = groupBinCollectionsByMonth(collections, timezone);
  if (!months.length) return <div className="paper-panel bin-schedule-empty"><strong>No collection dates published</strong><p>{emptyCopy}</p></div>;
  return <div className="bin-month-list">{months.map((month) => <section className="paper-panel bin-month" key={month.key}><header><p className="eyebrow"><span /> Collection schedule</p><h3>{month.label}</h3></header><div>{month.collections.map((collection) => <div className="bin-collection-row" key={collection.date}><time dateTime={collection.date}>{formatBinCollectionDate(collection.date, timezone)}</time><div className="bin-colour-list" aria-label={formatBinNames(collection.bins)}>{collection.bins.map((bin) => <span className={`bin-colour bin-${bin}`} key={bin}>{bin}</span>)}</div></div>)}</div></section>)}</div>;
}

export function BinCollectionsView({ project, lists, items }: { project: CloudProject; lists: CommunityList[]; items: CommunityItems }) {
  const timezone = project.timezone || "Europe/London";
  const today = dateKeyInTimezone(new Date(), timezone);
  const sourceItems = useMemo(() => collectionItems(lists, items).map(({ item }) => item), [items, lists]);
  const collections = useMemo(() => binCollectionOccurrences(sourceItems, today), [sourceItems, today]);
  return <section className="bin-collections-view"><header className="bin-collections-heading"><p className="eyebrow"><span /> Community schedule</p><h2>Bin Collections</h2><p>Collection dates published by your Community administrators.</p></header><BinSchedule collections={collections} timezone={timezone} emptyCopy="An owner or admin has not added a future collection schedule yet." /></section>;
}

export function BinCollectionsManager({ project, lists, items }: { project: CloudProject; lists: CommunityList[]; items: CommunityItems }) {
  const timezone = project.timezone || "Europe/London";
  const today = dateKeyInTimezone(new Date(), timezone);
  const binLists = lists.filter((list) => list.listType === "bin");
  const entries = useMemo(() => collectionItems(lists, items), [items, lists]);
  const stored = useMemo(() => entries.flatMap(({ listId, item }): ManagedCollection[] => { const collection = storedBinCollectionFromItem(item); return collection ? [{ ...collection, itemId: item.id, listId }] : []; }), [entries]);
  const schedule = useMemo(() => binCollectionOccurrences(entries.map(({ item }) => item), today), [entries, today]);
  const legacyCount = entries.length - stored.length;
  const [createdListId, setCreatedListId] = useState("");
  const [date, setDate] = useState("");
  const [bins, setBins] = useState<BinValue[]>([]);
  const [editing, setEditing] = useState<ManagedCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function ensureList() {
    const existing = createdListId || binLists[0]?.id;
    if (existing) return existing;
    const listId = await addPublishedList(project.id, "Bin collections", "bin", "Structured Community collection schedule.");
    setCreatedListId(listId);
    return listId;
  }

  function resetForm() { setDate(""); setBins([]); setEditing(null); }
  function toggleBin(bin: BinValue) { setBins((current) => current.includes(bin) ? current.filter((value) => value !== bin) : [...current, bin]); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const duplicate = stored.find((collection) => collection.date === date && (!editing || collection.itemId !== editing.itemId || collection.listId !== editing.listId));
      if (duplicate) throw new Error("A collection already exists for that date.");
      const listId = editing?.listId || await ensureList();
      await saveBinCollection(project.id, listId, { date, bins }, editing?.date);
      setMessage(editing ? "Collection updated." : "Collection added."); resetForm();
    } catch (next) { setError(next instanceof Error ? next.message : "Circa could not save that collection."); }
    finally { setBusy(false); }
  }

  async function remove(collection: ManagedCollection) {
    if (!window.confirm(`Delete the collection on ${formatBinCollectionDate(collection.date, timezone)}?`)) return;
    setError("");
    try { await deletePublishedItem(project.id, collection.listId, collection.itemId); if (editing?.itemId === collection.itemId) resetForm(); setMessage("Collection deleted."); }
    catch (next) { setError(next instanceof Error ? next.message : "Circa could not delete that collection."); }
  }

  return <section className="bin-manager"><header className="manage-page-heading"><div><p className="eyebrow"><span /> Structured schedule</p><h2>Bin Collections</h2><p>Add exact local dates, manage the published schedule, or review a JSON import.</p></div><span className="timezone-chip">{timezone}</span></header>
    <div className="bin-manager-layout"><form className="paper-panel bin-collection-form" onSubmit={submit}><div><small>{editing ? "Edit date" : "Add date"}</small><h3>{editing ? formatBinCollectionDate(editing.date, timezone) : "New collection"}</h3></div><label>Collection date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><fieldset><legend>Bins collected</legend><div className="bin-picker">{SUPPORTED_BINS.map((bin) => <label className={`bin-choice bin-${bin}`} key={bin}><input type="checkbox" checked={bins.includes(bin)} onChange={() => toggleBin(bin)} /><span>{bin}</span></label>)}</div></fieldset><div className="bin-form-actions"><button className="button button-dark" disabled={busy || !date || !bins.length}>{busy ? "Saving…" : editing ? "Save changes" : "Add collection"}</button>{editing && <button type="button" className="button button-paper" onClick={resetForm}>Cancel</button>}</div>{message && <p className="admin-success" role="status">{message}</p>}{error && <p className="cloud-warning" role="alert">{error}</p>}</form>
      <section className="paper-panel bin-existing"><div className="admin-panel-title"><div><small>Structured dates</small><strong>Published schedule</strong></div><span>{stored.length}</span></div>{stored.map((collection) => <div className="bin-existing-row" key={`${collection.listId}:${collection.itemId}`}><span><strong>{formatBinNames(collection.bins)}</strong><small>{formatBinCollectionDate(collection.date, timezone)}</small></span><div><button onClick={() => { setEditing(collection); setDate(collection.date); setBins(collection.bins); setMessage(""); setError(""); }}>Edit</button><button className="danger-text" onClick={() => void remove(collection)}>Delete</button></div></div>)}{!stored.length && <div className="admin-empty-state">No structured collection dates have been added yet.</div>}{legacyCount > 0 && <p className="bin-legacy-note">{legacyCount} existing recurring {legacyCount === 1 ? "schedule remains" : "schedules remain"} unchanged. Supported colour schedules appear in the preview; other legacy labels remain available in Content.</p>}</section></div>
    <section className="bin-manager-preview"><header><h3>Community schedule preview</h3><p>Members see these dates grouped by month.</p></header><BinSchedule collections={schedule} timezone={timezone} emptyCopy="Add a collection date or import a schedule to publish it to members." /></section>
    <BinCollectionImportTool projectId={project.id} timezone={timezone} ensureList={ensureList} />
  </section>;
}
