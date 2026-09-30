import type { Project } from "../domain/project.js";
import type { ProjectAccessContext } from "../services/collaboration/projectAccessScope.js";
import { isActivityVisibleToAccess } from "../services/activity/activityVisibility.js";
import { buildEvidenceCreatedActivity } from "../services/activity/evidenceActivityProjection.js";
import { normalizeActivityEventDocument } from "../validation/activityEvent.js";
import type { Evidence } from "../domain/evidence.js";
import type { Measurement } from "../domain/measurement.js";
import type { Delta } from "../domain/delta.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const evidence: Evidence = {
  id: "remote-evidence-1",
  ownerUid: "project-owner",
  projectId: "remote-project-1",
  localEvidenceId: "local-evidence-1",
  type: "photo",
  note: "caption must not be copied into Activity",
  objectPath: "private/storage/object/path.jpg",
  contentType: "image/jpeg",
  createdAt: "2026-09-30T14:00:00.000Z",
  localMeasurementId: "local-measurement-1",
  localDeltaId: null,
  capturedByUid: "member-uid-1",
};
const measurement: Measurement = {
  id: "remote-measurement-1",
  localMeasurementId: "local-measurement-1",
  projectId: evidence.projectId,
  planItemId: "remote-plan-item-1",
  type: "length",
  label: "Main conduit run",
  value: 21,
  unit: "ft",
  createdAt: evidence.createdAt,
  submittedWorkPackageId: "remote-work-package-1",
};

const event = buildEvidenceCreatedActivity({
  evidence,
  actorUid: "member-uid-1",
  measurement,
});
assert(event.type === "evidence_created", "event type");
assert(normalizeActivityEventDocument(event) !== undefined, "backend Activity validation accepts Evidence events");
assert(event.subjectType === "evidence", "evidence subject");
assert(event.actorType === "human" && event.actorUid === "member-uid-1", "authenticated actor");
assert(event.related.evidenceId === evidence.id, "canonical Evidence ID");
assert(event.related.measurementId === measurement.id, "canonical Measurement ID");
assert(event.related.planItemId === measurement.planItemId, "canonical Plan Item ID");
assert(event.related.workPackageId === measurement.submittedWorkPackageId, "canonical Work Package ID");
assert(event.scopePlanItemIds?.[0] === measurement.planItemId, "Plan Item access scope");
assert(event.related.workPackageId === measurement.submittedWorkPackageId, "Work Package presentation reference");
assert(!event.scopeWorkPackageIds, "Work Package reference does not broaden Evidence access scope");
assert(event.createdAt === evidence.createdAt, "durable Evidence timestamp");

const activityJson = JSON.stringify(event);
assert(!activityJson.includes("private/storage"), "storage path is not projected");
assert(!activityJson.includes("caption must not"), "note body is not projected");
assert(!activityJson.includes("signed"), "signed URLs are not projected");
assert(!activityJson.includes("displayName") && !activityJson.includes("email"), "identity presentation is not projected");

const eventRetry = buildEvidenceCreatedActivity({ evidence, actorUid: "member-uid-1", measurement });
assert(eventRetry.id === event.id, "deterministic retry ID");
const inMemoryActivity = new Map<string, typeof event>();
for (const candidate of [event, eventRetry]) {
  if (!inMemoryActivity.has(candidate.id)) inMemoryActivity.set(candidate.id, candidate);
}
assert(inMemoryActivity.size === 1, "retry does not duplicate the event identity");

const delta: Delta = {
  id: "remote-delta-1",
  localDeltaId: "local-delta-1",
  projectId: evidence.projectId,
  planItemId: "remote-plan-item-delta",
  measurementId: "remote-measurement-delta",
  type: "length",
  plannedValue: 40,
  actualValue: 21,
  difference: -19,
  percentDifference: -47.5,
  unit: "ft",
  unitCost: 0,
  costImpact: 0,
  productionRatePerDay: 0,
  scheduleImpactDays: 0,
  laborHoursPerUnit: 0,
  laborImpactHours: 0,
  status: "open",
  dispositionReason: "",
  disposedAt: null,
  createdAt: evidence.createdAt,
};
const deltaEvidence = { ...evidence, id: "remote-evidence-delta", localMeasurementId: null, localDeltaId: "local-delta-1" };
const deltaEvent = buildEvidenceCreatedActivity({
  evidence: deltaEvidence,
  actorUid: "member-uid-1",
  delta,
  deltaMeasurement: { ...measurement, id: delta.measurementId, localMeasurementId: "measurement-delta" },
});
assert(deltaEvent.related.deltaId === delta.id, "canonical Delta ID");
assert(deltaEvent.related.planItemId === delta.planItemId, "Delta Plan Item scope");

const project = { id: evidence.projectId } as Project;
function access(
  role: ProjectAccessContext["role"],
  assignedPlan: string[] = [],
  assignedWorkPackages: string[] = [],
): ProjectAccessContext {
  return {
    project,
    currentUserId: "viewer-uid",
    isOwner: role === "owner",
    membership: null,
    role,
    accessMode: role === "contractor" || role === "field_member" ? "assigned_scope" : "full",
    assignedWorkPackageIds: assignedWorkPackages,
    assignedPlanItemIds: assignedPlan,
  };
}

assert(isActivityVisibleToAccess(event, access("owner")), "owner sees evidence Activity");
assert(isActivityVisibleToAccess(event, access("field_member", [measurement.planItemId])), "assigned member sees evidence in scope");
assert(!isActivityVisibleToAccess(event, access("field_member", ["other-plan-item"])), "assigned member cannot see evidence outside scope");
assert(!isActivityVisibleToAccess(event, access("field_member", [], [measurement.submittedWorkPackageId!])), "Work Package responsibility alone does not expose Evidence outside Evidence API scope");
assert(isActivityVisibleToAccess(event, access("viewer")), "viewer follows operational Activity allowlist");

const unlinkedEvent = buildEvidenceCreatedActivity({
  evidence: { ...evidence, localMeasurementId: null, localDeltaId: null },
  actorUid: "member-uid-1",
});
assert(!isActivityVisibleToAccess(unlinkedEvent, access("field_member", [measurement.planItemId])), "unlinked project evidence is hidden from assigned scope");

console.log("evidenceActivityProjectionTest: PASS");
