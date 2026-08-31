import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  candidateIsPlanItemCompatible,
  type PlanImportCandidate,
  type PlanImportCandidateType,
} from "../domain/planImportCandidate.js";
import type { PlanImport } from "../domain/planImport.js";
import type { PlanItem, PlanItemType } from "../domain/planItem.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { getCandidatesForImport } from "../repositories/planImportCandidatesRepository.js";
import { getPlanImportById } from "../repositories/planImportsRepository.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import { evaluatePlanImportApprovalReadiness } from "./planImportReview.js";

export class PlanImportApprovalError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PlanImportApprovalError";
    this.statusCode = statusCode;
  }
}

/**
 * Deterministic local PlanItem id from candidate id.
 * Enables createRemotePlanItemId(projectId, localId) idempotency.
 */
export function localPlanItemIdForCandidate(candidateId: string): string {
  const trimmed = candidateId.trim();
  if (!trimmed) {
    throw new Error("candidateId is required");
  }
  if (trimmed.includes("/")) {
    throw new Error("candidateId must not contain '/'");
  }
  return `pi-cand-${trimmed}`;
}

function toPlanItemType(
  type: PlanImportCandidateType,
): PlanItemType | undefined {
  if (
    type === "length" ||
    type === "area" ||
    type === "count" ||
    type === "volume"
  ) {
    return type;
  }
  return undefined;
}

/**
 * Maps a reviewed selected candidate → PlanItem using effective fields.
 * unitCost / productionRatePerDay / laborHoursPerUnit use safe defaults
 * (AI extraction does not produce those rates).
 */
export function mapCandidateToPlanItem(args: {
  candidate: PlanImportCandidate;
  projectId: string;
  importId: string;
}): PlanItem {
  const { candidate, projectId, importId } = args;

  if (!candidateIsPlanItemCompatible(candidate)) {
    throw new PlanImportApprovalError(
      `Candidate ${candidate.id} is not PlanItem-compatible.`,
      409,
    );
  }

  const type = toPlanItemType(candidate.type);
  if (!type) {
    throw new PlanImportApprovalError(
      `Candidate ${candidate.id} has unsupported type.`,
      409,
    );
  }

  const localPlanItemId = localPlanItemIdForCandidate(candidate.id);
  const id = createRemotePlanItemId(projectId, localPlanItemId);

  return {
    id,
    localPlanItemId,
    projectId,
    type,
    label: candidate.label.trim(),
    plannedValue: candidate.plannedValue as number,
    unit: (candidate.unit as string).trim(),
    unitCost: 0,
    productionRatePerDay: 1,
    laborHoursPerUnit: 0,
    origin: "plan_import",
    planImportId: importId,
    planImportCandidateId: candidate.id,
  };
}

function sourceFileBelongsToImport(
  candidate: PlanImportCandidate,
  planImport: PlanImport,
): boolean {
  return planImport.files.some((file) => file.id === candidate.sourceFileId);
}

export type ApprovePlanImportResult = {
  import: PlanImport;
  createdPlanItemIds: string[];
  createdCount: number;
  alreadyApproved: boolean;
  planItems: PlanItem[];
};

