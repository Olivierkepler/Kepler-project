import { bootstrapRemoteProject } from "../api/projects";
import {
  getRemoteProjectId,
  setProjectCloudMapping,
} from "../../store/projectCloudMappings";
import { getProjectById } from "../../store/projects";

const projectEnsureInFlight = new Map<string, Promise<string | undefined>>();

function projectEnsureKey(ownerUid: string, localProjectId: string): string {
  return `${ownerUid}:${localProjectId}`;
}

async function runEnsureRemoteProject(
  ownerUid: string,
  localProjectId: string,
): Promise<string | undefined> {
  const existing = await getRemoteProjectId(ownerUid, localProjectId);

  if (existing) {
    return existing;
  }

  const localProject = await getProjectById(ownerUid, localProjectId);

  if (!localProject) {
    return undefined;
  }

  try {
    const { project } = await bootstrapRemoteProject({
      localProjectId: localProject.id,
      name: localProject.name,
      location: localProject.location,
      status: localProject.status,
      progress: localProject.progress,
      openDeltas: localProject.openDeltas,
      assignedTasks: localProject.assignedTasks,
    });

    await setProjectCloudMapping({
      ownerUid,
      localProjectId,
      remoteProjectId: project.id,
    });

    return project.id;
  } catch {
    return undefined;
  }
}

/**
 * Ensure a remote Project exists for a local project id.
 * Idempotent. Returns remoteProjectId or undefined on failure.
 * Does not throw into lifecycle callers.
 */
export async function ensureRemoteProject(
  ownerUid: string,
  localProjectId: string,
): Promise<string | undefined> {
  if (!ownerUid.trim() || !localProjectId.trim()) {
    return undefined;
  }

  const key = projectEnsureKey(ownerUid, localProjectId);
  const existing = projectEnsureInFlight.get(key);

  if (existing) {
    return existing;
  }

  const run = runEnsureRemoteProject(ownerUid, localProjectId).finally(() => {
    if (projectEnsureInFlight.get(key) === run) {
      projectEnsureInFlight.delete(key);
    }
  });

  projectEnsureInFlight.set(key, run);
  return run;
}
