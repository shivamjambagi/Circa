"use client";

import { User } from "firebase/auth";
import { DocumentData, DocumentSnapshot, Timestamp, WriteBatch, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { getFirebaseServices } from "../firebase/client";
import type { CloudProject, CommunityItem, CommunityList, CommunityListType, CommunityMember, CommunityMemberSummary, EditProposal, PreviewSection, PublicInvite } from "./types";
import { binCollectionItem, parseBinCollectionImport, validateBinCollection, validateBinDate, type BinCollectionInput } from "../community/binCollections";

const DEFAULT_SECTIONS: Array<{ title: string; listType: CommunityListType; description: string }> = [
  { title: "Local services", listType: "directory", description: "Trusted contacts and useful local services." },
  { title: "Bin collections", listType: "bin", description: "Community collection schedule." },
  { title: "Schools", listType: "school", description: "Local school information." },
  { title: "Events", listType: "event", description: "Community meetings and upcoming events." },
  { title: "Useful contacts", listType: "contact", description: "Council and other useful information." },
];

function safeText(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function cleanObject<T extends Record<string, unknown>>(value: T) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T; }

function membershipIndex(project: CloudProject | { id: string; name: string; projectMode: string }, role: string, status = "active") {
  return { projectId: project.id, projectName: project.name, projectMode: project.projectMode, role, status, updatedAt: serverTimestamp(), schemaVersion: 1 };
}

function currentUid() {
  const uid = getFirebaseServices().auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in before changing Community information.");
  return uid;
}

function addModerationEvent(batch: WriteBatch, projectId: string, action: string, actorUid: string, targetId: string, details: Record<string, unknown> = {}) {
  const ref = doc(collection(getFirebaseServices().db, "projects", projectId, "moderationEvents"));
  batch.set(ref, { action, actorUid, targetId: safeText(targetId, 200), details: cleanObject(details), schemaVersion: 1, createdAt: serverTimestamp() });
}

function publicMemberDisplayName(value: unknown, role: CommunityMember["role"]) {
  const displayName = safeText(value, 80);
  if (displayName && !displayName.includes("@")) return displayName;
  return role === "owner" ? "Community owner" : role === "admin" ? "Community admin" : "Community member";
}

function memberDirectoryPayload(member: { uid: string; displayName?: string; role: CommunityMember["role"]; status?: CommunityMember["status"]; joinedAt?: unknown }) {
  return { uid: member.uid, displayName: publicMemberDisplayName(member.displayName, member.role), role: member.role, status: member.status || "active", joinedAt: member.joinedAt || serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 };
}

function previewSections(sections: Array<{ title: string; description?: string; listType?: string }>): PreviewSection[] {
  return sections.slice(0, 8).map((section, index) => ({ id: `${section.listType || "custom"}-${index}`, title: safeText(section.title, 80), description: safeText(section.description, 180), iconKey: section.listType || "custom" }));
}

export async function createCommunity(user: User, input: { name: string; location: string; description: string; sections?: string[]; timezone?: string }) {
  if (user.isAnonymous) throw new Error("Create a permanent Circa account before creating a Community.");
  const { db } = getFirebaseServices();
  const projectRef = doc(collection(db, "projects"));
  const customSections = (input.sections || []).map((title) => ({ title: safeText(title, 80), listType: "custom" as const, description: "" })).filter((item) => item.title);
  const sections = customSections.length ? customSections.slice(0, 12) : DEFAULT_SECTIONS;
  const project = { id: projectRef.id, name: safeText(input.name, 80), projectMode: "community" };
  const batch = writeBatch(db);
  batch.set(projectRef, {
    name: project.name, location: safeText(input.location, 120), description: safeText(input.description, 800), timezone: safeText(input.timezone || "Europe/London", 80),
    previewSections: previewSections(sections), projectMode: "community", category: "community", ownerId: user.uid, schemaVersion: 2,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), archived: false,
  });
  batch.set(doc(db, "projects", projectRef.id, "members", user.uid), {
    uid: user.uid, role: "owner", status: "active", displayName: user.displayName || user.email || "Community owner", isAnonymous: false,
    joinedViaInviteId: "", consented: true, consentVersion: 1, consentedAt: serverTimestamp(), joinedAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 2,
  });
  batch.set(doc(db, "users", user.uid, "memberships", projectRef.id), membershipIndex(project, "owner"));
  batch.set(doc(db, "projects", projectRef.id, "memberDirectory", user.uid), memberDirectoryPayload({ uid: user.uid, displayName: user.displayName || user.email || "Community owner", role: "owner" }));
  addModerationEvent(batch, projectRef.id, "membership-created", user.uid, user.uid, { role: "owner" });
  sections.forEach((section, order) => batch.set(doc(collection(db, "projects", projectRef.id, "lists")), { ...section, order, schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await batch.commit();
  return projectRef.id;
}

export async function getCloudProject(projectId: string): Promise<CloudProject | null> {
  const snap = await getDoc(doc(getFirebaseServices().db, "projects", projectId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as CloudProject) : null;
}

export async function getMembership(projectId: string, uid: string): Promise<CommunityMember | null> {
  const snap = await getDoc(doc(getFirebaseServices().db, "projects", projectId, "members", uid));
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as CommunityMember) : null;
}

export function watchMembership(projectId: string, uid: string, callback: (member: CommunityMember | null) => void) {
  return onSnapshot(doc(getFirebaseServices().db, "projects", projectId, "members", uid), (snap) => callback(snap.exists() ? ({ uid: snap.id, ...snap.data() } as CommunityMember) : null));
}

export function watchMembers(projectId: string, callback: (members: CommunityMember[]) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "members"), orderBy("joinedAt", "asc"), limit(500)), (snap) => callback(snap.docs.map((item) => ({ uid: item.id, ...item.data() } as CommunityMember))));
}

