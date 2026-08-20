"use client";

import { User } from "firebase/auth";
import { DocumentData, Query, QueryDocumentSnapshot, collection, deleteField, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch } from "firebase/firestore";
import { getFirebaseServices } from "../firebase/client";
import type { CloudProject } from "./types";
import { normalizeLinkedInUrl, type LinkedInPreview, type NetworkEdge, type NetworkPerson } from "../shared/networkEngine";

async function stableId(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export async function createNetwork(user: User, name: string, description = "") {
  if (user.isAnonymous) throw new Error("Create your Circa account to import and protect your network.");
  const { db } = getFirebaseServices(); const projectRef = doc(collection(db, "projects")); const batch = writeBatch(db);
  const projectName = name.trim().slice(0, 80) || "My Professional Network";
  batch.set(projectRef, { name: projectName, description: description.trim().slice(0, 800), location: "", projectMode: "network", category: "business", ownerId: user.uid, schemaVersion: 2, archived: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(db, "projects", projectRef.id, "members", user.uid), { uid: user.uid, role: "owner", status: "active", displayName: user.displayName || user.email || "Network owner", isAnonymous: false, joinedViaInviteId: "", consented: true, consentedAt: serverTimestamp(), consentVersion: 1, joinedAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 2 });
  batch.set(doc(db, "users", user.uid, "memberships", projectRef.id), { projectId: projectRef.id, projectName, projectMode: "network", role: "owner", status: "active", updatedAt: serverTimestamp(), schemaVersion: 1 });
  batch.set(doc(db, "projects", projectRef.id, "networkPeople", `user_${user.uid}`), { displayName: user.displayName || "You", firstName: user.displayName?.split(/\s+/)[0] || null, lastName: null, linkedinProfileUrl: null, company: null, position: null, connectedOn: null, identityKey: null, identityFingerprint: null, source: "circa", sourceImportId: null, ownerUid: user.uid, visibility: "private", isSelf: true, schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (user.email) batch.set(doc(db, "projects", projectRef.id, "networkPrivateFields", `user_${user.uid}`), { ownerUid: user.uid, email: user.email, schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit(); return projectRef.id;
}

export async function importLinkedInPreview(user: User, project: CloudProject, preview: LinkedInPreview, fileName: string) {
  if (user.isAnonymous) throw new Error("Create your Circa account to import and protect your network.");
  if (project.projectMode !== "network") throw new Error("LinkedIn connections can only be imported into a Circa Network.");
  const { db } = getFirebaseServices(); const importRef = doc(collection(db, "projects", project.id, "networkImports")); const selfId = `user_${user.uid}`;
  let batch = writeBatch(db); let writes = 0; let imported = 0;
  const flush = async () => { if (!writes) return; await batch.commit(); batch = writeBatch(db); writes = 0; };
  for (let index = 0; index < preview.people.length; index += 1) {
    const person = preview.people[index];
    const identityFingerprint = person.identityKey ? await stableId(person.identityKey) : null;
    const personId = identityFingerprint ? `person_${await stableId(`${user.uid}:${identityFingerprint}`)}` : `person_${await stableId(`${importRef.id}:${index}:${person.displayName}`)}`;
    const { email, identityKey: _privateIdentityKey, ...shareSafePerson } = person;
    void _privateIdentityKey;
    batch.set(doc(db, "projects", project.id, "networkPeople", personId), { ...shareSafePerson, identityKey: null, identityFingerprint, source: "linkedin", sourceImportId: importRef.id, ownerUid: user.uid, visibility: "private", schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }); writes += 1;
    if (email) { batch.set(doc(db, "projects", project.id, "networkPrivateFields", personId), { ownerUid: user.uid, email, schemaVersion: 1, updatedAt: serverTimestamp() }, { merge: true }); writes += 1; }
    const edgeId = `edge_${await stableId(`${user.uid}:${selfId}:${personId}:linkedin-connection`)}`;
    batch.set(doc(db, "projects", project.id, "networkEdges", edgeId), { sourcePersonId: selfId, targetPersonId: personId, relationshipType: "linkedin-connection", provenance: "linkedin-import", sourceImportId: importRef.id, contributedBy: user.uid, ownerUid: user.uid, visibility: "private", schemaVersion: 1, createdAt: serverTimestamp() }, { merge: true }); writes += 1; imported += 1;
    if (writes >= 380) await flush();
  }
  await flush();
  await setDoc(importRef, { source: "linkedin", fileName: fileName.slice(0, 240), importedBy: user.uid, importedAt: serverTimestamp(), rowCount: preview.people.length + preview.invalidRows + preview.duplicates, importedCount: imported, skippedCount: preview.invalidRows + preview.duplicates, schemaVersion: 1 });
  return { importId: importRef.id, importedCount: imported };
}

async function getAll<T>(makeQuery: (cursor?: QueryDocumentSnapshot<DocumentData>) => Query<DocumentData>, pageSize: number) {
  const rows: T[] = []; let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  for (;;) {
    const snapshot = await getDocs(makeQuery(cursor));
    rows.push(...snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
    if (snapshot.size < pageSize) break;
    cursor = snapshot.docs.at(-1);
  }
  return rows;
}

async function enabledContributionUids(projectId: string) {
  const base = collection(getFirebaseServices().db, "projects", projectId, "networkContributions");
  const snapshot = await getDocs(query(base, where("enabled", "==", true), limit(2000)));
  return snapshot.docs.map((item) => item.id);
}

async function listPeopleForOwner(projectId: string, ownerUid: string) {
  const base = collection(getFirebaseServices().db, "projects", projectId, "networkPeople");
  const pageSize = 100;
  return getAll<NetworkPerson>((cursor) =>
    query(
      base,
      where("ownerUid", "==", ownerUid),
      orderBy("displayName", "asc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize)
    ), pageSize);
}

async function listEdgesForOwner(projectId: string, ownerUid: string) {
  const base = collection(getFirebaseServices().db, "projects", projectId, "networkEdges");
  const pageSize = 400;
  return getAll<NetworkEdge>((cursor) =>
    query(
      base,
      where("ownerUid", "==", ownerUid),
      orderBy("__name__"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize)
    ), pageSize);
}

export async function listNetworkPeople(projectId: string, user: User, sharedOnly = false) {
  if (!sharedOnly) return listPeopleForOwner(projectId, user.uid);
  const owners = await enabledContributionUids(projectId);
  return (await Promise.all(owners.map((ownerUid) => listPeopleForOwner(projectId, ownerUid)))).flat();
}

export async function listNetworkEdges(projectId: string, user: User, sharedOnly = false) {
  if (!sharedOnly) return listEdgesForOwner(projectId, user.uid);
  const owners = await enabledContributionUids(projectId);
  return (await Promise.all(owners.map((ownerUid) => listEdgesForOwner(projectId, ownerUid)))).flat();
}

export async function listAuthorisedNetworkGraph(projectId: string, user: User) {
  const [privatePeople, sharedPeople, privateEdges, sharedEdges] = await Promise.all([
    listNetworkPeople(projectId, user, false), listNetworkPeople(projectId, user, true),
    listNetworkEdges(projectId, user, false), listNetworkEdges(projectId, user, true),
  ]);
  const rawPeople = [...new Map([...privatePeople, ...sharedPeople].map((person) => [person.id, person])).values()];
  const canonicalByFingerprint = new Map<string, string>(); const alias = new Map<string, string>();
  for (const person of [...rawPeople].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!person.identityFingerprint) { alias.set(person.id, person.id); continue; }
    const canonical = canonicalByFingerprint.get(person.identityFingerprint) || person.id;
    canonicalByFingerprint.set(person.identityFingerprint, canonical); alias.set(person.id, canonical);
  }
  const people = rawPeople.filter((person) => alias.get(person.id) === person.id);
  const rawEdges = [...new Map([...privateEdges, ...sharedEdges].map((edge) => [edge.id, edge])).values()];
  const personIds = new Set(people.map((person) => person.id));
  const edges = rawEdges
    .map((edge) => ({ ...edge, sourcePersonId: alias.get(edge.sourcePersonId) || edge.sourcePersonId, targetPersonId: alias.get(edge.targetPersonId) || edge.targetPersonId }))
    .filter((edge) => edge.sourcePersonId !== edge.targetPersonId && personIds.has(edge.sourcePersonId) && personIds.has(edge.targetPersonId));
  return { people, edges, complete: true, loadedPeople: rawPeople.length, loadedEdges: rawEdges.length };
}

export async function bindSelfLinkedInIdentity(projectId: string, user: User, profileUrl: string) {
  const normal = normalizeLinkedInUrl(profileUrl);
  if (!normal || !/^https:\/\/(?:www\.)?linkedin\.com\/in\//i.test(normal)) throw new Error("Enter your LinkedIn profile URL, such as linkedin.com/in/your-name.");
  const fingerprint = await stableId(`linkedin:${normal.toLowerCase()}`);
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, "projects", projectId, "networkPeople", `user_${user.uid}`), { linkedinProfileUrl: normal, identityFingerprint: fingerprint, email: deleteField(), updatedAt: serverTimestamp() });
  if (user.email) await setDoc(doc(db, "projects", projectId, "networkPrivateFields", `user_${user.uid}`), { ownerUid: user.uid, email: user.email, schemaVersion: 2, updatedAt: serverTimestamp() }, { merge: true });
  return { profileUrl: normal, identityFingerprint: fingerprint };
}

const CONTRIBUTION_PRIVACY_PREP_VERSION = 2;

async function prepareNetworkContributionPrivacy(projectId: string, user: User) {
  const { db } = getFirebaseServices();
  const contributionRef = doc(db, "projects", projectId, "networkContributions", user.uid);
  const existing = await getDoc(contributionRef);
  const preparedVersion = existing.exists() ? Number(existing.data().privacyPreparedVersion || 0) : 0;
  if (preparedVersion >= CONTRIBUTION_PRIVACY_PREP_VERSION) return;

  // Revoke read permission first. Shared reads stay closed for the entire one-time privacy preparation.
  await setDoc(contributionRef, {
    ownerUid: user.uid,
    enabled: false,
    consentVersion: 1,
    updatedAt: serverTimestamp()
  }, { merge: true });

  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  for (;;) {
    const page = await getDocs(query(
      collection(db, "projects", projectId, "networkPeople"),
      where("ownerUid", "==", user.uid),
      orderBy("__name__"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(400)
    ));
    if (page.empty) break;

    const batch = writeBatch(db);
    page.docs.forEach((snapshot) => {
      batch.update(snapshot.ref, {
        email: deleteField(),
        personalNotes: deleteField(),
        privateMetadata: deleteField(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();

    if (page.size < 400) break;
    cursor = page.docs.at(-1);
  }

  await setDoc(contributionRef, {
    ownerUid: user.uid,
    enabled: false,
    consentVersion: 1,
    privacyPreparedVersion: CONTRIBUTION_PRIVACY_PREP_VERSION,
    privacyPreparedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function setNetworkContribution(projectId: string, user: User, enabled: boolean) {
  const { db } = getFirebaseServices();
  const contributionRef = doc(db, "projects", projectId, "networkContributions", user.uid);

  if (!enabled) {
    // OFF is deliberately cheap and immediate: one consent document closes shared reads.
    await setDoc(contributionRef, {
      ownerUid: user.uid,
      enabled: false,
      consentVersion: 1,
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return;
  }

  // First ON may perform one legacy privacy cleanup. Later ON operations are one consent write.
  await prepareNetworkContributionPrivacy(projectId, user);
  await setDoc(contributionRef, {
    ownerUid: user.uid,
    enabled: true,
    visibility: "project",
    consentVersion: 1,
    consentedAt: serverTimestamp(),
    revokedAt: deleteField(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getNetworkContribution(projectId: string, uid: string) {
  const snapshot = await getDoc(doc(getFirebaseServices().db, "projects", projectId, "networkContributions", uid));
  return snapshot.exists() && snapshot.data().enabled === true;
}
