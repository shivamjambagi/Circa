"use client";

import { User } from "firebase/auth";
import { DocumentData, DocumentSnapshot, Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { getFirebaseServices } from "../firebase/client";
import type { CloudProject, CommunityItem, CommunityList, CommunityListType, CommunityMember, CommunityMemberSummary, EditProposal, PreviewSection, PublicInvite } from "./types";

const DEFAULT_SECTIONS: Array<{ title: string; listType: CommunityListType; description: string }> = [
  { title: "Local services", listType: "directory", description: "Trusted contacts and useful local services." },
  { title: "Bin collections", listType: "bin", description: "Collection schedules and reminders." },
  { title: "Schools", listType: "school", description: "Local school information." },
  { title: "Events", listType: "event", description: "Community meetings and upcoming events." },
  { title: "Useful contacts", listType: "contact", description: "Council and other useful information." },
];

function safeText(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function cleanObject<T extends Record<string, unknown>>(value: T) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T; }

function randomToken(bytes = 24) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(8));
  return [...values].map((value) => alphabet[value % alphabet.length]).join("");
}

function membershipIndex(project: CloudProject | { id: string; name: string; projectMode: string }, role: string, status = "active") {
  return { projectId: project.id, projectName: project.name, projectMode: project.projectMode, role, status, updatedAt: serverTimestamp(), schemaVersion: 1 };
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
  sections.forEach((section, order) => batch.set(doc(collection(db, "projects", projectRef.id, "lists")), { ...section, order, schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await batch.commit();

  // The safe member directory is a V16 addition. Keep Community creation compatible
  // with already-deployed V15 rules while the V16 rules are still being tested.
  // Once the V16 rules are deployed this succeeds; until then the core Community
  // (project, owner membership, account index and lists) is still created atomically.
  try {
    await setDoc(doc(db, "projects", projectRef.id, "memberDirectory", user.uid), memberDirectoryPayload({ uid: user.uid, displayName: user.displayName || user.email || "Community owner", role: "owner" }));
  } catch {
    // Non-blocking during the V15 -> V16 rules transition.
  }
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
  const list = await addDoc(collection(getFirebaseServices().db, "projects", projectId, "lists"), { title: safeText(title, 80), description: safeText(description, 300), listType, order: Date.now(), schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return list.id;
}

function itemPayload(item: Partial<CommunityItem>) {
  return cleanObject({
    title: safeText(item.title, 120), details: safeText(item.details ?? item.description, 1200), description: safeText(item.description ?? item.details, 1200),
    category: safeText(item.category, 80), itemType: item.itemType || "custom", phone: safeText(item.phone, 80), email: safeText(item.email, 180),
    url: safeText(item.url ?? item.website, 500), website: safeText(item.website ?? item.url, 500), address: safeText(item.address, 500), notes: safeText(item.notes, 1200),
    openingInformation: safeText(item.openingInformation, 300), date: safeText(item.date, 80), startDate: safeText(item.startDate, 20), startTime: safeText(item.startTime, 20), endTime: safeText(item.endTime, 20), location: safeText(item.location, 300), schoolType: safeText(item.schoolType, 120),
    binType: safeText(item.binType, 80), schedule: item.schedule, timezone: safeText(item.timezone, 80), areaLabel: safeText(item.areaLabel, 120), enabled: item.enabled !== false,
    customFields: item.customFields || {}, order: Number(item.order || Date.now()), schemaVersion: 2,
  });
}

export async function addPublishedItem(projectId: string, listId: string, item: Partial<CommunityItem>) {
  const ref = doc(collection(getFirebaseServices().db, "projects", projectId, "lists", listId, "items"));
  await setDoc(ref, { ...itemPayload(item), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function importPublishedDirectoryItems(projectId: string, listId: string, items: Array<Partial<CommunityItem>>) {
  if (!items.length) return { count: 0 };
  if (items.length > 400) throw new Error("Circa imports up to 400 directory contacts at a time.");

  const { db } = getFirebaseServices();
  const batch = writeBatch(db);

  items.forEach((item, index) => {
    const providerId = safeText(item.customFields?.providerId, 80);
    const fallback = safeText(item.title, 80) || `contact-${index + 1}`;
    const key = (providerId || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || `contact-${index + 1}`;
    const ref = doc(db, "projects", projectId, "lists", listId, "items", `directory-${key}`);

    batch.set(ref, {
      ...itemPayload(item),
      importSource: "private-directory-seed",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
  return { count: items.length };
}

export async function updatePublishedItem(projectId: string, listId: string, itemId: string, item: Partial<CommunityItem>) {
  await updateDoc(doc(getFirebaseServices().db, "projects", projectId, "lists", listId, "items", itemId), { ...itemPayload(item), updatedAt: serverTimestamp() });
}

export async function deletePublishedItem(projectId: string, listId: string, itemId: string) {
  await deleteDoc(doc(getFirebaseServices().db, "projects", projectId, "lists", listId, "items", itemId));
}

export async function submitProposal(user: User, projectId: string, proposal: Omit<EditProposal, "id" | "projectId" | "status" | "submittedBy" | "submittedByName" | "currentItem">) {
  let currentItem: CommunityItem | null = null;
  if (proposal.operation !== "create") {
    const snapshot = await getDoc(doc(getFirebaseServices().db, "projects", projectId, "lists", proposal.listId, "items", proposal.itemId));
    if (!snapshot.exists()) throw new Error("That published item no longer exists.");
    currentItem = { id: snapshot.id, ...snapshot.data() } as CommunityItem;
  }
  const ref = doc(collection(getFirebaseServices().db, "projects", projectId, "editProposals"));
  await setDoc(ref, { ...proposal, currentItem, proposedItem: proposal.proposedItem ? itemPayload(proposal.proposedItem) : null, projectId, status: "pending", submittedBy: user.uid, submittedByName: user.displayName || user.email || "Community member", submittedAt: serverTimestamp(), schemaVersion: 2 });
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
    if (decision === "approved") {
      const itemRef = proposal.itemId ? doc(db, "projects", projectId, "lists", proposal.listId, "items", proposal.itemId) : doc(collection(db, "projects", projectId, "lists", proposal.listId, "items"));
      if (proposal.operation === "delete") transaction.delete(itemRef);
      else if (proposal.operation === "update") transaction.set(itemRef, { ...proposal.proposedItem, updatedAt: serverTimestamp() }, { merge: true });
      else transaction.set(itemRef, { ...proposal.proposedItem, createdBy: proposal.submittedBy, createdByName: proposal.submittedByName, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    transaction.update(proposalRef, { status: decision, reviewedBy: reviewerId, reviewedAt: serverTimestamp(), reviewNote: safeText(reviewNote, 500) });
  });
}

export async function createInvitation(project: CloudProject, userId: string, options: { label?: string; expiresAt?: string | null } = {}) {
  const { db } = getFirebaseServices(); const token = randomToken(); const code = randomCode();
  const expires = options.expiresAt ? Timestamp.fromDate(new Date(options.expiresAt)) : null;
  const publicData = { projectId: project.id, projectMode: project.projectMode, projectName: project.name, description: project.description || "", location: project.location || "", previewSections: project.previewSections || [], code, label: safeText(options.label, 80), status: "active", expiresAt: expires, createdBy: userId, schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const batch = writeBatch(db);
  batch.set(doc(db, "invites", token), publicData);
  batch.set(doc(db, "joinCodes", code), { ...publicData, token });
  batch.set(doc(db, "projects", project.id, "invitations", token), { ...publicData, token });
  await batch.commit(); return { token, code };
}

export function watchInvitations(projectId: string, callback: (invites: PublicInvite[]) => void) {
  return onSnapshot(query(collection(getFirebaseServices().db, "projects", projectId, "invitations"), orderBy("createdAt", "desc"), limit(50)), (snapshot) => callback(snapshot.docs.map((item) => publicInviteFromSnapshot(item, item.id)!).filter(Boolean)));
}

export async function revokeInvitation(token: string, code: string, projectId: string) {
  const { db } = getFirebaseServices(); const batch = writeBatch(db); const update = { status: "revoked", revokedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  batch.update(doc(db, "invites", token), update); batch.update(doc(db, "joinCodes", code), update); batch.update(doc(db, "projects", projectId, "invitations", token), update); await batch.commit();
}

function publicInviteFromSnapshot(snapshot: DocumentSnapshot<DocumentData>, token: string): PublicInvite | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data(); const expiry = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : data.expiresAt || null;
  const expired = expiry ? new Date(expiry).getTime() <= Date.now() : false;
  return { token, projectId: safeText(data.projectId, 160), projectMode: data.projectMode === "network" ? "network" : "community", projectName: safeText(data.projectName, 80), description: safeText(data.description, 800), location: safeText(data.location, 120), code: safeText(data.code, 20), label: safeText(data.label, 80), status: data.status === "active" && !expired ? "active" : "revoked", expiresAt: expiry, previewSections: Array.isArray(data.previewSections) ? data.previewSections.slice(0, 8) : [], createdBy: safeText(data.createdBy, 160), createdAt: data.createdAt, revokedAt: data.revokedAt, schemaVersion: Number(data.schemaVersion || 1) };
}

export async function getPublicInvite(token: string) { const snapshot = await getDoc(doc(getFirebaseServices().db, "invites", safeText(token, 160))); return publicInviteFromSnapshot(snapshot, token); }
export async function resolveJoinCode(code: string) { const snapshot = await getDoc(doc(getFirebaseServices().db, "joinCodes", safeText(code, 20).toUpperCase())); if (!snapshot.exists()) return null; return publicInviteFromSnapshot(snapshot, safeText(snapshot.data().token, 160)); }

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
  await batch.commit();
}

export async function removeMember(project: CloudProject, memberId: string) {
  const { db } = getFirebaseServices(); const batch = writeBatch(db);
  batch.update(doc(db, "projects", project.id, "members", memberId), { status: "removed", updatedAt: serverTimestamp() });
  batch.set(doc(db, "projects", project.id, "memberDirectory", memberId), { status: "removed", updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, "users", memberId, "memberships", project.id), membershipIndex(project, "member", "removed"), { merge: true });
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
