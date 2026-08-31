export type ProjectStatus =
  | 'active'
  | 'planning'
  | 'completed'
  | 'on-hold';

export interface Project {
  id: string;
  name: string;
  location: string;
  status: ProjectStatus;
  progress: number;
  openDeltas: number;
  assignedTasks: number;
  /** Local device URI for optional project avatar (not synced to cloud). */
  avatarUri?: string | null;
  /** ISO-8601 create time. Optional for legacy local projects. */
  createdAt?: string;
  /** ISO-8601 last metadata update time. Optional for legacy local projects. */
  updatedAt?: string;
  /**
   * ISO-8601 archive time. Optional for legacy local projects.
   * undefined/null = active (current workspace); string = archived.
   * Local-only in this phase — not part of the remote sync contract.
   */
  archivedAt?: string | null;
}