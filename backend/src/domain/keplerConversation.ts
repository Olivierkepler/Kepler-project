/**
 * Private project-grounded transcript. Phase 1C-1 has no automatic expiration;
 * public history/deletion must remain unavailable until safe cascade deletion
 * is implemented for the flat Kepler message collection.
 */
export type KeplerConversation = {
  id: string;
  projectId: string;
  userUid: string;
  createdAt: string;
  updatedAt: string;
};
