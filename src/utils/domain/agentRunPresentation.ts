import type {
  AgentRunStep,
  AgentRunSummary,
} from "../../types/agentRun";

export type AgentRunBadge =
  | "QUEUED"
  | "ANALYZING"
  | "ANALYZING EVIDENCE"
  | "PREPARING SUMMARY"
  | "NEEDS EVIDENCE"
  | "SUMMARY READY"
  | "NEEDS ATTENTION"
  | "ESCALATED";

export type AgentRunCtaType =
  | "view_run"
  | "add_evidence"
  | "review_summary"
  | null;

export type AgentRunProgressStepState = "complete" | "active" | "pending";

export type AgentRunProgressStep = {
  label: string;
  state: AgentRunProgressStepState;
};

export type AgentRunPresentation = {
  badge: AgentRunBadge;
  label: string;
  description: string;
  progressSteps: AgentRunProgressStep[];
  ctaType: AgentRunCtaType;
  summaryId: string | null;
};

const ANALYZING_STEPS: readonly AgentRunStep[] = [
  "load_context",
  "assess_variance",
  "check_evidence_policy",
  "request_evidence",
];

function stepIndex(step: AgentRunStep): number {
  const order: AgentRunStep[] = [
    "queued",
    "load_context",
    "assess_variance",
    "check_evidence_policy",
    "request_evidence",
    "waiting_for_evidence",
    "analyze_evidence",
    "prepare_summary",
    "record_outcome",
    "completed",
    "failed",
    "escalated",
  ];

  return order.indexOf(step);
}

function resolveBadge(run: AgentRunSummary): AgentRunBadge {
  if (run.status === "queued") {
    return "QUEUED";
  }

  if (run.status === "waiting_for_evidence") {
    return "NEEDS EVIDENCE";
  }

  if (run.status === "failed") {
    return "NEEDS ATTENTION";
  }

  if (run.status === "escalated") {
    return "ESCALATED";
  }

  if (
    run.status === "completed" &&
    run.outcome?.kind === "summary_ready"
  ) {
    return "SUMMARY READY";
  }

  if (run.status === "running") {
    if (run.currentStep === "analyze_evidence") {
      return "ANALYZING EVIDENCE";
    }

    if (run.currentStep === "prepare_summary") {
      return "PREPARING SUMMARY";
    }

    if (ANALYZING_STEPS.includes(run.currentStep)) {
      return "ANALYZING";
    }
  }

  return "ANALYZING";
}

function resolveDescription(run: AgentRunSummary): string {
  const badge = resolveBadge(run);

  switch (badge) {
    case "QUEUED":
      return "Waiting to start field variance review.";
    case "ANALYZING":
      return "Analyzing field variance.";
    case "ANALYZING EVIDENCE":
      return "Evidence received. Analyzing documentation.";
    case "PREPARING SUMMARY":
      return "Preparing agent summary.";
    case "NEEDS EVIDENCE":
      return run.pendingRequest?.message ??
        "Add a field photo or note documenting this difference.";
    case "SUMMARY READY":
      return "Agent summary ready for review.";
    case "NEEDS ATTENTION":
      return "The automated review could not be completed.";
    case "ESCALATED":
      return (
        run.outcome?.userVisibleRationale ??
        "Escalated for human review."
      );
    default:
      return "Reviewing field variance workflow.";
  }
}

function resolveCta(run: AgentRunSummary): {
  ctaType: AgentRunCtaType;
  summaryId: string | null;
} {
  if (
    run.status === "waiting_for_evidence" &&
    run.pendingRequest?.kind === "delta_evidence"
  ) {
    return { ctaType: "add_evidence", summaryId: null };
  }

  if (
    run.status === "completed" &&
    run.outcome?.kind === "summary_ready" &&
    run.outcome.summaryId
  ) {
    return {
      ctaType: "review_summary",
      summaryId: run.outcome.summaryId,
    };
  }

  return { ctaType: "view_run", summaryId: null };
}

function resolveProgressSteps(run: AgentRunSummary): AgentRunProgressStep[] {
  const current = stepIndex(run.currentStep);
  const evidenceRequested =
    run.status === "waiting_for_evidence" ||
    run.pendingRequest !== null ||
    !!run.lastEvidenceId ||
    current >= stepIndex("analyze_evidence");
  const evidenceReceived =
    !!run.lastEvidenceId || current >= stepIndex("analyze_evidence");

  function stateFor(thresholdStep: AgentRunStep): AgentRunProgressStepState {
    const threshold = stepIndex(thresholdStep);

    if (run.status === "failed" || run.status === "escalated") {
      if (current >= threshold) {
        return "complete";
      }
      return current === threshold ? "active" : "pending";
    }

    if (current > threshold) {
      return "complete";
    }

    if (current === threshold) {
      return "active";
    }

    return "pending";
  }

  const stepFourLabel = evidenceReceived
    ? "Evidence received"
    : evidenceRequested
      ? "Evidence requested"
      : "Evidence requested / received";

  return [
    {
      label: "Field difference detected",
      state: run.status === "queued" ? "active" : "complete",
    },
    {
      label: "Project context reviewed",
      state: stateFor("assess_variance"),
    },
    {
      label: "Evidence checked",
      state: stateFor("check_evidence_policy"),
    },
    {
      label: stepFourLabel,
      state:
        run.status === "waiting_for_evidence"
          ? "active"
          : evidenceReceived
            ? "complete"
            : evidenceRequested
              ? "active"
              : "pending",
    },
    {
      label: "Evidence analyzed",
      state: stateFor("analyze_evidence"),
    },
    {
      label: "Summary prepared",
      state:
        run.status === "completed" && run.outcome?.kind === "summary_ready"
          ? "complete"
          : stateFor("prepare_summary"),
    },
  ];
}

export function buildAgentRunPresentation(
  run: AgentRunSummary,
): AgentRunPresentation {
  const badge = resolveBadge(run);
  const { ctaType, summaryId } = resolveCta(run);

  return {
    badge,
    label: badge,
    description: resolveDescription(run),
    progressSteps: resolveProgressSteps(run),
    ctaType,
    summaryId,
  };
}

export function shouldPollAgentRun(run: AgentRunSummary | null): boolean {
  if (!run) {
    return false;
  }

  return run.status === "queued" || run.status === "running";
}

export function formatSummaryEvidenceRelevance(
  value: string | null,
): string {
  switch (value) {
    case "relevant":
      return "Relevant";
    case "possibly_relevant":
      return "Possibly Relevant";
    case "not_relevant":
      return "Not Relevant";
    case "insufficient_information":
      return "Insufficient Information";
    case "unsupported_media":
      return "Unsupported Media";
    default:
      return "Not assessed";
  }
}

export function workflowTypeLabel(
  workflowType: AgentRunSummary["workflowType"],
): string {
  if (workflowType === "field_variance") {
    return "FIELD VARIANCE AGENT";
  }

  return "FIELD AGENT";
}