async function loadPlanItemsByIds(ids: string[]): Promise<PlanItem[]> {
  const items: PlanItem[] = [];
  for (const id of ids) {
    const item = await getPlanItemById(id);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/**
 * Authoritative approval: selected reviewed candidates → PlanItems.
 *
 * Idempotent:
 * - Already-approved imports return the existing receipt (zero new items).
 * - PlanItem document ids are deterministic from candidate ids.
 *
 * Atomicity: one Firestore transaction writes PlanItems, candidate markers,
 * and import status=approved together. Never marks approved before items exist.
 */
export async function approvePlanImport(args: {
  projectId: string;
  importId: string;
  approverUid: string;
}): Promise<ApprovePlanImportResult> {
  const existing = await getPlanImportById(args.importId);
  if (!existing || existing.projectId !== args.projectId) {
    throw new PlanImportApprovalError("Plan import not found", 404);
  }

  const candidates = await getCandidatesForImport(args.importId);

  if (existing.status === "approved") {
    const ids = existing.createdPlanItemIds ?? [];
    const planItems = await loadPlanItemsByIds(ids);
    return {
      import: existing,
      createdPlanItemIds: ids,
      createdCount: existing.createdPlanItemCount ?? ids.length,
      alreadyApproved: true,
      planItems,
    };
  }

  if (existing.status !== "ready_for_approval") {
    throw new PlanImportApprovalError(
      "Plan import must be ready for approval before creating Plan Items.",
      409,
    );
  }

  const readiness = evaluatePlanImportApprovalReadiness(candidates);
  if (!readiness.ready) {
    throw new PlanImportApprovalError(
      readiness.reasons[0] ?? "Import is not ready for approval.",
      409,
    );
  }

  const selected = candidates.filter((c) => c.selected);

  for (const candidate of selected) {
    if (candidate.reviewStatus !== "reviewed") {
      throw new PlanImportApprovalError(
        "Every selected suggestion must be reviewed before approval.",
        409,
      );
    }
    if (!candidateIsPlanItemCompatible(candidate)) {
      throw new PlanImportApprovalError(
        `Selected suggestion "${candidate.label}" cannot become a Plan Item. Fix type, quantity, and unit.`,
        409,
      );
    }
    if (!sourceFileBelongsToImport(candidate, existing)) {
      throw new PlanImportApprovalError(
        `Selected suggestion "${candidate.label}" has invalid source provenance.`,
        409,
      );
    }
    if (
      candidate.projectId !== args.projectId ||
      candidate.importId !== args.importId
    ) {
      throw new PlanImportApprovalError(
        "Candidate does not belong to this import.",
        403,
      );
    }
  }

  const planItems = selected.map((candidate) =>
    mapCandidateToPlanItem({
      candidate,
      projectId: args.projectId,
      importId: args.importId,
    }),
  );

  const nowIso = new Date().toISOString();
  const createdPlanItemIds = planItems.map((item) => item.id);

  const approvedImport: PlanImport = {
    ...existing,
    status: "approved",
    updatedAt: nowIso,
    approvedAt: nowIso,
    approvedByUid: args.approverUid,
    createdPlanItemIds,
    selectedCandidateCount: selected.length,
    createdPlanItemCount: planItems.length,
  };
  delete approvedImport.errorMessage;

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  let concurrentAlreadyApproved = false;

  await db.runTransaction(async (tx) => {
    const importRef = db.collection(COLLECTIONS.planImports).doc(args.importId);
    const importSnap = await tx.get(importRef);
    if (!importSnap.exists) {
      throw new PlanImportApprovalError("Plan import not found", 404);
    }

    const live = importSnap.data() as PlanImport;
    if (live.projectId !== args.projectId) {
      throw new PlanImportApprovalError("Plan import not found", 404);
    }

    if (live.status === "approved") {
      concurrentAlreadyApproved = true;
      return;
    }

    if (live.status !== "ready_for_approval") {
      throw new PlanImportApprovalError(
        "Plan import must be ready for approval before creating Plan Items.",
        409,
      );
    }

    for (const candidate of selected) {
      const candidateRef = db
        .collection(COLLECTIONS.planImportCandidates)
        .doc(candidate.id);
      const candidateSnap = await tx.get(candidateRef);
      if (!candidateSnap.exists) {
        throw new PlanImportApprovalError("Candidate not found", 404);
      }
      const liveCandidate = candidateSnap.data() as PlanImportCandidate;
      if (
        !liveCandidate.selected ||
        liveCandidate.reviewStatus !== "reviewed" ||
        !candidateIsPlanItemCompatible(liveCandidate)
      ) {
        throw new PlanImportApprovalError(
          "Selected candidates changed during approval. Refresh and try again.",
          409,
        );
      }
    }

    for (const planItem of planItems) {
      const planItemRef = db.collection(COLLECTIONS.planItems).doc(planItem.id);
      tx.set(planItemRef, planItem, { merge: false });
    }

    for (const planItem of planItems) {
      const candidateId = planItem.planImportCandidateId;
      if (!candidateId) {
        continue;
      }
      const base = candidateById.get(candidateId);
      if (!base) {
        continue;
      }
      const nextCandidate: PlanImportCandidate = {
        ...base,
        createdPlanItemId: planItem.id,
        updatedAt: nowIso,
      };
      tx.set(
        db.collection(COLLECTIONS.planImportCandidates).doc(candidateId),
        nextCandidate,
        { merge: false },
      );
    }

    tx.set(importRef, approvedImport, { merge: false });
  });

  const finalImport = await getPlanImportById(args.importId);
  if (!finalImport || finalImport.status !== "approved") {
    throw new PlanImportApprovalError(
      "Approval did not complete. Please try again.",
      500,
    );
  }

  const ids = finalImport.createdPlanItemIds ?? createdPlanItemIds;
  const responsePlanItems = concurrentAlreadyApproved
    ? await loadPlanItemsByIds(ids)
    : planItems;

  return {
    import: finalImport,
    createdPlanItemIds: ids,
    createdCount: finalImport.createdPlanItemCount ?? ids.length,
    alreadyApproved: concurrentAlreadyApproved,
    planItems: responsePlanItems,
  };
}
