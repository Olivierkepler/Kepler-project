import {
  buildAgentRunResumeUrl,
  buildAgentRunStartUrl,
  buildPlanImportProcessUrl,
  loadAgentCloudTasksEnv,
  type AgentCloudTasksEnv,
} from "../config/agentEnv.js";
import {
  buildFieldVarianceResumeTaskId,
  buildFieldVarianceStartTaskId,
} from "../domain/fieldVarianceTaskId.js";
import { buildPlanImportProcessTaskId } from "../domain/planImportCandidateId.js";

export type AgentStartTaskPayload = {
  agentRunId: string;
};

export type AgentResumeTaskPayload = {
  agentRunId: string;
  evidenceId: string;
};

export type PlanImportProcessTaskPayload = {
  importId: string;
};

export type EnqueueHttpTaskInput = {
  taskId: string;
  url: string;
  body:
    | AgentStartTaskPayload
    | AgentResumeTaskPayload
    | PlanImportProcessTaskPayload;
  oidcServiceAccountEmail: string;
};

export type EnqueueHttpTaskResult =
  | { outcome: "created" }
  | { outcome: "already_exists" };

/**
 * Narrow enqueue port so A2 tests can stub Cloud Tasks without GCP.
 */
export type CloudTasksEnqueuer = {
  enqueueHttpTask(input: EnqueueHttpTaskInput): Promise<EnqueueHttpTaskResult>;
};

type CloudTasksClientLike = {
  queuePath(project: string, location: string, queue: string): string;
  taskPath(
    project: string,
    location: string,
    queue: string,
    taskId: string,
  ): string;
  createTask(request: {
    parent: string;
    task: {
      name: string;
      httpRequest: {
        httpMethod: "POST";
        url: string;
        headers: Record<string, string>;
        body: string;
        oidcToken: {
          serviceAccountEmail: string;
          audience: string;
        };
      };
    };
  }): Promise<unknown>;
};

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    code?: number | string;
    message?: string;
  };

  if (record.code === 6 || record.code === "ALREADY_EXISTS") {
    return true;
  }

  if (
    typeof record.message === "string" &&
    record.message.includes("ALREADY_EXISTS")
  ) {
    return true;
  }

  return false;
}

async function loadCloudTasksClient(): Promise<CloudTasksClientLike> {
  // Dynamic import: @google-cloud/tasks is ESM-only under Node16 resolution.
  const mod = (await import("@google-cloud/tasks")) as {
    CloudTasksClient: new () => CloudTasksClientLike;
  };
  return new mod.CloudTasksClient();
}

/**
 * Creates a Cloud Tasks enqueuer. Client is loaded lazily to avoid CJS/ESM
 * static import issues with @google-cloud/tasks.
 */
export function createGoogleCloudTasksEnqueuer(
  env: AgentCloudTasksEnv = loadAgentCloudTasksEnv(),
  client?: CloudTasksClientLike,
): CloudTasksEnqueuer {
  let clientPromise: Promise<CloudTasksClientLike> | null = client
    ? Promise.resolve(client)
    : null;

  const getClient = (): Promise<CloudTasksClientLike> => {
    if (!clientPromise) {
      clientPromise = loadCloudTasksClient();
    }
    return clientPromise;
  };

  return {
    async enqueueHttpTask(
      input: EnqueueHttpTaskInput,
    ): Promise<EnqueueHttpTaskResult> {
      const resolvedClient = await getClient();
      const parent = resolvedClient.queuePath(
        env.projectId,
        env.location,
        env.queue,
      );
      const taskName = resolvedClient.taskPath(
        env.projectId,
        env.location,
        env.queue,
        input.taskId,
      );

      try {
        await resolvedClient.createTask({
          parent,
          task: {
            name: taskName,
            httpRequest: {
              httpMethod: "POST",
              url: input.url,
              headers: {
                "Content-Type": "application/json",
              },
              body: Buffer.from(JSON.stringify(input.body)).toString("base64"),
              oidcToken: {
                serviceAccountEmail: input.oidcServiceAccountEmail,
                audience: env.agentServiceUrl,
              },
            },
          },
        });

        return { outcome: "created" };
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          return { outcome: "already_exists" };
        }

        throw error;
      }
    },
  };
}

