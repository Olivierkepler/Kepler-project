import {
  AGENT_SUMMARY_SCHEMA_VERSION,
  buildAgentSummaryId,
  type AgentSummary,
} from "../domain/agentSummary.js";
import { FIELD_VARIANCE_WORKFLOW_TYPE } from "../domain/agentRun.js";
import { AgentRunError } from "../domain/agentRun.js";
import { EVIDENCE_RELEVANCE_VALUES } from "../domain/evidenceAnalysis.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/**
 * Validates and normalizes a persisted AgentSummary document.
 */
export function normalizeAgentSummary(data: unknown): AgentSummary {
  if (!isRecord(data)) {
    throw new AgentRunError(
      "invalid_agent_summary",
      "AgentSummary must be an object",
    );
  }

  if (data.schemaVersion !== AGENT_SUMMARY_SCHEMA_VERSION) {
    throw new AgentRunError(
      "invalid_summary_schema_version",
      "AgentSummary schemaVersion must be 1",
    );
  }

  if (!isNonEmptyString(data.id)) {
    throw new AgentRunError("invalid_summary_id", "AgentSummary id is required");
  }

  const expectedFromRun =
    isNonEmptyString(data.agentRunId) &&
    data.id === buildAgentSummaryId(data.agentRunId);
  if (!expectedFromRun) {
    throw new AgentRunError(
      "invalid_summary_id",
      "AgentSummary id must be agent-summary:{agentRunId}",
    );
  }

  for (const key of [
    "ownerUid",
    "projectId",
    "agentRunId",
    "remoteDeltaId",
    "localDeltaId",
    "remoteMeasurementId",
    "localMeasurementId",
    "remotePlanItemId",
    "varianceSummary",
    "documentationSummary",
  ] as const) {
    if (!isNonEmptyString(data[key])) {
      throw new AgentRunError(
        "invalid_agent_summary",
        `AgentSummary ${key} is required`,
      );
    }
  }

  if (data.workflowType !== FIELD_VARIANCE_WORKFLOW_TYPE) {
    throw new AgentRunError(
      "invalid_workflow_type",
      "AgentSummary workflowType must be field_variance",
    );
  }

  if (!isValidTimestamp(data.createdAt)) {
    throw new AgentRunError(
      "invalid_created_at",
      "AgentSummary createdAt must be a valid timestamp",
    );
  }

  if (!isRecord(data.evidenceAssessment)) {
    throw new AgentRunError(
      "invalid_evidence_assessment",
      "AgentSummary evidenceAssessment is required",
    );
  }

  const ea = data.evidenceAssessment;
  const evidenceId =
    ea.evidenceId === null
      ? null
      : isNonEmptyString(ea.evidenceId)
        ? ea.evidenceId.trim()
        : undefined;
  if (evidenceId === undefined) {
    throw new AgentRunError(
      "invalid_evidence_assessment",
      "evidenceAssessment.evidenceId invalid",
    );
  }

  const evidenceType =
    ea.evidenceType === null ||
    ea.evidenceType === "photo" ||
    ea.evidenceType === "note"
      ? ea.evidenceType
      : undefined;
  if (evidenceType === undefined) {
    throw new AgentRunError(
      "invalid_evidence_assessment",
      "evidenceAssessment.evidenceType invalid",
    );
  }

  const relevance =
    ea.relevance === null ||
    (typeof ea.relevance === "string" &&
      (EVIDENCE_RELEVANCE_VALUES as readonly string[]).includes(ea.relevance))
      ? (ea.relevance as AgentSummary["evidenceAssessment"]["relevance"])
      : undefined;
  if (relevance === undefined) {
    throw new AgentRunError(
      "invalid_evidence_assessment",
      "evidenceAssessment.relevance invalid",
    );
  }

  const eaRationale =
    ea.userVisibleRationale === null
      ? null
      : isNonEmptyString(ea.userVisibleRationale)
        ? ea.userVisibleRationale.trim().slice(0, 2000)
        : undefined;
  if (eaRationale === undefined) {
    throw new AgentRunError(
      "invalid_evidence_assessment",
      "evidenceAssessment.userVisibleRationale invalid",
    );
  }

  if (!isRecord(data.documentedImpact)) {
    throw new AgentRunError(
      "invalid_documented_impact",
      "AgentSummary documentedImpact is required",
    );
  }

  const impact = data.documentedImpact;
  const impactKeys = [
    "plannedValue",
    "actualValue",
    "difference",
    "percentDifference",
    "costImpact",
    "laborImpactHours",
    "scheduleImpactDays",
  ] as const;
  for (const key of impactKeys) {
    if (!isFiniteNumberOrNull(impact[key])) {
      throw new AgentRunError(
        "invalid_documented_impact",
        `documentedImpact.${key} must be a finite number or null`,
      );
    }
  }

  const nextStep =
    data.recommendedHumanNextStep === null
      ? null
      : isNonEmptyString(data.recommendedHumanNextStep)
        ? data.recommendedHumanNextStep.trim().slice(0, 500)
        : undefined;
  if (nextStep === undefined) {
    throw new AgentRunError(
      "invalid_recommended_next_step",
      "recommendedHumanNextStep invalid",
    );
  }

  if (!isRecord(data.sourceRefs) || !Array.isArray(data.sourceRefs.evidenceIds)) {
    throw new AgentRunError(
      "invalid_source_refs",
      "sourceRefs.evidenceIds must be an array",
    );
  }

  const evidenceIds = data.sourceRefs.evidenceIds.map((id) => {
    if (!isNonEmptyString(id)) {
      throw new AgentRunError(
        "invalid_source_refs",
        "sourceRefs.evidenceIds must be non-empty strings",
      );
    }
    return id.trim();
  });

  const sorted = [...evidenceIds].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < evidenceIds.length; i += 1) {
    if (evidenceIds[i] !== sorted[i]) {
      throw new AgentRunError(
        "invalid_source_refs",
        "sourceRefs.evidenceIds must be sorted deterministically",
      );
    }
  }

  return {
    id: data.id.trim(),
    schemaVersion: AGENT_SUMMARY_SCHEMA_VERSION,
    ownerUid: (data.ownerUid as string).trim(),
    projectId: (data.projectId as string).trim(),
    agentRunId: (data.agentRunId as string).trim(),
    workflowType: FIELD_VARIANCE_WORKFLOW_TYPE,
    remoteDeltaId: (data.remoteDeltaId as string).trim(),
    localDeltaId: (data.localDeltaId as string).trim(),
    remoteMeasurementId: (data.remoteMeasurementId as string).trim(),
    localMeasurementId: (data.localMeasurementId as string).trim(),
    remotePlanItemId: (data.remotePlanItemId as string).trim(),
    createdAt: data.createdAt as string,
    varianceSummary: (data.varianceSummary as string).trim().slice(0, 2000),
    documentationSummary: (data.documentationSummary as string)
      .trim()
      .slice(0, 2000),
    evidenceAssessment: {
      evidenceId,
      evidenceType,
      relevance,
      userVisibleRationale: eaRationale,
    },
    documentedImpact: {
      plannedValue: impact.plannedValue as number | null,
      actualValue: impact.actualValue as number | null,
      difference: impact.difference as number | null,
      percentDifference: impact.percentDifference as number | null,
      costImpact: impact.costImpact as number | null,
      laborImpactHours: impact.laborImpactHours as number | null,
      scheduleImpactDays: impact.scheduleImpactDays as number | null,
    },
    recommendedHumanNextStep: nextStep,
    sourceRefs: { evidenceIds: sorted },
  };
}