export function watchCommunityMemberDirectory(projectId: string, callback: (members: CommunityMemberSummary[]) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "memberDirectory"), orderBy("joinedAt", "asc"), limit(500)), (snap) => callback(snap.docs.map((item) => ({ uid: item.id, ...item.data() } as CommunityMemberSummary))));
}

export async function ensureCommunityMemberDirectoryEntry(projectId: string, member: CommunityMember) {
  await setDoc(doc(getFirebaseServices().db, "projects", projectId, "memberDirectory", member.uid), memberDirectoryPayload(member), { merge: true });
}

export async function syncCommunityMemberDirectory(projectId: string, members: CommunityMember[]) {
  if (!members.length) return;
  const batch = writeBatch(getFirebaseServices().db);
  members.forEach((member) => batch.set(doc(getFirebaseServices().db, "projects", projectId, "memberDirectory", member.uid), memberDirectoryPayload(member), { merge: true }));
  await batch.commit();
}

export function watchCommunityLists(projectId: string, callback: (lists: CommunityList[]) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "lists"), orderBy("order", "asc"), limit(80)), (snap) => callback(snap.docs.map((item) => ({ id: item.id, listType: "custom", ...item.data() } as CommunityList))));
}

export function watchCommunityItems(projectId: string, listId: string, callback: (items: CommunityItem[]) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "lists", listId, "items"), orderBy("order", "asc"), limit(500)), (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as CommunityItem))));
}

