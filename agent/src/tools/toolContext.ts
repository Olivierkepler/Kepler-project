import type { AgentRun } from "../domain/agentRun.js";
import type { DirectDeltaEvidencePolicy } from "../domain/assessment.js";
import type { Delta } from "../domain/delta.js";
import type { Evidence } from "../domain/evidence.js";
import type { Measurement } from "../domain/measurement.js";
import type { PlanItem } from "../domain/planItem.js";
import type { Project } from "../domain/project.js";
import type { ProjectMember } from "../domain/projectMember.js";
import type { WorkPackage } from "../domain/workPackage.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";

/** Trusted scope + helpers for Field Variance read tools (A3). */

export class ToolAuthorizationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolAuthorizationError";
    this.code = code;
  }
}

export type SafeEvidenceView = {
  id: string;
  type: Evidence["type"];
  note: string | null;
  createdAt: string;
  localDeltaId: string | null;
  localMeasurementId: string | null;
  hasStoredObject: boolean;
};

/**
 * Optional collaboration provenance loaders (Phase 2L.1).
 * When absent, getMeasurement omits the provenance bundle.
 */
export type DomainLoaders = {
  getProjectById(projectId: string): Promise<Project | undefined>;
  getPlanItemById(planItemId: string): Promise<PlanItem | undefined>;
  getMeasurementById(measurementId: string): Promise<Measurement | undefined>;
  getDeltaById(deltaId: string): Promise<Delta | undefined>;
  getEvidenceForProject(projectId: string): Promise<Evidence[]>;
  getWorkPackageById?(
    workPackageId: string,
  ): Promise<WorkPackage | undefined>;
  getWorkPackageAssignmentById?(
    assignmentId: string,
  ): Promise<WorkPackageAssignment | undefined>;
  getProjectMemberById?(
    memberId: string,
  ): Promise<ProjectMember | undefined>;
};

export type TrustedToolContext = {
  agentRun: AgentRun;
  loaders: DomainLoaders;
};

export function toSafeEvidenceView(evidence: Evidence): SafeEvidenceView {
  return {
    id: evidence.id,
    type: evidence.type,
    note: evidence.type === "note" ? evidence.note : null,
    createdAt: evidence.createdAt,
    localDeltaId: evidence.localDeltaId,
    localMeasurementId: evidence.localMeasurementId,
    hasStoredObject: Boolean(evidence.objectPath),
  };
}

export function assertProjectOwnedByAgentRun(
  project: Project,
  agentRun: AgentRun,
): void {
  if (project.id !== agentRun.projectId) {
    throw new ToolAuthorizationError(
      "project_mismatch",
      "Project id does not match AgentRun.projectId",
    );
  }
  if (project.ownerUid !== agentRun.ownerUid) {
    throw new ToolAuthorizationError(
      "owner_mismatch",
      "Project ownerUid does not match AgentRun.ownerUid",
    );
  }
}

/**
 * Deterministic Evidence policy (code-owned).
 * Direct Delta docs = Evidence with matching projectId + localDeltaId.
 */
export function computeDirectDeltaEvidencePolicy(args: {
  agentRun: AgentRun;
  evidence: Evidence[];
}): DirectDeltaEvidencePolicy {
  const localDeltaId = args.agentRun.contextRefs.localDeltaId;
  const projectId = args.agentRun.projectId;
  const matching = args.evidence.filter(
    (item) =>
      item.projectId === projectId && item.localDeltaId === localDeltaId,
  );
  return {
    hasDirectDeltaEvidence: matching.length > 0,
    directDeltaEvidenceCount: matching.length,
  };
}
