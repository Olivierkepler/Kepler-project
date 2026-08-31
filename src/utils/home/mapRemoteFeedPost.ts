import type { RemoteFeedPost } from "../../services/api/feedPosts";
import type { HomeFeedHumanUpdate } from "../../types/homeFeed";
import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../domain/memberDisplay";

function formatDurationLabel(
  seconds: number,
): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function mapRemoteFeedPostToHumanUpdate(
  post: RemoteFeedPost,
): HomeFeedHumanUpdate {
  const authorLabel = formatMemberDisplayLabel({
    displayName: post.author.displayName,
    userId: post.author.userId,
  });

  return {
    kind: "human",
    id: post.id,
    projectId: post.projectId,
    projectName: post.projectName,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    text: post.text,
    author: {
      userId: post.author.userId,
      displayName: authorLabel,
      initial: memberDisplayInitial(authorLabel),
    },
    locationLabel: post.locationLabel ?? undefined,
    media: post.media.map((item) => ({
      id: item.id,
      type: item.type,
      uri: "",
      durationLabel:
        item.durationSeconds == null
          ? undefined
          : formatDurationLabel(
              item.durationSeconds,
            ),
    })),
    acknowledgementCount: post.acknowledgementCount,
    commentCount: post.commentCount,
    acknowledgedByCurrentUser:
      post.acknowledgedByCurrentUser,
  };
}
