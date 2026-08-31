import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { AgentRunError, type AgentRun } from "../domain/agentRun.js";
import {
  buildAgentSummaryId,
  type AgentSummary,
} from "../domain/agentSummary.js";
import {
  applyAgentRunStateUpdate,
  normalizeAgentRun,
} from "../validation/agentRun.js";
import { normalizeAgentSummary } from "../validation/agentSummary.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new AgentRunError("invalid_id", `${label} is required`);
  }
}

function agentRunsCollection() {
  return db.collection(COLLECTIONS.agentRuns);
}

function agentSummariesCollection() {
  return db.collection(COLLECTIONS.agentSummaries);
}

export type CreateAgentSummaryAndCompleteRunResult =
  | {
      outcome: "created";
      agentRun: AgentRun;
      summary: AgentSummary;
    }
  | {
      outcome: "existing";
      agentRun: AgentRun;
      summary: AgentSummary;
    };

/**
 * Atomic create AgentSummary + complete AgentRun (or idempotent existing).
 * Never overwrites an existing summary document.
 */
export async function createAgentSummaryAndCompleteRun(args: {
  agentRunId: string;
  summary: AgentSummary;
  userVisibleRationale: string;
}): Promise<CreateAgentSummaryAndCompleteRunResult> {
  requireId(args.agentRunId, "agentRunId");

  const expectedId = buildAgentSummaryId(args.agentRunId);
  if (args.summary.id !== expectedId) {
    throw new AgentRunError(
      "invalid_summary_id",
      "AgentSummary id must match agent-summary:{agentRunId}",
    );
  }
  if (args.summary.agentRunId !== args.agentRunId) {
    throw new AgentRunError(
      "invalid_agent_run_id",
      "AgentSummary.agentRunId must match AgentRun id",
    );
  }

  const summary = normalizeAgentSummary(args.summary);
  const rationale = args.userVisibleRationale.trim();
  if (!rationale) {
    throw new AgentRunError(
      "invalid_outcome",
      "userVisibleRationale is required",
    );
  }

  const runRef = agentRunsCollection().doc(args.agentRunId);
  const summaryRef = agentSummariesCollection().doc(summary.id);

  return db.runTransaction(async (tx) => {
    const [runSnap, summarySnap] = await Promise.all([
      tx.get(runRef),
      tx.get(summaryRef),
    ]);

    if (!runSnap.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(runSnap.data());

    if (
      current.status === "completed" &&
      current.outcome?.kind === "summary_ready" &&
      current.outcome.summaryId === summary.id &&
      summarySnap.exists
    ) {
      return {
        outcome: "existing",
        agentRun: current,
        summary: normalizeAgentSummary(summarySnap.data()),
      };
    }

    if (summarySnap.exists) {
      const existingSummary = normalizeAgentSummary(summarySnap.data());
      if (
        current.status === "running" &&
        current.currentStep === "prepare_summary"
      ) {
        const next = applyAgentRunStateUpdate(current, {
          status: "completed",
          currentStep: "completed",
          pendingRequest: null,
          outcome: {
            kind: "summary_ready",
            summaryId: existingSummary.id,
            userVisibleRationale: rationale,
          },
          errorCategory: null,
        });
        tx.set(runRef, next, { merge: false });
        return {
          outcome: "existing",
          agentRun: next,
          summary: existingSummary,
        };
      }

      throw new AgentRunError(
        "summary_conflict",
        "AgentSummary already exists in an unexpected AgentRun state",
      );
    }

    if (current.status !== "running") {
      throw new AgentRunError(
        "illegal_status_for_summary",
        `Cannot create summary from status ${current.status}`,
      );
    }

    if (current.currentStep !== "prepare_summary") {
      throw new AgentRunError(
        "illegal_step_for_summary",
        `Cannot create summary from step ${current.currentStep}`,
      );
    }

    if (
      current.ownerUid !== summary.ownerUid ||
      current.projectId !== summary.projectId
    ) {
      throw new AgentRunError(
        "summary_scope_mismatch",
        "AgentSummary owner/project must match AgentRun",
      );
    }

    tx.create(summaryRef, summary);
    const next = applyAgentRunStateUpdate(current, {
      status: "completed",
      currentStep: "completed",
      pendingRequest: null,
      outcome: {
        kind: "summary_ready",
        summaryId: summary.id,
        userVisibleRationale: rationale,
      },
      errorCategory: null,
    });
    tx.set(runRef, next, { merge: false });

    return { outcome: "created", agentRun: next, summary };
  });
}

export async function getAgentSummaryById(
  summaryId: string,
): Promise<AgentSummary | undefined> {
  requireId(summaryId, "summaryId");
  const snapshot = await agentSummariesCollection().doc(summaryId).get();
  if (!snapshot.exists) {
    return undefined;
  }
  return normalizeAgentSummary(snapshot.data());
}

export async function getAgentSummaryForRun(
  agentRunId: string,
): Promise<AgentSummary | undefined> {
  return getAgentSummaryById(buildAgentSummaryId(agentRunId));
}
