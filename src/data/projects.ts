import { Project } from '../types/project';

/**
 * Seed/default Projects for first-time local store initialization.
 * Operational reads use src/store/projects.ts.
 */
export const projects: Project[] = [
  {
    id: 'project-001',
    name: 'Boston Office Renovation',
    location: 'Boston, MA',
    status: 'active',
    progress: 42,
    openDeltas: 3,
    assignedTasks: 5,
  },
  {
    id: 'project-002',
    name: 'Cambridge Medical Center',
    location: 'Cambridge, MA',
    status: 'active',
    progress: 68,
    openDeltas: 1,
    assignedTasks: 2,
  },
];