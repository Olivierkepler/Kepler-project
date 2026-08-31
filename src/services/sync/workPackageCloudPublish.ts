/**
 * Owner WorkPackage + Assignment → cloud publish (collaboration phase).
 *
 * Preserves local owner writes; publishes to existing remote WorkPackage /
 * WorkPackageAssignment APIs so Field Member assigned_scope can resolve.
 *
 * Does not invent a second assignment model. Does not mutate shared reads.
 */

import {
  createRemoteWorkPackageAssignment,
  deleteRemoteWorkPackageAssignment,
  getRemoteWorkPackageAssignmentsForProject,
} from "../api/workPackageAssignments";
import {
  createRemoteWorkPackage,
  updateRemoteWorkPackage,
} from "../api/workPackages";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import {
  getRemoteWorkPackageId,
  setWorkPackageCloudMapping,
} from "../../store/workPackageCloudMappings";
import type { WorkPackageStatus } from "../../types/workPackage";
import { ensureRemotePlanItem } from "./planItemBootstrap";

export { resolveCloudProjectMemberId } from "../../utils/domain/workPackageCloudIdentity";

export type PublishWorkPackageCloudInput = {
  ownerUid: string;
  localProjectId: string;
  localWorkPackage: {
    id: string;
    name: string;
    description?: string;
    status: WorkPackageStatus;
    /** Local PlanItem ids. */
    planItemIds: string[];
  };
  /**
   * Exact set of cloud ProjectMember.ids that should have an active assignment
   * on this work package. Empty array clears all active remote assignments.
   */
  desiredCloudProjectMemberIds: readonly string[];
};

export type PublishWorkPackageCloudResult =
  | {
      ok: true;
      skipped: true;
      reason: "project_not_cloud_mapped";
    }
  | {
      ok: true;
      skipped: false;
      remoteProjectId: string;
      remoteWorkPackageId: string;
    }
  | {
      ok: false;
      skipped: false;
      error: string;
    };

async function mapLocalPlanItemIdsToRemote(input: {
  ownerUid: string;
  localProjectId: string;
  localPlanItemIds: readonly string[];
}): Promise<{ ok: true; remoteIds: string[] } | { ok: false; error: string }> {
  const remoteIds: string[] = [];

  for (const localPlanItemId of input.localPlanItemIds) {
    const remoteId = await ensureRemotePlanItem(
      input.ownerUid,
      input.localProjectId,
      localPlanItemId,
    );

    if (!remoteId) {
      return {
        ok: false,
        error:
          "One or more plan items are not available in cloud yet. Connect / sync plan items, then try again.",
      };
    }

    if (!remoteIds.includes(remoteId)) {
      remoteIds.push(remoteId);
    }
  }

  return { ok: true, remoteIds };
}

async function ensureRemoteWorkPackageRecord(input: {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
  localWorkPackageId: string;
  name: string;
  description?: string;
  status: WorkPackageStatus;
  remotePlanItemIds: string[];
}): Promise<
  { ok: true; remoteWorkPackageId: string } | { ok: false; error: string }
> {
  const existingRemoteId = await getRemoteWorkPackageId(
    input.ownerUid,
    input.localProjectId,
    input.localWorkPackageId,
  );

  try {
    if (existingRemoteId) {
      await updateRemoteWorkPackage(input.remoteProjectId, existingRemoteId, {
        name: input.name,
        description: input.description ?? "",
        status: input.status,
        planItemIds: input.remotePlanItemIds,
      });

      return { ok: true, remoteWorkPackageId: existingRemoteId };
    }

    const created = await createRemoteWorkPackage(input.remoteProjectId, {
      name: input.name,
      ...(input.description !== undefined && input.description.trim().length > 0
        ? { description: input.description }
        : {}),
      status: input.status,
      planItemIds: input.remotePlanItemIds,
    });

    await setWorkPackageCloudMapping({
      ownerUid: input.ownerUid,
      localProjectId: input.localProjectId,
      remoteProjectId: input.remoteProjectId,
      localWorkPackageId: input.localWorkPackageId,
      remoteWorkPackageId: created.id,
    });

    return { ok: true, remoteWorkPackageId: created.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to publish work package to cloud.",
    };
  }
}

