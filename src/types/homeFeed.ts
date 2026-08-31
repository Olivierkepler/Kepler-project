import type { DeltaStatus } from "./delta";

export type HomeFeedMediaItem = {
  id: string;
  type: "image" | "video";
  uri: string;
  durationLabel?: string;
};

export type HomeFeedAuthor = {
  userId: string;
  displayName: string;
  initial: string;
};

export type HomeFeedHumanUpdate = {
  kind: "human";
  id: string;
  /** Remote Firestore project id. */
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  text: string;
  author: HomeFeedAuthor;
  media?: HomeFeedMediaItem[];
  locationLabel?: string;
  tradeLabel?: string;
  levelLabel?: string;
  acknowledgementCount: number;
  commentCount: number;
  acknowledgedByCurrentUser: boolean;
};

export type HomeFeedIntelligenceUpdate = {
  kind: "intelligence";
  id: string;
  deltaId: string;
  projectId: string;
  projectName: string;
  planItemLabel: string;
  createdAt: string;
  plannedValue: number;
  actualValue: number;
  difference: number;
  unit: string;
  percentDifference: number | null;
  status: DeltaStatus;
};

export type HomeFeedProjectActivityUpdate = {
  kind: "project_activity";
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  text: string;
  activityLabel: string;
  /** Isolated Phase 1 presentation fixture — not persisted. */
  isPresentationFixture?: boolean;
};

export type HomeFeedItem =
  | HomeFeedHumanUpdate
  | HomeFeedIntelligenceUpdate
  | HomeFeedProjectActivityUpdate;

export type HomeFeedFilter = "all" | "my_projects";