export function watchProposals(projectId: string, uid: string, canReview: boolean, callback: (items: EditProposal[]) => void) {
  const base = collection(getFirebaseServices().db, "projects", projectId, "editProposals");
  const q = canReview ? query(base, where("status", "==", "pending"), orderBy("submittedAt", "desc"), limit(200)) : query(base, where("submittedBy", "==", uid), orderBy("submittedAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as EditProposal))));
}

export async function addPublishedList(projectId: string, title: string, listType: CommunityListType = "custom", description = "") {
  const { db } = getFirebaseServices(); const list = doc(collection(db, "projects", projectId, "lists")); const batch = writeBatch(db);
  batch.set(list, { title: safeText(title, 80), description: safeText(description, 300), listType, order: Date.now(), schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  addModerationEvent(batch, projectId, "list-published", currentUid(), list.id); await batch.commit(); return list.id;
}

function itemPayload(item: Partial<CommunityItem>) {
  return cleanObject({
    title: safeText(item.title, 120), details: safeText(item.details ?? item.description, 1200), description: safeText(item.description ?? item.details, 1200),
    category: safeText(item.category, 80), itemType: item.itemType || "custom", phone: safeText(item.phone, 80), email: safeText(item.email, 180),
    url: safeText(item.url ?? item.website, 500), website: safeText(item.website ?? item.url, 500), address: safeText(item.address, 500), notes: safeText(item.notes, 1200),
    openingInformation: safeText(item.openingInformation, 300), date: safeText(item.date, 80), startDate: safeText(item.startDate, 20), startTime: safeText(item.startTime, 20), endTime: safeText(item.endTime, 20), location: safeText(item.location, 300), schoolType: safeText(item.schoolType, 120),
    binType: safeText(item.binType, 80), bins: Array.isArray(item.bins) ? item.bins : undefined, schedule: item.schedule, timezone: safeText(item.timezone, 80), areaLabel: safeText(item.areaLabel, 120), enabled: item.enabled !== false,
    customFields: item.customFields || {}, order: Number(item.order || Date.now()), contentVersion: Math.max(1, Number(item.contentVersion || 1)), schemaVersion: 2,
  });
}

export async function addPublishedItem(projectId: string, listId: string, item: Partial<CommunityItem>) {
  const { db } = getFirebaseServices(); const ref = doc(collection(db, "projects", projectId, "lists", listId, "items")); const batch = writeBatch(db);
  batch.set(ref, { ...itemPayload({ ...item, contentVersion: 1 }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  addModerationEvent(batch, projectId, "item-published", currentUid(), ref.id, { listId }); await batch.commit();
  return ref.id;
}

export async function saveBinCollection(projectId: string, listId: string, input: BinCollectionInput, previousDate?: string) {
  const validated = validateBinCollection(input);
  const sourceDate = previousDate ? validateBinDate(previousDate) : null;
  const { db } = getFirebaseServices();
  const actorUid = currentUid();
  const targetRef = doc(db, "projects", projectId, "lists", listId, "items", validated.date);
  const sourceRef = doc(db, "projects", projectId, "lists", listId, "items", sourceDate || validated.date);

  await runTransaction(db, async (transaction) => {
    const source = await transaction.get(sourceRef);
    const target = sourceRef.path === targetRef.path ? source : await transaction.get(targetRef);
    if (!sourceDate && target.exists()) throw new Error("A collection already exists for that date.");
    if (sourceDate && !source.exists()) throw new Error("That collection no longer exists.");
    if (sourceDate && sourceRef.path !== targetRef.path && target.exists()) throw new Error("A collection already exists for that date.");
    const nextVersion = Number(source.data()?.contentVersion || 0) + 1;
    transaction.set(targetRef, {
      ...itemPayload({ ...binCollectionItem(validated), contentVersion: nextVersion }),
      createdAt: source.data()?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (sourceRef.path !== targetRef.path) transaction.delete(sourceRef);
    const event = doc(collection(db, "projects", projectId, "moderationEvents"));
    transaction.set(event, { action: sourceDate ? "item-updated" : "item-published", actorUid, targetId: validated.date, details: cleanObject({ listId, previousDate: sourceDate || undefined }), schemaVersion: 1, createdAt: serverTimestamp() });
  });
  return validated.date;
}

export async function importBinCollections(projectId: string, listId: string, input: unknown) {
  const collections = parseBinCollectionImport(input);
  const { db } = getFirebaseServices();
  const batch = writeBatch(db);
  collections.forEach((collection) => {
    const ref = doc(db, "projects", projectId, "lists", listId, "items", collection.date);
    batch.set(ref, { ...itemPayload(binCollectionItem(collection)), importSource: "bin-collections-json", updatedAt: serverTimestamp() }, { merge: true });
  });
  addModerationEvent(batch, projectId, "item-published", currentUid(), listId, { count: collections.length, source: "bin-collections-json" });
  await batch.commit();
  return { count: collections.length };
}

export async function importPublishedDirectoryItems(projectId: string, listId: string, items: Array<Partial<CommunityItem>>) {
  if (!items.length) return { count: 0 };
  if (items.length > 400) throw new Error("Circa imports up to 400 directory contacts at a time.");

  const { db } = getFirebaseServices();
  const batch = writeBatch(db);

  const identified = await Promise.all(items.map(async (item, index) => ({ item, id: await importIdentityHash(item, index) })));

  identified.forEach(({ item, id }) => {
    const ref = doc(db, "projects", projectId, "lists", listId, "items", `directory-${id}`);

    batch.set(ref, {
      ...itemPayload(item),
      importSource: "private-directory-seed",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
  addModerationEvent(batch, projectId, "directory-import-published", currentUid(), listId, { count: items.length });
  await batch.commit();
  return { count: items.length };
}

export async function updatePublishedItem(projectId: string, listId: string, itemId: string, item: Partial<CommunityItem>) {
  const { db } = getFirebaseServices(); const ref = doc(db, "projects", projectId, "lists", listId, "items", itemId);
  await runTransaction(db, async (transaction) => { const current = await transaction.get(ref); if (!current.exists()) throw new Error("That published item no longer exists."); const nextVersion = Number(current.data().contentVersion || 0) + 1; const event = doc(collection(db, "projects", projectId, "moderationEvents")); transaction.update(ref, { ...itemPayload({ ...item, contentVersion: nextVersion }), contentVersion: nextVersion, updatedAt: serverTimestamp() }); transaction.set(event, { action: "item-updated", actorUid: currentUid(), targetId: itemId, details: { listId, baseVersion: nextVersion - 1 }, schemaVersion: 1, createdAt: serverTimestamp() }); });
}

export async function importIdentityHash(item: Partial<CommunityItem>, index = 0) {
  const providerId = safeText(item.customFields?.providerId, 120).toLowerCase();
  const identityParts = [item.title, item.category, item.phone, item.email, item.address].map((value) => safeText(value, 240).toLowerCase().replace(/\s+/g, " "));
  const identity = providerId || (identityParts.some(Boolean) ? identityParts.join("\u001f") : `contact-${index}`);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export async function deletePublishedItem(projectId: string, listId: string, itemId: string) {
  const { db } = getFirebaseServices(); const batch = writeBatch(db); batch.delete(doc(db, "projects", projectId, "lists", listId, "items", itemId)); addModerationEvent(batch, projectId, "item-deleted", currentUid(), itemId, { listId }); await batch.commit();
}

export async function submitProposal(user: User, projectId: string, proposal: Omit<EditProposal, "id" | "projectId" | "status" | "submittedBy" | "submittedByName" | "currentItem" | "baseVersion">) {
  let currentItem: CommunityItem | null = null;
  if (proposal.operation !== "create") {
    const snapshot = await getDoc(doc(getFirebaseServices().db, "projects", projectId, "lists", proposal.listId, "items", proposal.itemId));
    if (!snapshot.exists()) throw new Error("That published item no longer exists.");
    currentItem = snapshot.data() as CommunityItem;
  }
  const ref = doc(collection(getFirebaseServices().db, "projects", projectId, "editProposals"));
  const baseVersion = Number(currentItem?.contentVersion || 0);
  await setDoc(ref, { ...proposal, currentItem, proposedItem: proposal.proposedItem ? itemPayload({ ...proposal.proposedItem, contentVersion: proposal.operation === "create" ? 1 : baseVersion + 1 }) : null, baseVersion, projectId, status: "pending", submittedBy: user.uid, submittedByName: user.displayName || user.email || "Community member", submittedAt: serverTimestamp(), schemaVersion: 3 });
  return ref.id;
}

export async function reviewProposal(projectId: string, proposalId: string, reviewerId: string, decision: "approved" | "rejected", reviewNote = "") {
  const { db } = getFirebaseServices(); const proposalRef = doc(db, "projects", projectId, "editProposals", proposalId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(proposalRef);
    if (!snapshot.exists()) throw new Error("That proposal no longer exists.");
    const proposal = snapshot.data() as EditProposal;
    if (proposal.status !== "pending") throw new Error("That proposal has already been reviewed.");
    if (proposal.submittedBy === reviewerId) throw new Error("Another admin must review your own suggestion.");
    let currentVersion = 0;
    const itemRef = proposal.itemId ? doc(db, "projects", projectId, "lists", proposal.listId, "items", proposal.itemId) : doc(collection(db, "projects", projectId, "lists", proposal.listId, "items"));
    if (proposal.operation !== "create") {
      const current = await transaction.get(itemRef);
      if (!current.exists()) throw new Error("This proposal is stale because the published item no longer exists.");
      currentVersion = Number(current.data().contentVersion || 0);
      if (currentVersion !== Number(proposal.baseVersion || 0)) throw new Error("This proposal is stale because the published item changed. Review the current version and submit a new proposal.");
    }
    if (decision === "approved") {
      if (proposal.operation === "delete") transaction.delete(itemRef);
      else if (proposal.operation === "update") transaction.set(itemRef, { ...proposal.proposedItem, contentVersion: currentVersion + 1, updatedAt: serverTimestamp() }, { merge: true });
      else transaction.set(itemRef, { ...proposal.proposedItem, contentVersion: 1, createdBy: proposal.submittedBy, createdByName: proposal.submittedByName, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    transaction.update(proposalRef, { status: decision, reviewedBy: reviewerId, reviewedAt: serverTimestamp(), reviewNote: safeText(reviewNote, 500) });
    const event = doc(collection(db, "projects", projectId, "moderationEvents")); transaction.set(event, { action: decision === "approved" ? "proposal-approved" : "proposal-rejected", actorUid: reviewerId, targetId: proposalId, details: { operation: proposal.operation, listId: proposal.listId, itemId: proposal.itemId, baseVersion: Number(proposal.baseVersion || 0) }, schemaVersion: 1, createdAt: serverTimestamp() });
  });
}

export async function createInvitation(project: CloudProject, userId: string, options: { label?: string; expiresAt?: string | null } = {}) {
  const user = getFirebaseServices().auth.currentUser; if (!user || user.uid !== userId || user.isAnonymous) throw new Error("Use a permanent Community admin account to create invitations.");
  const response = await fetch("/api/invitations", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ projectId: project.id, label: safeText(options.label, 80), expiresAt: options.expiresAt || null }) });
  const payload = await response.json() as { token?: string; code?: string; error?: string }; if (!response.ok || !payload.token || !payload.code) throw new Error(payload.error || "Circa could not create that invitation."); return { token: payload.token, code: payload.code };
}

export function watchInvitations(projectId: string, callback: (invites: PublicInvite[]) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "invitations"), orderBy("createdAt", "desc"), limit(50)), (snapshot) => callback(snapshot.docs.map((item) => publicInviteFromSnapshot(item, item.id)!).filter(Boolean)));
}

export async function revokeInvitation(token: string, code: string, projectId: string) {
  const { db } = getFirebaseServices(); const batch = writeBatch(db); const update = { status: "revoked", revokedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  batch.update(doc(db, "invites", token), update); batch.update(doc(db, "joinCodes", code), update); batch.update(doc(db, "projects", projectId, "invitations", token), update); addModerationEvent(batch, projectId, "invitation-revoked", currentUid(), token); await batch.commit();
}

function publicInviteFromSnapshot(snapshot: DocumentSnapshot<DocumentData>, token: string): PublicInvite | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data(); const expiry = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : data.expiresAt || null;
  const expired = expiry ? new Date(expiry).getTime() <= Date.now() : false;
  return { token, projectId: safeText(data.projectId, 160), projectMode: data.projectMode === "network" ? "network" : "community", projectName: safeText(data.projectName, 80), description: safeText(data.description, 800), location: safeText(data.location, 120), code: safeText(data.code, 20), label: safeText(data.label, 80), status: data.status === "active" && !expired ? "active" : "revoked", expiresAt: expiry, previewSections: Array.isArray(data.previewSections) ? data.previewSections.slice(0, 8) : [], createdBy: safeText(data.createdBy, 160), createdAt: data.createdAt, revokedAt: data.revokedAt, schemaVersion: Number(data.schemaVersion || 1) };
}

export async function getPublicInvite(token: string) { const snapshot = await getDoc(doc(getFirebaseServices().db, "invites", safeText(token, 160))); return publicInviteFromSnapshot(snapshot, token); }
export async function resolveJoinCode(code: string) { const response = await fetch("/api/join-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: safeText(code, 20).toUpperCase() }) }); const payload = await response.json() as { invite?: PublicInvite; error?: string }; if (response.status === 404) return null; if (!response.ok) throw new Error(payload.error || "Circa could not check that code."); return payload.invite || null; }

export async function joinProjectByInvite(user: User, invite: PublicInvite) {
  const { db } = getFirebaseServices(); const inviteRef = doc(db, "invites", invite.token); const memberRef = doc(db, "projects", invite.projectId, "members", user.uid); const directoryRef = doc(db, "projects", invite.projectId, "memberDirectory", user.uid); const indexRef = doc(db, "users", user.uid, "memberships", invite.projectId);
  const result = await runTransaction(db, async (transaction) => {
    const [liveInvite, existing] = await Promise.all([transaction.get(inviteRef), transaction.get(memberRef)]);
    if (!liveInvite.exists() || liveInvite.data().status !== "active" || liveInvite.data().projectId !== invite.projectId) throw new Error("This invitation is no longer active.");
    const expiry = liveInvite.data().expiresAt instanceof Timestamp ? liveInvite.data().expiresAt.toMillis() : liveInvite.data().expiresAt ? new Date(liveInvite.data().expiresAt).getTime() : null;
    if (expiry && expiry <= Date.now()) throw new Error("This invitation has expired.");
    if (existing.exists() && existing.data().status === "active") {
      transaction.set(indexRef, membershipIndex({ id: invite.projectId, name: invite.projectName, projectMode: invite.projectMode }, existing.data().role), { merge: true });
      transaction.set(directoryRef, memberDirectoryPayload({ uid: user.uid, displayName: existing.data().displayName || user.displayName || user.email || "Community member", role: existing.data().role, status: "active", joinedAt: existing.data().joinedAt }), { merge: true });
      return { alreadyMember: true, role: existing.data().role as CommunityMember["role"] };
    }
    const joinedAt = existing.exists() && existing.data().joinedAt ? existing.data().joinedAt : serverTimestamp();
    const displayName = user.displayName || user.email || `${invite.projectMode === "network" ? "Network" : "Community"} member`;
    transaction.set(memberRef, { uid: user.uid, role: "member", status: "active", displayName, isAnonymous: user.isAnonymous, joinedViaInviteId: invite.token, consented: true, consentedAt: serverTimestamp(), consentVersion: 1, joinedAt, updatedAt: serverTimestamp(), schemaVersion: 2 }, { merge: true });
    transaction.set(directoryRef, memberDirectoryPayload({ uid: user.uid, displayName, role: "member", status: "active", joinedAt }), { merge: true });
    transaction.set(indexRef, membershipIndex({ id: invite.projectId, name: invite.projectName, projectMode: invite.projectMode }, "member"), { merge: true });
    const eventRef = doc(collection(db, "projects", invite.projectId, "moderationEvents")); transaction.set(eventRef, { action: existing.exists() ? "membership-rejoined" : "membership-created", actorUid: user.uid, targetId: user.uid, details: { role: "member", inviteId: invite.token }, schemaVersion: 1, createdAt: serverTimestamp() });
    return { alreadyMember: false, role: "member" as const };
  });
  try { window.localStorage.setItem(invite.projectMode === "network" ? "circa_last_network" : "circa_last_community", invite.projectId); } catch { /* Firestore is authoritative */ }
  return result;
}

export const joinCommunity = joinProjectByInvite;

export async function updateMemberRole(project: CloudProject, memberId: string, role: "admin" | "member") {
  const { db } = getFirebaseServices(); const batch = writeBatch(db);
  batch.update(doc(db, "projects", project.id, "members", memberId), { role, updatedAt: serverTimestamp() });
  batch.set(doc(db, "projects", project.id, "memberDirectory", memberId), { role, status: "active", updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, "users", memberId, "memberships", project.id), membershipIndex(project, role), { merge: true });
  addModerationEvent(batch, project.id, "member-role-changed", currentUid(), memberId, { role });
  await batch.commit();
}

export async function removeMember(project: CloudProject, memberId: string) {
  const { db } = getFirebaseServices(); const batch = writeBatch(db);
  batch.update(doc(db, "projects", project.id, "members", memberId), { status: "removed", updatedAt: serverTimestamp() });
  batch.set(doc(db, "projects", project.id, "memberDirectory", memberId), { status: "removed", updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, "users", memberId, "memberships", project.id), membershipIndex(project, "member", "removed"), { merge: true });
  addModerationEvent(batch, project.id, "member-removed", currentUid(), memberId);
  await batch.commit();
}

export async function updateCommunitySettings(projectId: string, settings: { timezone?: string; previewSections?: PreviewSection[] }) {
  await updateDoc(doc(getFirebaseServices().db, "projects", projectId), cleanObject({ timezone: settings.timezone ? safeText(settings.timezone, 80) : undefined, previewSections: settings.previewSections, updatedAt: serverTimestamp() }));
}

export async function createReminder(projectId: string, input: { message: string; nextRunAt: string; timezone: string; repeatType?: "once" | "weekly" | "fortnightly" | "monthly" | "custom"; repeatMinutes?: number; reminderType?: string; notifyWhen?: string; category?: string }) {
  const nextRunAt = new Date(input.nextRunAt); if (!Number.isFinite(nextRunAt.getTime())) throw new Error("Choose a valid reminder date and time.");
  const ref = doc(collection(getFirebaseServices().db, "projects", projectId, "reminders"));
  await setDoc(ref, { message: safeText(input.message, 1200), nextRunAt: Timestamp.fromDate(nextRunAt), timezone: safeText(input.timezone, 80), repeatType: input.repeatType || "once", repeatMinutes: Math.max(0, Math.floor(Number(input.repeatMinutes || 0))), reminderType: safeText(input.reminderType || "custom", 80), notifyWhen: safeText(input.notifyWhen || "scheduled", 80), category: safeText(input.category || "announcements", 80), enabled: true, status: "upcoming", schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export function watchReminders(projectId: string, callback: (items: Array<{ id: string; [key: string]: unknown }>) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "reminders"), orderBy("nextRunAt", "asc"), limit(100)), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
}

export async function deleteReminder(projectId: string, reminderId: string) {
  await deleteDoc(doc(getFirebaseServices().db, "projects", projectId, "reminders", reminderId));
}

export async function listMemberProjects(uid: string) {
  const memberships = await getDocs(query(collection(getFirebaseServices().db, "users", uid, "memberships"), where("status", "==", "active"), limit(100)));
  return memberships.docs.map((item) => ({ id: item.id, ...item.data() } as { id: string; projectId: string; projectName: string; projectMode: string; role: string; status: string }));
}

export function watchMemberProjects(uid: string, callback: (items: Array<{ id: string; projectId: string; projectName: string; projectMode: string; role: string; status: string }>) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "users", uid, "memberships"), where("status", "==", "active"), limit(100)), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as { id: string; projectId: string; projectName: string; projectMode: string; role: string; status: string }))), onError);
}