async function syncRemoteAssignmentsForWorkPackage(input: {
  remoteProjectId: string;
  remoteWorkPackageId: string;
  desiredCloudProjectMemberIds: readonly string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const desired = [
      ...new Set(
        input.desiredCloudProjectMemberIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ];

    const assignments = await getRemoteWorkPackageAssignmentsForProject(
      input.remoteProjectId,
    );

    const activeForPackage = assignments.filter(
      (assignment) =>
        assignment.workPackageId === input.remoteWorkPackageId &&
        assignment.status !== "cancelled",
    );

    const desiredSet = new Set(desired);

    for (const assignment of activeForPackage) {
      if (!desiredSet.has(assignment.projectMemberId)) {
        await deleteRemoteWorkPackageAssignment(
          input.remoteProjectId,
          assignment.id,
        );
      }
    }

    const presentMemberIds = new Set(
      activeForPackage
        .filter((assignment) => desiredSet.has(assignment.projectMemberId))
        .map((assignment) => assignment.projectMemberId),
    );

    for (const memberId of desired) {
      if (presentMemberIds.has(memberId)) {
        continue;
      }

      try {
        await createRemoteWorkPackageAssignment(input.remoteProjectId, {
          workPackageId: input.remoteWorkPackageId,
          projectMemberId: memberId,
          status: "assigned",
        });
      } catch (createError) {
        const message =
          createError instanceof Error ? createError.message : "";

        // Idempotent: duplicate active assignment is success.
        if (
          !message.includes(
            "An active assignment already exists for this work package and member.",
          )
        ) {
          throw createError;
        }
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to publish work package assignment to cloud.",
    };
  }
}

/**
 * Publish a local WorkPackage + desired assignee to cloud.
 * Local stores are not modified. Immediate (not queued).
 *
 * When the project has no cloud mapping, returns skipped — local-only.
 */
export async function publishWorkPackageToCloud(
  input: PublishWorkPackageCloudInput,
): Promise<PublishWorkPackageCloudResult> {
  const ownerUid = input.ownerUid.trim();
  const localProjectId = input.localProjectId.trim();

  if (!ownerUid || !localProjectId || !input.localWorkPackage.id.trim()) {
    return {
      ok: false,
      skipped: false,
      error: "Invalid work package publish request.",
    };
  }

  const remoteProjectId = await getRemoteProjectId(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return {
      ok: true,
      skipped: true,
      reason: "project_not_cloud_mapped",
    };
  }

  const planItemMap = await mapLocalPlanItemIdsToRemote({
    ownerUid,
    localProjectId,
    localPlanItemIds: input.localWorkPackage.planItemIds,
  });

  if (!planItemMap.ok) {
    return { ok: false, skipped: false, error: planItemMap.error };
  }

  const workPackageResult = await ensureRemoteWorkPackageRecord({
    ownerUid,
    localProjectId,
    remoteProjectId,
    localWorkPackageId: input.localWorkPackage.id,
    name: input.localWorkPackage.name,
    description: input.localWorkPackage.description,
    status: input.localWorkPackage.status,
    remotePlanItemIds: planItemMap.remoteIds,
  });

  if (!workPackageResult.ok) {
    return { ok: false, skipped: false, error: workPackageResult.error };
  }

  const assignmentResult = await syncRemoteAssignmentsForWorkPackage({
    remoteProjectId,
    remoteWorkPackageId: workPackageResult.remoteWorkPackageId,
    desiredCloudProjectMemberIds: input.desiredCloudProjectMemberIds,
  });

  if (!assignmentResult.ok) {
    return { ok: false, skipped: false, error: assignmentResult.error };
  }

  return {
    ok: true,
    skipped: false,
    remoteProjectId,
    remoteWorkPackageId: workPackageResult.remoteWorkPackageId,
  };
}
