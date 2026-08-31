import { resolveEvidenceRequestRecipient } from "../domain/evidenceRequestRecipient.js";
import { listProjectMembersForProject } from "../repositories/projectMembersRepository.js";
import { listWorkPackageAssignmentsForProject } from "../repositories/workPackageAssignmentsRepository.js";
import { listWorkPackagesForProject } from "../repositories/workPackagesRepository.js";

/**
 * Application-controlled recipient for a Delta Evidence request.
 * Returns ProjectMember.id or null (owner fallback).
 */
export async function resolveRequestedProjectMemberIdForPlanItem(args: {
  projectId: string;
  planItemId: string;
}): Promise<string | null> {
  const projectId = args.projectId.trim();
  const planItemId = args.planItemId.trim();
  if (!projectId || !planItemId) {
    return null;
  }

  const [workPackages, assignments, members] = await Promise.all([
    listWorkPackagesForProject(projectId),
    listWorkPackageAssignmentsForProject(projectId),
    listProjectMembersForProject(projectId),
  ]);

  const resolved = resolveEvidenceRequestRecipient({
    projectId,
    planItemId,
    workPackages,
    assignments,
    members,
  });

  return resolved.kind === "unique" ? resolved.projectMemberId : null;
}
