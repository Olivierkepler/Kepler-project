import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";
import { createWorkPackageAssignmentId } from "../domain/workPackageAssignmentId.js";
import { normalizeProjectMemberDocument } from "../validation/projectMember.js";
import {
  isBlockingAssignmentStatus,
  normalizeWorkPackageAssignmentDocument,
} from "../validation/workPackageAssignment.js";
import { normalizeWorkPackageDocument } from "../validation/workPackage.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function assignmentsCollection() {
  return db.collection(COLLECTIONS.workPackageAssignments);
}

function sortAssignments(
  items: WorkPackageAssignment[],
): WorkPackageAssignment[] {
  return [...items].sort((a, b) => {
    const createdCmp = b.createdAt.localeCompare(a.createdAt);
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export async function getWorkPackageAssignmentById(
  assignmentId: string,
): Promise<WorkPackageAssignment | undefined> {
  requireId(assignmentId, "assignmentId");

  const snapshot = await assignmentsCollection().doc(assignmentId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeWorkPackageAssignmentDocument(snapshot.data());
}

export async function listWorkPackageAssignmentsForProject(
  projectId: string,
): Promise<WorkPackageAssignment[]> {
  requireId(projectId, "projectId");

  const snapshot = await assignmentsCollection()
    .where("projectId", "==", projectId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeWorkPackageAssignmentDocument(doc.data()))
    .filter((item): item is WorkPackageAssignment => item !== undefined);

  return sortAssignments(items);
}

export type CreateWorkPackageAssignmentResult =
  | { created: true; assignment: WorkPackageAssignment }
  | {
      created: false;
      reason:
        | "duplicate"
        | "work_package_not_found"
        | "work_package_wrong_project"
        | "member_not_found"
        | "member_wrong_project"
        | "member_not_active";
      assignment?: WorkPackageAssignment;
    };

/**
 * Create-if-absent for an active assignment relationship.
 *
 * Verifies WorkPackage + ACTIVE ProjectMember belong to projectId inside
 * a Firestore transaction, then rejects when a blocking-status assignment
 * already exists for the same projectId + workPackageId + projectMemberId.
 *
 * Concurrent creates are serialized by the projectId query in the
 * transaction (same pattern as project invitations).
 */
export async function createWorkPackageAssignmentIfAbsent(
  input: {
    projectId: string;
    workPackageId: string;
    projectMemberId: string;
    status: WorkPackageAssignment["status"];
  },
  nowIso: string = new Date().toISOString(),
): Promise<CreateWorkPackageAssignmentResult> {
  const projectId = input.projectId.trim();
  const workPackageId = input.workPackageId.trim();
  const projectMemberId = input.projectMemberId.trim();

  requireId(projectId, "projectId");
  requireId(workPackageId, "workPackageId");
  requireId(projectMemberId, "projectMemberId");

  const assignmentId = createWorkPackageAssignmentId();
  const candidate: WorkPackageAssignment = {
    id: assignmentId,
    projectId,
    workPackageId,
    projectMemberId,
    status: input.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const normalized = normalizeWorkPackageAssignmentDocument(candidate);

  if (!normalized) {
    throw new Error("Invalid work package assignment.");
  }

  return db.runTransaction(async (tx) => {
    const workPackageSnap = await tx.get(
      db.collection(COLLECTIONS.workPackages).doc(workPackageId),
    );

    if (!workPackageSnap.exists) {
      return {
        created: false as const,
        reason: "work_package_not_found" as const,
      };
    }

    const workPackage = normalizeWorkPackageDocument(workPackageSnap.data());

    if (!workPackage) {
      return {
        created: false as const,
        reason: "work_package_not_found" as const,
      };
    }

    if (workPackage.projectId !== projectId) {
      return {
        created: false as const,
        reason: "work_package_wrong_project" as const,
      };
    }

    const memberSnap = await tx.get(
      db.collection(COLLECTIONS.projectMembers).doc(projectMemberId),
    );

    if (!memberSnap.exists) {
      return {
        created: false as const,
        reason: "member_not_found" as const,
      };
    }

    const member = normalizeProjectMemberDocument(memberSnap.data());

    if (!member) {
      return {
        created: false as const,
        reason: "member_not_found" as const,
      };
    }

    if (member.projectId !== projectId) {
      return {
        created: false as const,
        reason: "member_wrong_project" as const,
      };
    }

    if (member.status !== "active") {
      return {
        created: false as const,
        reason: "member_not_active" as const,
      };
    }

    const projectAssignmentsSnap = await tx.get(
      assignmentsCollection().where("projectId", "==", projectId),
    );

    for (const doc of projectAssignmentsSnap.docs) {
      const existing = normalizeWorkPackageAssignmentDocument(doc.data());

      if (
        existing &&
        existing.workPackageId === workPackageId &&
        existing.projectMemberId === projectMemberId &&
        isBlockingAssignmentStatus(existing.status)
      ) {
        return {
          created: false as const,
          reason: "duplicate" as const,
          assignment: existing,
        };
      }
    }

    const ref = assignmentsCollection().doc(normalized.id);
    tx.create(ref, normalized);
    return { created: true as const, assignment: normalized };
  });
}

/**
 * Narrow status update. Server owns updatedAt.
 * Returns undefined when missing.
 */
export async function updateWorkPackageAssignmentStatus(
  assignmentId: string,
  status: WorkPackageAssignment["status"],
  nowIso: string = new Date().toISOString(),
): Promise<WorkPackageAssignment | undefined> {
  requireId(assignmentId, "assignmentId");

  const existing = await getWorkPackageAssignmentById(assignmentId);

  if (!existing) {
    return undefined;
  }

  if (existing.status === status) {
    return existing;
  }

  const next: WorkPackageAssignment = {
    ...existing,
    status,
    updatedAt: nowIso,
  };

  await assignmentsCollection().doc(assignmentId).update({
    status,
    updatedAt: nowIso,
  });

  return next;
}

/**
 * Physically deletes the Assignment document.
 * Returns false when already absent.
 * Does not cascade to ProjectMember / WorkPackage / PlanItems.
 */
export async function deleteWorkPackageAssignmentById(
  assignmentId: string,
): Promise<boolean> {
  requireId(assignmentId, "assignmentId");

  const ref = assignmentsCollection().doc(assignmentId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  await ref.delete();
  return true;
}
