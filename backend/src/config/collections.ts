export const COLLECTIONS = {
  projects: "projects",
  planItems: "planItems",
  measurements: "measurements",
  deltas: "deltas",
  evidence: "evidence",
  /** Plan document imports (Phase 2P.2). Metadata only; bytes in GCS. */
  planImports: "planImports",
  /** Proposed plan baseline candidates from document intelligence (Phase 2P.3). */
  planImportCandidates: "planImportCandidates",
  agentRuns: "agentRuns",
  agentSummaries: "agentSummaries",
  /** Flat collaboration membership (Phase 1F). Does not grant API access yet. */
  projectMembers: "projectMembers",
  /** Flat collaboration invitations (Phase 1G). Invitation ≠ membership / access. */
  projectInvitations: "projectInvitations",
  /** Flat WorkPackage scopes within a cloud Project (Phase 2C). */
  workPackages: "workPackages",
  /** Flat WorkPackage ↔ ProjectMember assignments (Phase 2D). */
  workPackageAssignments: "workPackageAssignments",
  /** Append-only Measurement contribution review audit (Phase 2J.1). */
  contributionReviewEvents: "contributionReviewEvents",
  /** Append-only Assignment lifecycle progress audit (Phase 2K.1). */
  assignmentProgressEvents: "assignmentProgressEvents",
  /** Project timeline projection (Phase 2M.1). */
  activityEvents: "activityEvents",
  /** Per-user inbox derived from Activity (Phase 2M.1). */
  notifications: "notifications",
  /** Presentation-only user profile keyed by Firebase UID. */
  userProfiles: "userProfiles",
  /** Project-scoped chat conversations (Phase Chat 1). */
  conversations: "conversations",
  /** Conversation participants keyed by conversation + ProjectMember (Phase Chat 1). */
  conversationParticipants: "conversationParticipants",
  /** Chat messages within a conversation (Phase Chat 1). */
  messages: "messages",
  /** Project-scoped human feed posts (Phase Feed 2A). */
  feedPosts: "feedPosts",
  /** Per-user acknowledgements on feed posts (Phase Feed 2B). */
  feedPostAcknowledgements: "feedPostAcknowledgements",
  /** Comments on feed posts (Phase Feed 2B). */
  feedPostComments: "feedPostComments",
  /** Per-user Expo push device registrations (Phase Feed 2E). */
  pushDevices: "pushDevices",
} as const;
