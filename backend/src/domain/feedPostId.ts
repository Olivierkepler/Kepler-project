export function createRemoteFeedPostId(
  projectId: string,
  localPostId: string,
): string {
  const project = projectId.trim();
  const local = localPostId.trim();

  if (!project || !local || local.includes("/")) {
    throw new Error("Invalid feed post id inputs");
  }

  return `${project}_${local}`;
}

export function createRemoteFeedMediaId(
  postId: string,
  localMediaId: string,
): string {
  const post = postId.trim();
  const local = localMediaId.trim();

  if (!post || !local || local.includes("/")) {
    throw new Error("Invalid feed media id inputs");
  }

  return `${post}_${local}`;
}
