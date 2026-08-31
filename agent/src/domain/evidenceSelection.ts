import type { AgentRun } from "./agentRun.js";
import type { Evidence } from "./evidence.js";

/**
 * Direct Delta Evidence = same projectId + localDeltaId as AgentRun.
 */
export function listDirectDeltaEvidence(
  agentRun: AgentRun,
  evidence: Evidence[],
): Evidence[] {
  const localDeltaId = agentRun.contextRefs.localDeltaId;
  const projectId = agentRun.projectId;
  return evidence.filter(
    (item) =>
      item.projectId === projectId && item.localDeltaId === localDeltaId,
  );
}

function byNewestCreatedAt(a: Evidence, b: Evidence): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Selects ONE Evidence record for A6 analysis.
 *
 * 1. Prefer preferredEvidenceId when it is direct Delta Evidence
 *    (typically A5 resume lastEvidenceId / triggering Evidence).
 * 2. Else newest direct Delta photo.
 * 3. Else newest direct Delta note.
 * 4. Else null.
 *
 * Model never chooses the object.
 */
export function selectEvidenceForAnalysis(args: {
  agentRun: AgentRun;
  evidence: Evidence[];
  preferredEvidenceId?: string | null;
}): Evidence | null {
  const direct = listDirectDeltaEvidence(args.agentRun, args.evidence);
  if (direct.length === 0) {
    return null;
  }

  const preferredId = args.preferredEvidenceId?.trim();
  if (preferredId) {
    const preferred = direct.find((item) => item.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  const photos = direct
    .filter((item) => item.type === "photo" && Boolean(item.objectPath))
    .sort(byNewestCreatedAt);
  if (photos[0]) {
    return photos[0];
  }

  const notes = direct
    .filter((item) => item.type === "note")
    .sort(byNewestCreatedAt);
  return notes[0] ?? null;
}
