export type PendingPlanItemImageSync = {
  ownerUid: string;
  localProjectId: string;
  localPlanItemId: string;
  operation: "upload" | "remove";
  operationId: string;
  createdAt: string;
  lastAttemptAt: string;
};

export function isPendingPlanItemImageSync(
  value: unknown,
): value is PendingPlanItemImageSync {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.ownerUid === "string" && record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" && record.localProjectId.trim().length > 0 &&
    typeof record.localPlanItemId === "string" && record.localPlanItemId.trim().length > 0 &&
    (record.operation === "upload" || record.operation === "remove") &&
    typeof record.operationId === "string" && record.operationId.trim().length > 0 &&
    typeof record.createdAt === "string" && record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" && record.lastAttemptAt.trim().length > 0
  );
}
