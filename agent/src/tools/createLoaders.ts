import { getDeltaById } from "../repositories/deltasRepository.js";
import { getEvidenceForProject } from "../repositories/evidenceRepository.js";
import { getMeasurementById } from "../repositories/measurementsRepository.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import { getProjectMemberById } from "../repositories/projectMembersRepository.js";
import { getWorkPackageAssignmentById } from "../repositories/workPackageAssignmentsRepository.js";
import { getWorkPackageById } from "../repositories/workPackagesRepository.js";
import type { DomainLoaders } from "./toolContext.js";

export function createFirestoreDomainLoaders(): DomainLoaders {
  return {
    getProjectById,
    getPlanItemById,
    getMeasurementById,
    getDeltaById,
    getEvidenceForProject,
    getWorkPackageById,
    getWorkPackageAssignmentById,
    getProjectMemberById,
  };
}
