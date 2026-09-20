import type { EvidenceAnalysisRunner } from "../agent/evidenceAnalysisAgent.js";
import { runEvidenceAnalysisWithAdk } from "../agent/evidenceAnalysisAgent.js";
import type { AgentRun } from "../domain/agentRun.js";
import type { DirectDeltaEvidencePolicy } from "../domain/assessment.js";
import type { EvidenceAnalysis } from "../domain/evidenceAnalysis.js";
import { selectEvidenceForAnalysis } from "../domain/evidenceSelection.js";
import type { Evidence } from "../domain/evidence.js";
import {
  detectPhotoMagicKind,
  mimeMatchesPhotoMagic,
} from "../domain/photoMagicBytes.js";
import { classifyRecoverableEvidenceMediaFailure } from "../domain/recoverableEvidenceFailure.js";
import {
  categorizeExecutionError,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import { loadEvidencePhotoBytes } from "../storage/evidencePhotoStorage.js";
import type { DomainLoaders } from "../tools/toolContext.js";

export type AnalyzeEvidenceForAgentRunResult =
  | {
      kind: "analyzed";
      analysis: EvidenceAnalysis;
      multimodalCalls: number;
    }
  | {
      kind: "skipped";
      reason: "no_direct_delta_evidence" | "no_analyzable_evidence";
      multimodalCalls: 0;
    };

export type AnalyzeEvidenceDeps = {
  loaders: DomainLoaders;
  runEvidenceAnalysis?: EvidenceAnalysisRunner;
  loadPhotoBytesFn?: typeof loadEvidencePhotoBytes;
  model?: string;
  preferredEvidenceId?: string | null;
};

function structuredWithoutModel(args: {
  evidence: Evidence;
  relevance: EvidenceAnalysis["relevance"];
  description: string;
  needsAdditionalEvidence: boolean;
  suggestedFollowUp: string | null;
  userVisibleRationale: string;
}): EvidenceAnalysis {
  return {
    evidenceId: args.evidence.id,
    evidenceType: args.evidence.type,
    relevance: args.relevance,
    description: args.description,
    supportsDocumentedVariance: null,
    needsAdditionalEvidence: args.needsAdditionalEvidence,
    suggestedFollowUp: args.suggestedFollowUp,
    userVisibleRationale: args.userVisibleRationale,
  };
}

function unsupportedMediaAnalysis(evidence: Evidence): EvidenceAnalysis {
  return structuredWithoutModel({
    evidence,
    relevance: "unsupported_media",
    description:
      "Evidence photo bytes could not be decoded or are not a supported image.",
    needsAdditionalEvidence: true,
    suggestedFollowUp:
      "Upload a clear JPEG, PNG, or WEBP photo documenting the field difference.",
    userVisibleRationale:
      "The submitted photo could not be analyzed. Capture a clear replacement photo and try again.",
  });
}

async function buildTrustedContextSummary(
  agentRun: AgentRun,
  loaders: DomainLoaders,
): Promise<string> {
  const [delta, measurement] = await Promise.all([
    loaders.getDeltaById(agentRun.contextRefs.remoteDeltaId),
    loaders.getMeasurementById(agentRun.contextRefs.remoteMeasurementId),
  ]);

  return JSON.stringify({
    delta: delta
      ? {
          id: delta.id,
          plannedValue: delta.plannedValue,
          actualValue: delta.actualValue,
          difference: delta.difference,
          percentDifference: delta.percentDifference,
          unit: delta.unit,
        }
      : null,
    measurement: measurement
      ? {
          id: measurement.id,
          value: measurement.value,
          unit: measurement.unit,
        }
      : null,
    note: "Persisted Measurement/Delta numbers are authoritative. Do not recompute or infer exact values from images.",
  });
}

/**
 * Selects trusted direct Delta Evidence, loads photo bytes if needed,
 * and produces EvidenceAnalysis. Cap: ≤1 multimodal Gemini call per resume
 * (plus optional malformed-output repair inside the runner).
 *
 * Recoverable media failures return structured unsupported_media analysis
 * instead of throwing — the Field Variance cycle then reopens waiting_for_evidence.
 */
export async function analyzeEvidenceForAgentRun(
  agentRun: AgentRun,
  deterministicPolicy: DirectDeltaEvidencePolicy,
  deps: AnalyzeEvidenceDeps,
): Promise<AnalyzeEvidenceForAgentRunResult> {
  const started = Date.now();
  const runAnalysis = deps.runEvidenceAnalysis ?? runEvidenceAnalysisWithAdk;
  const loadPhoto = deps.loadPhotoBytesFn ?? loadEvidencePhotoBytes;
  const model =
    deps.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.5-flash";

  if (!deterministicPolicy.hasDirectDeltaEvidence) {
    logAgentExecution({
      event: "agent_evidence_analysis_skipped",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      errorCategory: "no_direct_delta_evidence",
      durationMs: Date.now() - started,
    });
    return {
      kind: "skipped",
      reason: "no_direct_delta_evidence",
      multimodalCalls: 0,
    };
  }

  const allEvidence = await deps.loaders.getEvidenceForProject(
    agentRun.projectId,
  );
  const preferred =
    deps.preferredEvidenceId ?? agentRun.lastEvidenceId ?? null;
  const selected = selectEvidenceForAnalysis({
    agentRun,
    evidence: allEvidence,
    preferredEvidenceId: preferred,
  });

  if (!selected) {
    logAgentExecution({
      event: "agent_evidence_analysis_skipped",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      errorCategory: "no_analyzable_evidence",
      durationMs: Date.now() - started,
    });
    return {
      kind: "skipped",
      reason: "no_analyzable_evidence",
      multimodalCalls: 0,
    };
  }

  logAgentExecution({
    event: "agent_evidence_analysis_started",
    agentRunId: agentRun.id,
    evidenceId: selected.id,
    projectId: agentRun.projectId,
    workflowType: agentRun.workflowType,
    step: agentRun.currentStep,
  });

  let multimodalCalls = 0;
  let photoInline: {
    mimeType: string;
    bytes: Buffer;
    byteSize: number;
  } | null = null;

  if (selected.type === "photo") {
    const loaded = await loadPhoto(selected);
    if (!loaded.ok) {
      const analysis = structuredWithoutModel({
        evidence: selected,
        relevance:
          loaded.error === "unsupported_media"
            ? "unsupported_media"
            : "insufficient_information",
        description:
          loaded.error === "missing_object"
            ? "Evidence metadata exists but the Storage object is missing."
            : loaded.error === "too_large"
              ? "Evidence photo exceeds the multimodal size limit."
              : loaded.error === "mime_mismatch"
                ? "Persisted contentType does not match Storage object metadata."
                : loaded.error === "unsupported_media"
                  ? "Evidence photo format is not supported for multimodal analysis."
                  : "Evidence photo could not be loaded safely.",
        needsAdditionalEvidence: true,
        suggestedFollowUp:
          loaded.error === "unsupported_media"
            ? "Upload a JPEG, PNG, or WEBP photo documenting the field difference."
            : "Add a clear field photo or note documenting the difference.",
        userVisibleRationale:
          loaded.error === "missing_object"
            ? "The linked photo could not be read from storage. Please re-upload documentation."
            : loaded.error === "unsupported_media"
              ? "The submitted photo could not be analyzed. Capture a clear replacement photo and try again."
              : "Additional documentation is needed before preparing a summary.",
      });

      logAgentExecution({
        event: "agent_evidence_analysis_ready",
        agentRunId: agentRun.id,
        evidenceId: selected.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        errorCategory: loaded.error,
        durationMs: Date.now() - started,
      });

      return { kind: "analyzed", analysis, multimodalCalls: 0 };
    }

    const magic = detectPhotoMagicKind(loaded.photo.bytes);
    if (!magic || !mimeMatchesPhotoMagic(loaded.photo.mimeType, magic)) {
      const analysis = unsupportedMediaAnalysis(selected);
      logAgentExecution({
        event: "agent_evidence_analysis_ready",
        agentRunId: agentRun.id,
        evidenceId: selected.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        errorCategory: "unsupported_media",
        durationMs: Date.now() - started,
        mimeType: loaded.photo.mimeType,
        byteSize: loaded.photo.byteSize,
      });
      return { kind: "analyzed", analysis, multimodalCalls: 0 };
    }

    photoInline = {
      mimeType: loaded.photo.mimeType,
      bytes: loaded.photo.bytes,
      byteSize: loaded.photo.byteSize,
    };

    logAgentExecution({
      event: "agent_evidence_photo_loaded",
      agentRunId: agentRun.id,
      evidenceId: selected.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      mimeType: loaded.photo.mimeType,
      byteSize: loaded.photo.byteSize,
    });
  }

  try {
    const trustedContextSummary = await buildTrustedContextSummary(
      agentRun,
      deps.loaders,
    );

    if (photoInline) {
      multimodalCalls = 1;
    }

    const analysis = await runAnalysis({
      agentRun,
      evidence: selected,
      deterministicPolicy,
      trustedContextSummary,
      photo: photoInline,
      model,
    });

    logAgentExecution({
      event: "agent_evidence_analysis_ready",
      agentRunId: agentRun.id,
      evidenceId: selected.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      mimeType: photoInline?.mimeType,
      byteSize: photoInline?.byteSize,
      durationMs: Date.now() - started,
    });

    return { kind: "analyzed", analysis, multimodalCalls };
  } catch (error) {
    const recoverable = classifyRecoverableEvidenceMediaFailure(error);
    if (recoverable) {
      const analysis = unsupportedMediaAnalysis(selected);
      logAgentExecution({
        event: "agent_evidence_analysis_ready",
        agentRunId: agentRun.id,
        evidenceId: selected.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        errorCategory: recoverable.code,
        durationMs: Date.now() - started,
      });
      return { kind: "analyzed", analysis, multimodalCalls };
    }

    logAgentExecution({
      event: "agent_evidence_analysis_failed",
      agentRunId: agentRun.id,
      evidenceId: selected.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      durationMs: Date.now() - started,
      errorCategory: categorizeExecutionError(error),
    });
    throw error;
  }
}
