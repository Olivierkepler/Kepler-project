import type { Project } from "../../types/project";
import type { Delta } from "../../types/delta";
import { summarizeDeltas } from "./summarizeDeltas";

export type ProjectSnapshot = {
  projectId: string;
  name: string;
  location: string;
  progress: number;
  openCount: number;
  totalCostImpact: number;
};

export function buildProjectSnapshots(
  projectList: Project[],
  deltas: Delta[],
  limit = 3,
): ProjectSnapshot[] {
  return projectList.slice(0, limit).map((project) => {
    const summary = summarizeDeltas(
      deltas.filter((delta) => delta.projectId === project.id),
    );

    return {
      projectId: project.id,
      name: project.name,
      location: project.location,
      progress: project.progress,
      openCount: summary.openCount,
      totalCostImpact: summary.totalCostImpact,
    };
  });
}
