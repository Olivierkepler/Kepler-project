export type MainTabParamList = {
  Home: undefined;
  Projects: undefined;
  Capture: undefined;
  Deltas: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs:
    | undefined
    | {
        screen?: keyof MainTabParamList;
      };

  Project: {
    projectId: string;
    /**
     * Project open source (Phase 1I.2).
     * Omit or "local" = owned AsyncStorage project (existing behavior).
     * "shared" = remote Firestore project ID; read-only cloud load.
     */
    source?: "local" | "shared";
    /** Presentation-only role for shared projects (not an auth boundary). */
    membershipRole?: import("../types/projectMember").ProjectMemberRole;
  };

  ProjectPlan: {
    projectId: string;
  };

  PlanItemDetail: {
    projectId: string;
    planItemId: string;
    /**
     * "shared" = remote project/plan item ids; read-only cloud detail.
     * Omit or "local" = owned AsyncStorage ids.
     */
    source?: "local" | "shared";
  };

  CaptureProject: {
    projectId: string;
  };

  /**
   * Shared/cloud-direct field contribution (Phase 2I.2).
   * remoteProjectId is the Firestore remote project document id.
   * PlanItems are loaded from the backend on screen focus.
   */
  SharedCapture: {
    remoteProjectId: string;
    membershipRole: "contractor" | "field_member";
    /** Optional canonical remote Plan Item to preselect for a To Do action. */
    planItemId?: string;
  };

  Measurement: {
    projectId: string;
    /** Preselect a length/ft PlanItem when eligible; ignored otherwise. */
    planItemId?: string;
  };

  ProjectMeasurements: {
    projectId: string;
  };

  MeasurementDetail: {
    measurementId: string;
  };

  ProjectDeltas: {
    projectId: string;
    initialStatus?: "open" | "accepted" | "rejected" | "resolved";
  };

  ProjectIntelligence: {
    projectId: string;
  };

  ProjectActivity: {
    projectId: string;
    /**
     * Omit or "local" = owned AsyncStorage project.
     * "shared" = remote project id; cloud Activity API.
     * Owned projects with a remote mapping also use cloud Activity.
     */
    source?: "local" | "shared";
  };

  Notifications: undefined;

  /** Authorized BuildSigma search (Phase Feed 2F). */
  Search: undefined;

  /**
   * Temporary Kepler brand showcase / recording surface.
   * Presentation only — not part of normal product flow.
   */
  KeplerShowcase: undefined;

  FeedPostDetail: {
    projectId: string;
    postId: string;
    openComments?: boolean;
  };

  Invitations: undefined;

  ProjectAgentActivity: {
    projectId: string;
  };

  AgentRunDetail: {
    projectId: string;
    agentRunId: string;
    awaitingResume?: boolean;
  };

  AgentSummary: {
    projectId: string;
    summaryId: string;
  };

  ProjectFieldReports: {
    projectId: string;
  };

  FieldReportPreview:
    | {
        projectId: string;
        startAt: string;
        endAt: string;
        periodLabel: string;
      }
    | {
        projectId: string;
        savedReportId: string;
      };

  DeltaDetail: {
    deltaId: string;
  };

  CloudProjects: undefined;

  EditProject: {
    projectId: string;
  };

  CreateProject: undefined;

  EditPlanItem: {
    projectId: string;
    planItemId: string;
  };

  AddPlanItem: {
    projectId: string;
  };

  /**
   * Choose manual vs file-based Plan creation (Phase 2P.1).
   */
  PlanAddMethod: {
    projectId: string;
  };

  /**
   * Select project documents for a local PlanImport (Phase 2P.1).
   */
  PlanImportStart: {
    projectId: string;
  };

  /**
   * Human review workspace for PlanImport candidates (Phase 2P.4).
   * historicalView: read-only reopen of an approved import's suggestions.
   */
  PlanImportReview: {
    projectId: string;
    importId: string;
    historicalView?: boolean;
  };

  /**
   * Final approval confirmation (Phase 2P.5).
   */
  PlanImportApproval: {
    projectId: string;
    importId: string;
  };

  ProjectEvidence: {
    projectId: string;
  };

  ProjectTeam: {
    projectId: string;
  };

  ProjectTeamMember: {
    projectId: string;
    projectMemberId: string;
  };

  /**
   * Project-scoped chat conversation (Phase Chat 1).
   * remoteProjectId is the cloud Firestore project id.
   */
  ProjectChat: {
    remoteProjectId: string;
    conversationId: string;
    titleHint?: string;
    subtitleHint?: string;
    /** Pending Plan Item share (remote id only). */
    pendingPlanItemId?: string;
    pendingPlanItemLabel?: string;
    pendingDraftText?: string;
  };

  /**
   * Conversation information (participants, shared plan items, project link).
   */
  ChatInfo: {
    remoteProjectId: string;
    conversationId: string;
    titleHint?: string;
    subtitleHint?: string;
  };

  /**
   * Owner contribution review queue (Phase 2J.2).
   * projectId is the local owned project id; remote mapping resolved on screen.
   */
  ContributionReview: {
    projectId: string;
  };

  ContributionReviewDetail: {
    projectId: string;
    remoteProjectId: string;
    measurementId: string;
  };

  /**
   * Owner work progress (Phase 2K.2).
   * projectId is the local owned project id; remote mapping resolved on screen.
   */
  WorkProgress: {
    projectId: string;
  };

  WorkProgressDetail: {
    projectId: string;
    remoteProjectId: string;
    workPackageId: string;
  };

  InviteProjectMember: {
    projectId: string;
  };

  AddEvidence: {
    projectId: string;
    mode: "photo" | "note";
    measurementId?: string;
    deltaId?: string;
    returnToAgentRunId?: string;
    /**
     * "shared" = cloud-direct Field Member capture against remote project.
     * projectId is the remote project id; deltaId is the Delta.localDeltaId.
     */
    source?: "local" | "shared";
  };
};

export type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingPlan: undefined;
  OnboardingCapture: undefined;
  OnboardingReconcile: undefined;
};
