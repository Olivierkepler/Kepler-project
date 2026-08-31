/**
 * Plan Item ↔ AgentRun Delta ID correlation self-check.
 * Run: npx tsx src/utils/domain/planItemFieldContext.selftest.ts
 */

import type { AgentRunSummary } from "../../types/agentRun";
import type { Delta } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import {
  agentRunMatchesPlanItemDeltaId,
  getAgentRunsRelatedToPlanItem,
  getEvidenceRelatedToPlanItem,
  getLatestAgentRunForPlanItem,
} from "./planItemFieldContext";
import { mapRemoteEvidenceToDisplayEvidence } from "./sharedEvidenceDisplay";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const PLAN_ITEM_ID = "kem7_project-001_plan-002";
const LOCAL_DELTA_ID = "delta-1787522755994-44576";
const REMOTE_DELTA_ID =
  "kem7N1ij3lX7KOUDXW8YjF5NWGN2_project-001_delta-1787522755994-44576";

function makeDelta(id: string, planItemId = PLAN_ITEM_ID): Delta {
  return {
    id,
    projectId: "project-1",
    planItemId,
    measurementId: "measurement-1",
    type: "length",
    plannedValue: 40,
    actualValue: 12.08,
    difference: -27.92,
    percentDifference: -69.8,
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
    createdAt: "2026-08-23T22:05:55.994Z",
  };
}

function makeRun(
  overrides: Partial<AgentRunSummary> = {},
): AgentRunSummary {
  return {
    id: `field-variance:${REMOTE_DELTA_ID}`,
    workflowType: "field_variance",
    status: "waiting_for_evidence",
    currentStep: "waiting_for_evidence",
    pendingRequest: {
      kind: "delta_evidence",
      message: "Need supporting evidence.",
      requestedAt: "2026-08-23T22:06:21.739Z",
      requestedProjectMemberId: null,
    },
    outcome: null,
    createdAt: "2026-08-23T22:05:56.726Z",
    updatedAt: "2026-08-23T22:06:21.739Z",
    completedAt: null,
    lastEvidenceId: null,
    deltaContext: {
      localDeltaId: LOCAL_DELTA_ID,
      remoteDeltaId: REMOTE_DELTA_ID,
      localMeasurementId: "measurement-1787522755986-47973",
      remotePlanItemId: PLAN_ITEM_ID,
    },
    ...overrides,
  };
}

// --- Shared remote correlation ---
{
  const sharedDelta = makeDelta(REMOTE_DELTA_ID);
  const run = makeRun();
  assert(
    sharedDelta.id === run.deltaContext.remoteDeltaId,
    "fixture: shared delta id equals remoteDeltaId",
  );
  assert(
    sharedDelta.id !== run.deltaContext.localDeltaId,
    "fixture: shared delta id differs from localDeltaId",
  );
  assert(
    agentRunMatchesPlanItemDeltaId(run, sharedDelta.id),
    "shared: agentRunMatchesPlanItemDeltaId via remoteDeltaId",
  );
  const latest = getLatestAgentRunForPlanItem(
    [run],
    [sharedDelta],
    PLAN_ITEM_ID,
  );
  assert(latest?.id === run.id, "shared: getLatestAgentRunForPlanItem resolves");
  assert(
    getAgentRunsRelatedToPlanItem([run], [sharedDelta], PLAN_ITEM_ID).length ===
      1,
    "shared: getAgentRunsRelatedToPlanItem returns one run",
  );
}

// --- Owner/local regression ---
{
  const localDelta = makeDelta(LOCAL_DELTA_ID);
  const run = makeRun();
  assert(
    localDelta.id === run.deltaContext.localDeltaId,
    "fixture: local delta id equals localDeltaId",
  );
  assert(
    agentRunMatchesPlanItemDeltaId(run, localDelta.id),
    "owner/local: agentRunMatchesPlanItemDeltaId via localDeltaId",
  );
  const latest = getLatestAgentRunForPlanItem(
    [run],
    [localDelta],
    PLAN_ITEM_ID,
  );
  assert(
    latest?.id === run.id,
    "owner/local: getLatestAgentRunForPlanItem still resolves",
  );
}

