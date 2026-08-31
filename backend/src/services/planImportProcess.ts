import type { AgentCloudTasksEnv } from "../config/agentEnv.js";
import type { PlanImport } from "../domain/planImport.js";
import {
  getPlanImportById,
  setPlanImport,
} from "../repositories/planImportsRepository.js";
import { planImportObjectExists } from "../storage/planImportStorage.js";
import {
  enqueuePlanImportProcessTask,
  type CloudTasksEnqueuer,
} from "./cloudTasks.js";

export type PlanImportProcessDeps = {
  enqueueFn?: typeof enqueuePlanImportProcessTask;
  enqueuer?: CloudTasksEnqueuer;
  env?: AgentCloudTasksEnv;
};

export type PlanImportProcessResult = {
  import: PlanImport;
  alreadyProcessing: boolean;
  alreadyReady: boolean;
  taskOutcome: "created" | "already_exists" | "skipped" | "failed";
};

export class PlanImportProcessError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PlanImportProcessError";
    this.statusCode = statusCode;
  }
}

/**
 * Starts asynchronous document intelligence for an uploaded PlanImport.
 * Owner authz must already be enforced by the route.
 *
 * Idempotent:
 * - uploaded → processing + enqueue
 * - failed → processing + enqueue (retry)
 * - processing → return current (safe double-tap)
 * - ready_for_review / ready_for_approval → return current (no re-run)
 */
export async function startPlanImportProcessing(args: {
  projectId: string;
  importId: string;
  deps?: PlanImportProcessDeps;
}): Promise<PlanImportProcessResult> {
  const existing = await getPlanImportById(args.importId);

  if (!existing || existing.projectId !== args.projectId) {
    throw new PlanImportProcessError("Plan import not found", 404);
  }

  if (
    existing.status === "ready_for_review" ||
    existing.status === "ready_for_approval" ||
    existing.status === "approved"
  ) {
    return {
      import: existing,
      alreadyProcessing: false,
      alreadyReady: true,
      taskOutcome: "skipped",
    };
  }

  if (existing.status === "processing") {
    return {
      import: existing,
      alreadyProcessing: true,
      alreadyReady: false,
      taskOutcome: "skipped",
    };
  }

  if (existing.status !== "uploaded" && existing.status !== "failed") {
    throw new PlanImportProcessError(
      "Plan import must be uploaded before processing.",
      409,
    );
  }

  for (const file of existing.files) {
    if (file.uploadStatus !== "uploaded") {
      throw new PlanImportProcessError(
        "All files must be uploaded before processing.",
        409,
      );
    }
    const exists = await planImportObjectExists(file.storagePath);
    if (!exists) {
      throw new PlanImportProcessError(
        `Missing stored object for ${file.name}.`,
        409,
      );
    }
  }

  const nowIso = new Date().toISOString();
  const processing: PlanImport = {
    ...existing,
    status: "processing",
    updatedAt: nowIso,
  };
  delete processing.errorMessage;

  await setPlanImport(processing);

  const enqueueFn = args.deps?.enqueueFn ?? enqueuePlanImportProcessTask;

  try {
    const task = await enqueueFn({
      importId: processing.id,
      enqueuer: args.deps?.enqueuer,
      env: args.deps?.env,
    });

    return {
      import: processing,
      alreadyProcessing: false,
      alreadyReady: false,
      taskOutcome: task.outcome,
    };
  } catch (error) {
    const failed: PlanImport = {
      ...processing,
      status: "failed",
      errorMessage:
        "Unable to start document analysis. Please try again shortly.",
      updatedAt: new Date().toISOString(),
    };
    await setPlanImport(failed);
    throw error;
  }
}
