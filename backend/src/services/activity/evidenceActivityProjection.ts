import type { ActivityEvent } from "../../domain/activityEvent.js";
import { buildActivityEventId } from "../../domain/activityEvent.js";
import type { Delta } from "../../domain/delta.js";
import type { Evidence } from "../../domain/evidence.js";
import type { Measurement } from "../../domain/measurement.js";

/** Build a minimal, privacy-safe Activity index for one durable Evidence row. */
export function buildEvidenceCreatedActivity(input: {
  evidence: Evidence;
  actorUid: string;
  measurement?: Measurement;
  delta?: Delta;
  deltaMeasurement?: Measurement;
}): ActivityEvent {
  const { evidence } = input;
  const related: ActivityEvent["related"] = { evidenceId: evidence.id };
  let planItemId: string | undefined;
  let workPackageId: string | undefined;

  if (
    evidence.localMeasurementId &&
    input.measurement?.projectId === evidence.projectId &&
    input.measurement.localMeasurementId === evidence.localMeasurementId
  ) {
    related.measurementId = input.measurement.id;
    planItemId = input.measurement.planItemId;
    workPackageId = input.measurement.submittedWorkPackageId;
  } else if (
    evidence.localDeltaId &&
    input.delta?.projectId === evidence.projectId &&
    input.delta.localDeltaId === evidence.localDeltaId
  ) {
    related.deltaId = input.delta.id;
    planItemId = input.delta.planItemId;
    if (
      input.deltaMeasurement?.projectId === evidence.projectId &&
      input.deltaMeasurement.id === input.delta.measurementId
    ) {
      related.measurementId = input.deltaMeasurement.id;
      workPackageId = input.deltaMeasurement.submittedWorkPackageId;
    }
  }

  if (planItemId?.trim()) related.planItemId = planItemId.trim();
  if (workPackageId?.trim()) related.workPackageId = workPackageId.trim();

  return {
    id: buildActivityEventId({
      kind: "evidence-create",
      sourceId: `${evidence.projectId}:${evidence.id}`,
    }),
    projectId: evidence.projectId,
    type: "evidence_created",
    actorType: "human",
    actorUid: input.actorUid,
    subjectType: "evidence",
    subjectId: evidence.id,
    sourceType: "evidence_create",
    sourceId: evidence.id,
    related,
    // Evidence reads for assigned-scope users are authorized through linked
    // Plan Item scope. Work Package membership alone is broader than the
    // existing Evidence API policy, so it is presentation context only.
    ...(planItemId?.trim() ? { scopePlanItemIds: [planItemId.trim()] } : {}),
    createdAt: evidence.createdAt,
  };
}
