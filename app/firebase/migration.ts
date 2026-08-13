"use client";

import { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { WORKSPACE_BACKUP_KEY, WORKSPACE_STORAGE_KEY, Workspace, normalizeWorkspace, serializeWorkspace } from "../graphStore";
import { getFirebaseServices } from "./client";

export type MigrationStatus = "not-needed" | "available" | "complete";

export async function getLocalMigrationStatus(user: User, workspace: Workspace): Promise<MigrationStatus> {
  if (user.isAnonymous || !workspace.projects.length) return "not-needed";
  const marker = await getDoc(doc(getFirebaseServices().db, "users", user.uid, "migrations", "localWorkspaceV3"));
  return marker.exists() && marker.data().state === "complete" ? "complete" : "available";
}

export async function migrateLocalWorkspace(user: User, workspace: Workspace) {
  if (user.isAnonymous) throw new Error("Create a permanent account before moving local projects to the cloud.");
  const normalized = normalizeWorkspace(workspace);
  if (!normalized) throw new Error("Circa could not validate this local workspace.");
  if (typeof window !== "undefined" && !window.localStorage.getItem(WORKSPACE_BACKUP_KEY)) {
    window.localStorage.setItem(WORKSPACE_BACKUP_KEY, window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || serializeWorkspace(normalized));
  }

  const { db } = getFirebaseServices();
  const markerRef = doc(db, "users", user.uid, "migrations", "localWorkspaceV3");
  const marker = await getDoc(markerRef);
  if (marker.exists() && marker.data().state === "complete") return;

  let batch = writeBatch(db);
  let writes = 0;
  const flush = async () => { if (!writes) return; await batch.commit(); batch = writeBatch(db); writes = 0; };
  for (const project of normalized.projects) {
    batch.set(doc(db, "projects", project.id), {
      name: project.name, description: "", location: "", projectMode: project.projectMode || "map", category: project.category,
      ownerId: user.uid, schemaVersion: project.schemaVersion || 1, archived: project.archived, favourite: project.favourite,
      graphMetadata: { version: project.graph.version, viewport: project.graph.viewport, onboardingComplete: project.graph.onboardingComplete, updatedAt: project.graph.updatedAt }, customCategoryName: project.customCategoryName, customRelationshipLabels: project.customRelationshipLabels,
      importedFromLocal: true, createdAt: project.createdAt, updatedAt: serverTimestamp(),
    }, { merge: true });
    writes += 1;
    batch.set(doc(db, "projects", project.id, "members", user.uid), {
      uid: user.uid, role: "owner", status: "active", displayName: user.displayName || user.email || "Project owner",
      isAnonymous: false, joinedViaInviteId: "", consentVersion: 1, joinedAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1,
    }, { merge: true });
    writes += 1;
    const records = [
      ...project.graph.people.map((value) => ({ collectionName: "mapPeople", id: value.id, value })),
      ...project.graph.relationships.map((value) => ({ collectionName: "mapRelationships", id: value.id, value })),
      ...project.graph.groups.map((value) => ({ collectionName: "mapGroups", id: value.id, value })),
      ...project.graph.notes.map((value) => ({ collectionName: "mapNotes", id: value.id, value })),
    ];
    for (const record of records) {
      batch.set(doc(db, "projects", project.id, record.collectionName, record.id), { ...record.value, ownerUid: user.uid, schemaVersion: 1, migratedAt: serverTimestamp() }, { merge: true });
      writes += 1;
      if (writes >= 380) await flush();
    }
    if (writes >= 380) await flush();
  }
  await flush();
  batch = writeBatch(db);
  batch.set(doc(db, "users", user.uid, "workspaces", "default"), {
    version: normalized.version, projectIds: normalized.projects.map((project) => project.id), folderCount: normalized.folders.length,
    sourceRevision: normalized.revision, migratedAt: serverTimestamp(), schemaVersion: 1,
  }, { merge: true });
  batch.set(markerRef, { state: "complete", sourceRevision: normalized.revision, projectCount: normalized.projects.length, schemaVersion: 1, completedAt: serverTimestamp() });
  await batch.commit();

  const verified = await getDoc(markerRef);
  if (!verified.exists() || verified.data().state !== "complete") throw new Error("Circa copied the projects but could not verify the migration marker. Your local copy is still safe.");
}
