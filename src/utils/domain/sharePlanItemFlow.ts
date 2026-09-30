import type { SharePlanItemDestination } from "../../components/chat/SharePlanItemSheet";
import {
  ensureDirectConversation,
  ensureProjectConversation,
} from "../../services/api/conversations";
import { ensureRemotePlanItem } from "../../services/sync/planItemBootstrap";
import { getRemoteProjectId } from "../../store/projectCloudMappings";

export class SharePlanItemFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharePlanItemFlowError";
  }
}

export type SharePlanItemNavigationParams = {
  remoteProjectId: string;
  conversationId: string;
  titleHint?: string;
  subtitleHint?: string;
  pendingPlanItemId: string;
  pendingPlanItemLabel: string;
  pendingDraftText: string;
};

export async function resolveSharePlanItemDestination(params: {
  ownerUid: string;
  projectId: string;
  planItemId: string;
  planItemLabel: string;
  projectName: string;
  isShared: boolean;
  remoteProjectId: string | null;
  remotePlanItemId: string | null;
  destination: SharePlanItemDestination;
}): Promise<SharePlanItemNavigationParams> {
  const {
    ownerUid,
    projectId,
    planItemId,
    planItemLabel,
    projectName,
    isShared,
    destination,
  } = params;

  let resolvedRemoteProjectId = params.remoteProjectId;
  let resolvedRemotePlanItemId = params.remotePlanItemId;

  if (!isShared) {
    resolvedRemotePlanItemId =
      (await ensureRemotePlanItem(ownerUid, projectId, planItemId)) ?? null;
    resolvedRemoteProjectId =
      (await getRemoteProjectId(ownerUid, projectId)) ?? null;
  }

  if (!resolvedRemoteProjectId || !resolvedRemotePlanItemId) {
    throw new SharePlanItemFlowError(
      "Cloud sync is required before this Plan Item can be shared in chat.",
    );
  }

  const conversation =
    destination.kind === "project_chat"
      ? await ensureProjectConversation(resolvedRemoteProjectId)
      : await ensureDirectConversation(
          resolvedRemoteProjectId,
          destination.projectMemberId,
        );

  return {
    remoteProjectId: resolvedRemoteProjectId,
    conversationId: conversation.id,
    titleHint:
      destination.kind === "project_chat"
        ? projectName
        : destination.titleHint,
    subtitleHint:
      destination.kind === "project_chat"
        ? "Project Chat"
        : destination.subtitleHint,
    pendingPlanItemId: resolvedRemotePlanItemId,
    pendingPlanItemLabel: planItemLabel,
    pendingDraftText: "Please verify this item.",
  };
}
