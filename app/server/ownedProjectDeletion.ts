import type { DocumentData, DocumentReference, Firestore, Query } from "firebase-admin/firestore";

const DELETE_BATCH_SIZE = 400;

export type OwnedProjectDeletionStage =
  | "verify-ownership"
  | "collect-account-pointers"
  | "delete-account-pointers"
  | "delete-global-invitations"
  | "delete-project-tree"
  | "complete-operation";

export type OwnedProjectDeletionResult =
  | { status: "deleted" | "already-deleted" }
  | { status: "not-found" | "forbidden" | "confirmation-mismatch" };

type DeletionInput = {
  projectId: string;
  ownerUid: string;
  confirmation: string;
  onStage?: (stage: OwnedProjectDeletionStage) => void;
};

function cleanConfirmation(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

async function deleteReferencesInBatches(db: Firestore, references: DocumentReference<DocumentData>[]) {
  for (let offset = 0; offset < references.length; offset += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    for (const reference of references.slice(offset, offset + DELETE_BATCH_SIZE)) batch.delete(reference);
    await batch.commit();
  }
}

async function deleteQueryInPages(db: Firestore, makeQuery: () => Query<DocumentData>) {
  for (;;) {
    const page = await makeQuery().limit(DELETE_BATCH_SIZE).get();
    if (page.empty) return;
    await deleteReferencesInBatches(db, page.docs.map((document) => document.ref));
  }
}

export async function deleteOwnedProject(db: Firestore, input: DeletionInput): Promise<OwnedProjectDeletionResult> {
  const projectRef = db.doc(`projects/${input.projectId}`);
  const ownerMemberRef = db.doc(`projects/${input.projectId}/members/${input.ownerUid}`);
  const operationRef = db.doc(`users/${input.ownerUid}/projectDeletionOperations/${input.projectId}`);
  let resumed = false;

  input.onStage?.("verify-ownership");
  const verification = await db.runTransaction(async (transaction) => {
    const [project, operation, ownerMember] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(operationRef),
      transaction.get(ownerMemberRef),
    ]);
    const operationData = operation.data();

    if (!project.exists) {
      if (!operation.exists || operationData?.ownerUid !== input.ownerUid) return "not-found" as const;
      if (operationData?.status === "completed") return "already-deleted" as const;
      resumed = true;
    } else {
      if (project.data()?.ownerId !== input.ownerUid) return "forbidden" as const;
      if (operation.exists && operationData?.ownerUid !== input.ownerUid) return "forbidden" as const;
      if (!operation.exists) {
        if (!ownerMember.exists || ownerMember.data()?.role !== "owner" || ownerMember.data()?.status !== "active") return "forbidden" as const;
        if (cleanConfirmation(input.confirmation) !== cleanConfirmation(project.data()?.name)) return "confirmation-mismatch" as const;
      } else {
        resumed = true;
      }
    }

    const now = new Date();
    transaction.set(operationRef, {
      action: "delete-owned-project",
      ownerUid: input.ownerUid,
      projectId: input.projectId,
      projectMode: project.exists
        ? (project.data()?.projectMode === "network" ? "network" : "community")
        : (operationData?.projectMode === "network" ? "network" : "community"),
      status: "deleting",
      stage: "verify-ownership",
      startedAt: operationData?.startedAt || now,
      updatedAt: now,
      schemaVersion: 1,
    }, { merge: true });
    return "ready" as const;
  });

  if (verification !== "ready") return { status: verification };

  async function recordStage(stage: OwnedProjectDeletionStage) {
    input.onStage?.(stage);
    await operationRef.set({ status: "deleting", stage, updatedAt: new Date() }, { merge: true });
  }

  await recordStage("collect-account-pointers");
  const members = await db.collection(`projects/${input.projectId}/members`).get();
  const membershipPointers = members.docs.map((member) => db.doc(`users/${member.id}/memberships/${input.projectId}`));

  await recordStage("delete-account-pointers");
  await deleteReferencesInBatches(db, membershipPointers);

  await recordStage("delete-global-invitations");
  await deleteQueryInPages(db, () => db.collection("invites").where("projectId", "==", input.projectId));
  await deleteQueryInPages(db, () => db.collection("joinCodes").where("projectId", "==", input.projectId));

  await recordStage("delete-project-tree");
  await db.recursiveDelete(projectRef);

  input.onStage?.("complete-operation");
  await operationRef.set({
    status: "completed",
    stage: "complete-operation",
    resumed,
    completedAt: new Date(),
    updatedAt: new Date(),
  }, { merge: true });
  return { status: "deleted" };
}

function redactDiagnosticText(value: string) {
  return value
    .slice(0, 12_000)
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?/g, "[REDACTED_TOKEN]")
    .replace(/(["']?(?:authorization|token|secret|password|credential|private[_-]?key|service[_-]?account[_-]?json|api[_-]?key)["']?\s*[:=]\s*)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s,;}]+)/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "[REDACTED_PHONE]")
    .replace(/\b(users|members|memberDirectory|networkContributions|items|invites|invitations|joinCodes)\/[^/\s)]+/g, "$1/[REDACTED]");
}

export function reportOwnedProjectDeletionFailure(action: string, projectId: string, stage: OwnedProjectDeletionStage | "request", error: unknown) {
  const safeProjectId = /^[A-Za-z0-9_-]{1,160}$/.test(projectId) ? projectId : "invalid";
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error && error.stack ? error.stack : message;
  console.error(JSON.stringify({
    event: "circa_owned_project_deletion_failure",
    action: action === "delete-owned-project" ? action : "unknown",
    projectId: safeProjectId,
    stage,
    errorMessage: redactDiagnosticText(message),
    errorStack: redactDiagnosticText(stack),
  }));
}
