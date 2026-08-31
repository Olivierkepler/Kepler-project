import type { Project } from "../domain/project.js";
import { getProjectById } from "../repositories/projectsRepository.js";

export class ProjectAccessError extends Error {
  readonly statusCode: 404 | 401;

  constructor(message: string, statusCode: 404 | 401 = 404) {
    super(message);
    this.name = "ProjectAccessError";
    this.statusCode = statusCode;
  }
}

/**
 * Returns the project when it exists and is owned by uid.
 * Missing or foreign projects both surface as "not found"
 * so existence is not revealed across users.
 */
export async function assertProjectOwnedByUser(
  projectId: string,
  uid: string,
): Promise<Project> {
  if (!uid) {
    throw new ProjectAccessError("Unauthorized", 401);
  }

  const project = await getProjectById(projectId);

  if (!project || project.ownerUid !== uid) {
    throw new ProjectAccessError("Project not found", 404);
  }

  return project;
}
