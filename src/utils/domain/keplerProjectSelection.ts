/** In-memory selection shared across Kepler tab remounts during this app session. */
export type KeplerSelectedProject = { ownerUid: string; id: string; name: string; location: string };

let selectedProject: KeplerSelectedProject | null = null;

export function getKeplerSelectedProject(ownerUid: string | undefined): KeplerSelectedProject | null {
  return ownerUid && selectedProject?.ownerUid === ownerUid ? selectedProject : null;
}

export function setKeplerSelectedProject(project: KeplerSelectedProject | null): void {
  selectedProject = project;
}
