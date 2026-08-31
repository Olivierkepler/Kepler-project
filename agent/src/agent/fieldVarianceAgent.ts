import { FunctionTool, InMemoryRunner, LlmAgent } from "@google/adk";
import {
  parseFieldVarianceAssessment,
  type DirectDeltaEvidencePolicy,
  type FieldVarianceAssessment,
} from "../domain/assessment.js";
import type { AgentRun } from "../domain/agentRun.js";
import type { EvidenceAnalysis } from "../domain/evidenceAnalysis.js";
import {
  categorizeExecutionError,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import {
  getDelta,
  getMeasurement,
  getPlanItem,
  getProjectContext,
  listDeltaEvidence,
  listMeasurementEvidence,
} from "../tools/readTools.js";
import type { TrustedToolContext } from "../tools/toolContext.js";
import {
  applyAdkModelEvent,
  finalizeAdkModelRun,
} from "./adkModelRun.js";
import { FIELD_VARIANCE_SYSTEM_INSTRUCTION } from "./systemInstruction.js";

// No Zod parameters: ADK bundles its own Zod; avoid cross-package schema mismatch.
// Tools take no Gemini-supplied IDs — scope is injected from TrustedToolContext.

export type RunFieldVarianceAgentInput = {
  agentRun: AgentRun;
  toolContext: TrustedToolContext;
  deterministicPolicy: DirectDeltaEvidencePolicy;
  model: string;
  /** Trusted A6 EvidenceAnalysis when available (no image bytes). */
  evidenceAnalysis?: EvidenceAnalysis | null;
};

export type FieldVarianceAgentRunner = (
  input: RunFieldVarianceAgentInput,
) => Promise<FieldVarianceAssessment>;

function createBoundReadTools(ctx: TrustedToolContext): FunctionTool[] {
  const withToolLog = async <T>(
    toolName: string,
    fn: () => Promise<T>,
  ): Promise<T> => {
    const started = Date.now();
    logAgentExecution({
      event: "agent_tool_started",
      agentRunId: ctx.agentRun.id,
      workflowType: ctx.agentRun.workflowType,
      step: ctx.agentRun.currentStep,
      toolName,
      attemptCount: ctx.agentRun.attemptCount,
    });
    try {
      const result = await fn();
      logAgentExecution({
        event: "agent_tool_completed",
        agentRunId: ctx.agentRun.id,
        workflowType: ctx.agentRun.workflowType,
        step: ctx.agentRun.currentStep,
        toolName,
        attemptCount: ctx.agentRun.attemptCount,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      logAgentExecution({
        event: "agent_execution_failed",
        agentRunId: ctx.agentRun.id,
        toolName,
        errorCategory: categorizeExecutionError(error),
        durationMs: Date.now() - started,
      });
      throw error;
    }
  };

  return [
    new FunctionTool({
      name: "get_project_context",
      description:
        "Load trusted project context for the AgentRun. Takes no arguments.",
      execute: async () =>
        withToolLog("get_project_context", () => getProjectContext(ctx)),
    }),
    new FunctionTool({
      name: "get_plan_item",
      description:
        "Load the plan item from AgentRun.contextRefs.remotePlanItemId.",
      execute: async () => withToolLog("get_plan_item", () => getPlanItem(ctx)),
    }),
    new FunctionTool({
      name: "get_measurement",
      description:
        "Load the measurement from AgentRun.contextRefs.remoteMeasurementId. Includes reviewStatus and optional collaboration provenance (WorkPackage/Assignment/role) when available.",
      execute: async () =>
        withToolLog("get_measurement", () => getMeasurement(ctx)),
    }),
    new FunctionTool({
      name: "get_delta",
      description:
        "Load the delta from AgentRun.contextRefs.remoteDeltaId. Persisted math is authoritative.",
      execute: async () => withToolLog("get_delta", () => getDelta(ctx)),
    }),
    new FunctionTool({
      name: "list_delta_evidence",
      description:
        "List Evidence linked by localDeltaId. Metadata only — no image bytes or URLs.",
      execute: async () =>
        withToolLog("list_delta_evidence", () => listDeltaEvidence(ctx)),
    }),
    new FunctionTool({
      name: "list_measurement_evidence",
      description:
        "List Evidence linked by localMeasurementId. Metadata only.",
      execute: async () =>
        withToolLog("list_measurement_evidence", () =>
          listMeasurementEvidence(ctx),
        ),
    }),
  ];
}

function tryParseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("model_output_not_json");
  }
}

/**
 * Runs the Field Variance LlmAgent via Google ADK (Gemini + FunctionTools).
 */
export const runFieldVarianceAgentWithAdk: FieldVarianceAgentRunner = async (
  input,
) => {
  const started = Date.now();
  logAgentExecution({
    event: "agent_model_started",
    agentRunId: input.agentRun.id,
    workflowType: input.agentRun.workflowType,
    step: input.agentRun.currentStep,
    attemptCount: input.agentRun.attemptCount,
  });

  const tools = createBoundReadTools(input.toolContext);
  const agent = new LlmAgent({
    name: "field_variance_agent",
    model: input.model,
    description:
      "Assesses Field Variance using trusted BuildSigma read-only tools.",
    instruction: FIELD_VARIANCE_SYSTEM_INSTRUCTION,
    tools,
  });

  const runner = new InMemoryRunner({
    agent,
    appName: "buildsigma-agent",
  });

  const userMessage = [
    "Assess this Field Variance AgentRun.",
    `agentRunId=${input.agentRun.id}`,
    `workflowType=${input.agentRun.workflowType}`,
    "Deterministic Evidence policy (authoritative presence — do not redefine):",
    JSON.stringify(input.deterministicPolicy),
    input.evidenceAnalysis
      ? [
          "Trusted EvidenceAnalysis (relevance/quality — authoritative for relevance):",
          JSON.stringify(input.evidenceAnalysis),
        ].join("\n")
      : "Trusted EvidenceAnalysis: none yet.",
    "Use tools to inspect project, plan item, measurement, delta, and evidence.",
    "Then produce the structured assessment JSON with exact keys:",
    "summary, evidenceAssessment, recommendedAction, userVisibleRationale.",
    "evidenceAssessment must be a string, not an object.",
  ].join("\n");

  let accumulator = {};

  try {
    const session = await runner.sessionService.createSession({
      appName: "buildsigma-agent",
      userId: input.agentRun.ownerUid,
      sessionId: input.agentRun.id,
    });

    for await (const event of runner.runAsync({
      userId: input.agentRun.ownerUid,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [{ text: userMessage }],
      },
    })) {
      accumulator = applyAdkModelEvent(accumulator, event);
    }

    const resolved = finalizeAdkModelRun(accumulator);
    let assessment: FieldVarianceAssessment;
    if (resolved.structured !== undefined) {
      assessment = parseFieldVarianceAssessment(resolved.structured);
    } else if (resolved.text) {
      assessment = parseFieldVarianceAssessment(tryParseJsonObject(resolved.text));
    } else {
      throw new Error("empty_model_output");
    }

    logAgentExecution({
      event: "agent_model_completed",
      agentRunId: input.agentRun.id,
      workflowType: input.agentRun.workflowType,
      step: input.agentRun.currentStep,
      attemptCount: input.agentRun.attemptCount,
      durationMs: Date.now() - started,
      recommendedAction: assessment.recommendedAction,
    });

    return assessment;
  } catch (error) {
    logAgentExecution({
      event: "agent_execution_failed",
      agentRunId: input.agentRun.id,
      workflowType: input.agentRun.workflowType,
      step: input.agentRun.currentStep,
      attemptCount: input.agentRun.attemptCount,
      durationMs: Date.now() - started,
      errorCategory: categorizeExecutionError(error),
    });
    throw error;
  }
};

export function createStubFieldVarianceAgentRunner(
  assessment: FieldVarianceAssessment | (() => FieldVarianceAssessment),
): FieldVarianceAgentRunner {
  return async () =>
    typeof assessment === "function" ? assessment() : assessment;
}