// --- Unrelated Delta ---
{
  const otherDelta = makeDelta("unrelated-delta-id");
  const run = makeRun();
  assert(
    !agentRunMatchesPlanItemDeltaId(run, otherDelta.id),
    "unrelated: matcher rejects non-matching id",
  );
  assert(
    getLatestAgentRunForPlanItem([run], [otherDelta], PLAN_ITEM_ID) === null,
    "unrelated: no AgentRun association",
  );
}

// --- Missing / empty IDs ---
{
  const runEmptyLocal = makeRun({
    deltaContext: {
      localDeltaId: "   ",
      remoteDeltaId: REMOTE_DELTA_ID,
      localMeasurementId: "m1",
      remotePlanItemId: PLAN_ITEM_ID,
    },
  });
  assert(
    agentRunMatchesPlanItemDeltaId(runEmptyLocal, REMOTE_DELTA_ID),
    "empty local: still matches remote",
  );
  assert(
    !agentRunMatchesPlanItemDeltaId(runEmptyLocal, "   "),
    "empty query id: no accidental match",
  );
  assert(
    !agentRunMatchesPlanItemDeltaId(runEmptyLocal, ""),
    "blank query id: no match",
  );

  const runEmptyRemote = makeRun({
    deltaContext: {
      localDeltaId: LOCAL_DELTA_ID,
      remoteDeltaId: "",
      localMeasurementId: "m1",
      remotePlanItemId: PLAN_ITEM_ID,
    },
  });
  assert(
    agentRunMatchesPlanItemDeltaId(runEmptyRemote, LOCAL_DELTA_ID),
    "empty remote: still matches local",
  );
  assert(
    !agentRunMatchesPlanItemDeltaId(runEmptyRemote, REMOTE_DELTA_ID),
    "empty remote: does not match remote id string",
  );

  const runBothEmpty = makeRun({
    deltaContext: {
      localDeltaId: "",
      remoteDeltaId: "  ",
      localMeasurementId: "m1",
      remotePlanItemId: PLAN_ITEM_ID,
    },
  });
  assert(
    !agentRunMatchesPlanItemDeltaId(runBothEmpty, LOCAL_DELTA_ID),
    "both empty context ids: no match",
  );
}

// --- Plan item scoping preserved ---
{
  const sharedDelta = makeDelta(REMOTE_DELTA_ID, "other-plan-item");
  const run = makeRun();
  assert(
    getLatestAgentRunForPlanItem([run], [sharedDelta], PLAN_ITEM_ID) === null,
    "delta on other plan item is not associated",
  );
}

// --- Shared Evidence correlation (local* ↔ remote display ids) ---
const LOCAL_MEASUREMENT_ID = "measurement-1788014913072-27047";
const REMOTE_MEASUREMENT_ID =
  "kem7N1ij3lX7KOUDXW8YjF5NWGN2_project-001_measurement-1788014913072-27047";

function makeSharedDelta(): Delta {
  return {
    ...makeDelta(REMOTE_DELTA_ID),
    localDeltaId: LOCAL_DELTA_ID,
  };
}

function makeSharedMeasurement(): Measurement {
  return {
    id: REMOTE_MEASUREMENT_ID,
    projectId: "project-1",
    planItemId: PLAN_ITEM_ID,
    type: "length",
    label: "Conference room wall",
    value: 12.16,
    unit: "ft",
    createdAt: "2026-08-29T14:48:33.072Z",
    localMeasurementId: LOCAL_MEASUREMENT_ID,
  };
}

function makeEvidence(partial: Partial<Evidence> & Pick<Evidence, "id">): Evidence {
  return {
    projectId: "project-1",
    type: "photo",
    note: "",
    photoUri: null,
    createdAt: "2026-08-29T14:43:57.321Z",
    measurementId: null,
    deltaId: null,
    ...partial,
  };
}