export type EnqueueFieldVarianceStartResult =
  | {
      outcome: "created";
      taskId: string;
      url: string;
      payload: AgentStartTaskPayload;
    }
  | {
      outcome: "already_exists";
      taskId: string;
      url: string;
      payload: AgentStartTaskPayload;
    };

/**
 * Enqueues the Field Variance start task for an AgentRun.
 * Task body contains only { agentRunId }.
 */
export async function enqueueFieldVarianceStartTask(args: {
  agentRunId: string;
  enqueuer?: CloudTasksEnqueuer;
  env?: AgentCloudTasksEnv;
}): Promise<EnqueueFieldVarianceStartResult> {
  const env = args.env ?? loadAgentCloudTasksEnv();
  const enqueuer = args.enqueuer ?? createGoogleCloudTasksEnqueuer(env);
  const taskId = buildFieldVarianceStartTaskId(args.agentRunId);
  const url = buildAgentRunStartUrl(env.agentServiceUrl, args.agentRunId);
  const payload: AgentStartTaskPayload = { agentRunId: args.agentRunId };

  const result = await enqueuer.enqueueHttpTask({
    taskId,
    url,
    body: payload,
    oidcServiceAccountEmail: env.invokerServiceAccountEmail,
  });

  return {
    outcome: result.outcome,
    taskId,
    url,
    payload,
  };
}

export type EnqueueFieldVarianceResumeResult =
  | {
      outcome: "created";
      taskId: string;
      url: string;
      payload: AgentResumeTaskPayload;
    }
  | {
      outcome: "already_exists";
      taskId: string;
      url: string;
      payload: AgentResumeTaskPayload;
    };

/**
 * Enqueues the Field Variance resume task for an AgentRun + Evidence pair.
 * Task body contains only { agentRunId, evidenceId }.
 */
export async function enqueueFieldVarianceResumeTask(args: {
  agentRunId: string;
  evidenceId: string;
  enqueuer?: CloudTasksEnqueuer;
  env?: AgentCloudTasksEnv;
}): Promise<EnqueueFieldVarianceResumeResult> {
  const env = args.env ?? loadAgentCloudTasksEnv();
  const enqueuer = args.enqueuer ?? createGoogleCloudTasksEnqueuer(env);
  const taskId = buildFieldVarianceResumeTaskId(
    args.agentRunId,
    args.evidenceId,
  );
  const url = buildAgentRunResumeUrl(env.agentServiceUrl, args.agentRunId);
  const payload: AgentResumeTaskPayload = {
    agentRunId: args.agentRunId,
    evidenceId: args.evidenceId,
  };

  const result = await enqueuer.enqueueHttpTask({
    taskId,
    url,
    body: payload,
    oidcServiceAccountEmail: env.invokerServiceAccountEmail,
  });

  return {
    outcome: result.outcome,
    taskId,
    url,
    payload,
  };
}

export type EnqueuePlanImportProcessResult =
  | {
      outcome: "created";
      taskId: string;
      url: string;
      payload: PlanImportProcessTaskPayload;
    }
  | {
      outcome: "already_exists";
      taskId: string;
      url: string;
      payload: PlanImportProcessTaskPayload;
    };

/**
 * Enqueues Plan Import document intelligence processing (Phase 2P.3).
 * Task body contains only { importId }.
 */
export async function enqueuePlanImportProcessTask(args: {
  importId: string;
  enqueuer?: CloudTasksEnqueuer;
  env?: AgentCloudTasksEnv;
}): Promise<EnqueuePlanImportProcessResult> {
  const env = args.env ?? loadAgentCloudTasksEnv();
  const enqueuer = args.enqueuer ?? createGoogleCloudTasksEnqueuer(env);
  const taskId = buildPlanImportProcessTaskId(args.importId);
  const url = buildPlanImportProcessUrl(env.agentServiceUrl, args.importId);
  const payload: PlanImportProcessTaskPayload = { importId: args.importId };

  const result = await enqueuer.enqueueHttpTask({
    taskId,
    url,
    body: payload,
    oidcServiceAccountEmail: env.invokerServiceAccountEmail,
  });

  return {
    outcome: result.outcome,
    taskId,
    url,
    payload,
  };
}
