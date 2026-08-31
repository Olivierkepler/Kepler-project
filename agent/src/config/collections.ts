export const COLLECTIONS = {
  projects: "projects",
  planItems: "planItems",
  measurements: "measurements",
  deltas: "deltas",
  evidence: "evidence",
  planImports: "planImports",
  planImportCandidates: "planImportCandidates",
  agentRuns: "agentRuns",
  agentSummaries: "agentSummaries",
  /** Collaboration provenance reads only (Phase 2L.1). */
  workPackages: "workPackages",
  workPackageAssignments: "workPackageAssignments",
  projectMembers: "projectMembers",
  /** Activity / notifications (evidence-request projection from agent service). */
  activityEvents: "activityEvents",
  notifications: "notifications",
} as const;