{
  // Shared Delta-linked: API localDeltaId mapped onto Evidence.deltaId
  const mapped = mapRemoteEvidenceToDisplayEvidence({
    id: "remote-evidence-delta-1",
    projectId: "project-1",
    type: "photo",
    note: "This is an example of evidence",
    createdAt: "2026-08-29T14:43:57.321Z",
    localMeasurementId: null,
    localDeltaId: LOCAL_DELTA_ID,
  });
  assert(
    mapped.deltaId === LOCAL_DELTA_ID && mapped.measurementId === null,
    "mapRemoteEvidenceToDisplayEvidence preserves localDeltaId as deltaId",
  );
  const related = getEvidenceRelatedToPlanItem(
    [mapped],
    [makeSharedMeasurement()],
    [makeSharedDelta()],
    PLAN_ITEM_ID,
  );
  assert(
    related.length === 1 && related[0]!.id === mapped.id,
    "shared Delta-linked evidence resolves via localDeltaId",
  );
}

{
  // Shared Measurement-linked
  const mapped = mapRemoteEvidenceToDisplayEvidence({
    id: "remote-evidence-meas-1",
    projectId: "project-1",
    type: "photo",
    note: "",
    createdAt: "2026-08-29T14:48:34.157Z",
    localMeasurementId: LOCAL_MEASUREMENT_ID,
    localDeltaId: null,
  });
  assert(
    mapped.measurementId === LOCAL_MEASUREMENT_ID && mapped.deltaId === null,
    "mapRemoteEvidenceToDisplayEvidence preserves localMeasurementId as measurementId",
  );
  const related = getEvidenceRelatedToPlanItem(
    [mapped],
    [makeSharedMeasurement()],
    [makeSharedDelta()],
    PLAN_ITEM_ID,
  );
  assert(
    related.length === 1 && related[0]!.id === mapped.id,
    "shared Measurement-linked evidence resolves via localMeasurementId",
  );
}

{
  // Unrelated
  const unrelated = makeEvidence({
    id: "unrelated-ev",
    deltaId: "other-local-delta",
  });
  assert(
    getEvidenceRelatedToPlanItem(
      [unrelated],
      [makeSharedMeasurement()],
      [makeSharedDelta()],
      PLAN_ITEM_ID,
    ).length === 0,
    "unrelated evidence: no association",
  );
}

{
  // Null / missing relationship IDs
  const blank = makeEvidence({
    id: "blank-ev",
    measurementId: null,
    deltaId: null,
  });
  const empty = makeEvidence({
    id: "empty-ev",
    measurementId: "  ",
    deltaId: "",
  });
  assert(
    getEvidenceRelatedToPlanItem(
      [blank, empty],
      [makeSharedMeasurement()],
      [makeSharedDelta()],
      PLAN_ITEM_ID,
    ).length === 0,
    "null/empty relationship ids: no accidental association",
  );
}

{
  // Owner/local regression: Evidence.deltaId === Delta.id (no localDeltaId field)
  const localDelta = makeDelta(LOCAL_DELTA_ID);
  const localEvidence = makeEvidence({
    id: "local-ev",
    deltaId: LOCAL_DELTA_ID,
  });
  const related = getEvidenceRelatedToPlanItem(
    [localEvidence],
    [],
    [localDelta],
    PLAN_ITEM_ID,
  );
  assert(
    related.length === 1 && related[0]!.id === localEvidence.id,
    "owner/local Delta evidence still resolves via Delta.id",
  );

  const localMeas: Measurement = {
    id: LOCAL_MEASUREMENT_ID,
    projectId: "project-1",
    planItemId: PLAN_ITEM_ID,
    type: "length",
    label: "wall",
    value: 12,
    unit: "ft",
    createdAt: "2026-08-23T22:05:55.986Z",
  };
  const localMeasEvidence = makeEvidence({
    id: "local-meas-ev",
    measurementId: LOCAL_MEASUREMENT_ID,
  });
  assert(
    getEvidenceRelatedToPlanItem(
      [localMeasEvidence],
      [localMeas],
      [],
      PLAN_ITEM_ID,
    ).length === 1,
    "owner/local Measurement evidence still resolves via Measurement.id",
  );
}

console.log("planItemFieldContext.selftest: PASS");
