import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { PersistedPlanImportCandidate } from "../domain/planImportExtraction.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function replaceCandidatesForImport(
  importId: string,
  projectId: string,
  candidates: PersistedPlanImportCandidate[],
): Promise<void> {
  requireId(importId, "importId");
  requireId(projectId, "projectId");

  for (const candidate of candidates) {
    if (candidate.importId !== importId || candidate.projectId !== projectId) {
      throw new Error("candidate_scope_mismatch");
    }
  }

  const existing = await db
    .collection(COLLECTIONS.planImportCandidates)
    .where("importId", "==", importId)
    .get();

  const batch = db.batch();
  for (const doc of existing.docs) {
    batch.delete(doc.ref);
  }
  for (const candidate of candidates) {
    batch.set(
      db.collection(COLLECTIONS.planImportCandidates).doc(candidate.id),
      candidate,
    );
  }
  await batch.commit();
}
