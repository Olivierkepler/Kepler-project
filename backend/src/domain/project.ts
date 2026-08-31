export type ProjectStatus =
  | "active"
  | "planning"
  | "completed"
  | "on-hold";

/**
 * Backend Project is ahead of the mobile Project type.
 *
 * - id: remote canonical Firestore document ID (tenant-safe)
 * - localProjectId: originating client/local ID (e.g. project-001)
 * - ownerUid: Firebase authenticated owner
 *
 * Mobile AsyncStorage still uses local IDs only.
 */
export type Project = {
  id: string;
  localProjectId: string;
  ownerUid: string;
  name: string;
  location: string;
  status: ProjectStatus;
  progress: number;
  openDeltas: number;
  assignedTasks: number;
};
