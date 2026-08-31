import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { AgentSummary } from "../domain/agentSummary.js";
import { normalizeAgentSummary } from "../validation/agentSummary.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function agentSummariesCollection() {
  return db.collection(COLLECTIONS.agentSummaries);
}

export async function getAgentSummaryById(
  summaryId: string,
): Promise<AgentSummary | undefined> {
  requireId(summaryId, "summaryId");

  const snapshot = await agentSummariesCollection().doc(summaryId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeAgentSummary(snapshot.data());
}
