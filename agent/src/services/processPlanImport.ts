import {
  runPlanDocumentIntelligenceWithAdk,
  type PlanDocumentIntelligenceRunner,
} from "../agent/planDocumentIntelligenceAgent.js";
import {
  buildPersistedCandidates,
  type PlanImportExtractionResult,
} from "../domain/planImportExtraction.js";
import {
  categorizeExecutionError,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import { replaceCandidatesForImport } from "../repositories/planImportCandidatesRepository.js";
import {
  getPlanImportById,
  setPlanImport,
  type AgentPlanImport,
} from "../repositories/planImportsRepository.js";
import {
  loadPlanImportDocumentBytes,
  type PlanImportDocumentBytes,
} from "../storage/planImportDocumentStorage.js";

export type ProcessPlanImportDeps = {
  runner?: PlanDocumentIntelligenceRunner;
  model?: string;
};

export type ProcessPlanImportResult =
  | { outcome: "completed"; importId: string; candidateCount: number }
  | {
      outcome: "noop";
      reason: "not_found" | "not_processing" | "already_ready";
    }
  | { outcome: "failed"; importId: string; errorCategory: string };

async function markFailed(
  item: AgentPlanImport,
  message: string,
): Promise<void> {
  await setPlanImport({
    ...item,
    status: "failed",
    errorMessage: message,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Processes a PlanImport already marked processing.
 * Never creates PlanItems.
 */
export async function processPlanImportExecution(
  importId: string,
  deps: ProcessPlanImportDeps = {},
): Promise<ProcessPlanImportResult> {
  const started = Date.now();
  const existing = await getPlanImportById(importId);

  if (!existing) {
    return { outcome: "noop", reason: "not_found" };
  }
  if (existing.status === "ready_for_review") {
    return { outcome: "noop", reason: "already_ready" };
  }
  if (existing.status !== "processing") {
    return { outcome: "noop", reason: "not_processing" };
  }

  logAgentExecution({
    event: "agent_execution_started",
    agentRunId: importId,
    projectId: existing.projectId,
    step: "plan_import_process",
  });

  try {
    const documents: PlanImportDocumentBytes[] = [];

    for (const file of existing.files) {
      if (file.uploadStatus !== "uploaded") {
        await markFailed(existing, "One or more files were not fully uploaded.");
        return {
          outcome: "failed",
          importId,
          errorCategory: "incomplete_upload",
        };
      }

      const loaded = await loadPlanImportDocumentBytes({
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        storagePath: file.storagePath,
      });

      if (!loaded.ok) {
        await markFailed(
          existing,
          "Unable to read one or more uploaded documents securely.",
        );
        return {
          outcome: "failed",
          importId,
          errorCategory: loaded.error,
        };
      }

      documents.push(loaded.document);
    }

    if (documents.length === 0) {
      await markFailed(existing, "No documents were available to analyze.");
      return { outcome: "failed", importId, errorCategory: "no_documents" };
    }

    const runner = deps.runner ?? runPlanDocumentIntelligenceWithAdk;
    const model =
      deps.model?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-3.5-flash";

    let extraction: PlanImportExtractionResult;
    try {
      extraction = await runner({
        importId: existing.id,
        projectId: existing.projectId,
        model,
        documents,
      });
    } catch (error) {
      const category = categorizeExecutionError(error);
      await markFailed(
        existing,
        "Document analysis could not be completed. Please try again.",
      );
      logAgentExecution({
        event: "agent_execution_failed",
        agentRunId: importId,
        projectId: existing.projectId,
        step: "plan_import_process",
        durationMs: Date.now() - started,
        errorCategory: category,
      });
      return { outcome: "failed", importId, errorCategory: category };
    }

    const candidates = buildPersistedCandidates({
      importId: existing.id,
      projectId: existing.projectId,
      extraction,
    });

    await replaceCandidatesForImport(
      existing.id,
      existing.projectId,
      candidates,
    );

    const ready: AgentPlanImport = {
      ...existing,
      status: "ready_for_review",
      updatedAt: new Date().toISOString(),
    };
    delete ready.errorMessage;
    await setPlanImport(ready);

    logAgentExecution({
      event: "agent_execution_noop",
      agentRunId: importId,
      projectId: existing.projectId,
      step: "plan_import_process",
      durationMs: Date.now() - started,
      noopReason: `ready_for_review_candidates=${candidates.length}`,
    });

    return {
      outcome: "completed",
      importId,
      candidateCount: candidates.length,
    };
  } catch (error) {
    const category = categorizeExecutionError(error);
    await markFailed(
      existing,
      "Document analysis failed unexpectedly. Please try again.",
    );
    logAgentExecution({
      event: "agent_execution_failed",
      agentRunId: importId,
      projectId: existing.projectId,
      step: "plan_import_process",
      durationMs: Date.now() - started,
      errorCategory: category,
    });
    return { outcome: "failed", importId, errorCategory: category };
  }
}
