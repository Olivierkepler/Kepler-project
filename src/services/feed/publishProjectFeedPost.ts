import * as FileSystem from "expo-file-system/legacy";

import {
  createRemoteFeedPost,
  requestFeedMediaUploadUrl,
  type CreateRemoteFeedPostMediaInput,
  type RemoteFeedPost,
} from "../api/feedPosts";

export type PublishFeedMediaInput = {
  localMediaId: string;
  type: "image" | "video";
  uri: string;
  fileName?: string | null;
  durationSeconds?: number | null;
};

export type PublishProjectFeedPostInput = {
  remoteProjectId: string;
  localPostId: string;
  text: string;
  locationLabel?: string | null;
  media: PublishFeedMediaInput[];
};

function contentTypeFromUri(
  uri: string,
  type: "image" | "video",
): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();

  if (type === "video") {
    switch (ext) {
      case "mov":
        return "video/quicktime";
      case "mp4":
      default:
        return "video/mp4";
    }
  }

  switch (ext) {
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

async function uploadFeedMediaItem(input: {
  remoteProjectId: string;
  localPostId: string;
  media: PublishFeedMediaInput;
}): Promise<CreateRemoteFeedPostMediaInput> {
  const contentType = contentTypeFromUri(
    input.media.uri,
    input.media.type,
  );

  const signed = await requestFeedMediaUploadUrl(
    input.remoteProjectId,
    {
      localPostId: input.localPostId,
      localMediaId: input.media.localMediaId,
      type: input.media.type,
      contentType,
    },
  );

  const uploadResult = await FileSystem.uploadAsync(
    signed.uploadUrl,
    input.media.uri,
    {
      httpMethod: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
  );

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error("Media upload failed.");
  }

  return {
    localMediaId: input.media.localMediaId,
    type: input.media.type,
    objectPath: signed.objectPath,
    contentType,
    fileName: input.media.fileName ?? null,
    width: null,
    height: null,
    durationSeconds: input.media.durationSeconds ?? null,
  };
}

export async function publishProjectFeedPost(
  input: PublishProjectFeedPostInput,
): Promise<RemoteFeedPost> {
  const uploadedMedia: CreateRemoteFeedPostMediaInput[] = [];

  for (const media of input.media) {
    const uploaded = await uploadFeedMediaItem({
      remoteProjectId: input.remoteProjectId,
      localPostId: input.localPostId,
      media,
    });

    uploadedMedia.push(uploaded);
  }

  return createRemoteFeedPost(input.remoteProjectId, {
    localPostId: input.localPostId,
    text: input.text.trim(),
    locationLabel: input.locationLabel ?? null,
    media: uploadedMedia,
  });
}
