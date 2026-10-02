import type { ActivityEvent } from "../../domain/activityEvent.js";
import type { Delta } from "../../domain/delta.js";
import type { Evidence } from "../../domain/evidence.js";
import type { Measurement } from "../../domain/measurement.js";
import type { PlanItem } from "../../domain/planItem.js";
import type { Project } from "../../domain/project.js";
import type { WorkPackage } from "../../domain/workPackage.js";
import type { KeplerReference, KeplerReferenceKind } from "../../domain/keplerMessage.js";
import {
  filterDeltasForAccess,
  filterEvidenceForAccess,
  filterMeasurementsForAccess,
  filterPlanItemsForAccess,
  filterWorkPackagesForAccess,
  type ProjectAccessContext,
} from "../collaboration/projectAccessScope.js";
import { getPlanItemsForProject } from "../../repositories/planItemsRepository.js";
import { listWorkPackagesForProject } from "../../repositories/workPackagesRepository.js";
import { getMeasurementsForProject } from "../../repositories/measurementsRepository.js";
import { getDeltasForProject } from "../../repositories/deltasRepository.js";
import { getEvidenceForProject } from "../../repositories/evidenceRepository.js";
import { listActivityEventsForProject } from "../../repositories/activityEventsRepository.js";
import { getMeasurementById } from "../../repositories/measurementsRepository.js";
import { filterActivityEventsForAccess } from "../activity/activityVisibility.js";
import { listProjectProgressBaseline, listProjectProgressSnapshots } from "../../repositories/projectProgressRepository.js";

export const KEPLER_CONTEXT_LIMITS = {
  planItems: 20,
  workPackages: 20,
  measurements: 20,
  deltas: 20,
  evidence: 10,
  activity: 10,
} as const;

export type KeplerProjectContext = {
  project: { id: string; name: string; location: string; status: string };
  datasets: string[];
  planItems: Array<{ id: string; label: string; type: string; plannedValue: number; unit: string }>;
  workPackages: Array<{ id: string; name: string; status: string; planItemIds: string[] }>;
  measurements: Array<{ id: string; planItemId: string; label: string; value: number; unit: string; createdAt: string; reviewStatus: string }>;
  deltas: Array<{ id: string; planItemId: string; measurementId: string; plannedValue: number; actualValue: number; difference: number; percentDifference: number | null; unit: string; costImpact: number; scheduleImpactDays: number; laborImpactHours: number; status: string; createdAt: string }>;
  evidence: Array<{ id: string; type: string; note: string; createdAt: string; measurementId?: string; deltaId?: string }>;
  activity: Array<{ id: string; type: string; createdAt: string; subjectType: string }>;
  progress?: { baseline: Array<{ effectiveDate: string; plannedPercent: number }>; actual: Array<{ capturedAt: string; actualPercent: number; source: string }> };
  allowedReferences: KeplerReference[];
};

export type KeplerContextRepositories = {
  plans(projectId: string): Promise<PlanItem[]>;
  workPackages(projectId: string): Promise<WorkPackage[]>;
  measurements(projectId: string): Promise<Measurement[]>;
  deltas(projectId: string): Promise<Delta[]>;
  evidence(projectId: string): Promise<Evidence[]>;
  activity(projectId: string): Promise<ActivityEvent[]>;
  measurementById(id: string): Promise<Measurement | undefined>;
  progressBaseline(projectId: string): Promise<Array<{ effectiveDate: string; plannedPercent: number }>>;
  progressActual(projectId: string): Promise<Array<{ capturedAt: string; actualPercent: number; source: string }>>;
};

const defaultRepositories: KeplerContextRepositories = {
  plans: getPlanItemsForProject,
  workPackages: listWorkPackagesForProject,
  measurements: getMeasurementsForProject,
  deltas: getDeltasForProject,
  evidence: getEvidenceForProject,
  activity: async (projectId) => (await listActivityEventsForProject(projectId, { limit: 100 })).items,
  measurementById: getMeasurementById,
  progressBaseline: listProjectProgressBaseline,
  progressActual: listProjectProgressSnapshots,
};

function takeRecent<T extends { createdAt: string; id: string }>(records: readonly T[], max: number): T[] {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, max);
}

function questionDatasets(question: string): Set<string> {
  const text = question.toLowerCase();
  const selected = new Set<string>(["project"]);
  if (/measurement|actual|field|quantity|evidence/.test(text)) selected.add("measurements");
  if (/evidence|field note|photo/.test(text)) selected.add("evidence");
  if (/variance|delta|difference|cost|schedule|labor/.test(text)) selected.add("deltas");
  if (/activity|recent|happened|update/.test(text)) selected.add("activity");
  if (/plan|item|scope|attention|work/.test(text)) selected.add("planItems");
  if (/work package|package|assignment/.test(text)) selected.add("workPackages");
  if (selected.size === 1) { selected.add("planItems"); selected.add("workPackages"); }
  return selected;
}

function ref(kind: KeplerReferenceKind, canonicalId: string, label: string): KeplerReference {
  return { kind, canonicalId, label: label.trim().slice(0, 160) || "Project record" };
}

/** Builds bounded, server-authorized context; all source records are reduced before serialization. */
export async function buildKeplerProjectContext(input: {
  access: ProjectAccessContext;
  question: string;
  repositories?: Partial<KeplerContextRepositories>;
}): Promise<KeplerProjectContext> {
  const repositories = { ...defaultRepositories, ...input.repositories };
  const { project, accessMode } = input.access;
  const selected = questionDatasets(input.question);
  const [rawPlans, rawPackages, rawMeasurements, rawDeltas, rawEvidence, rawActivity] = await Promise.all([
    selected.has("planItems") || selected.has("workPackages") || selected.has("measurements") || selected.has("deltas") || selected.has("evidence") ? repositories.plans(project.id) : Promise.resolve([]),
    selected.has("workPackages") ? repositories.workPackages(project.id) : Promise.resolve([]),
    selected.has("measurements") || selected.has("evidence") ? repositories.measurements(project.id) : Promise.resolve([]),
    selected.has("deltas") || selected.has("evidence") ? repositories.deltas(project.id) : Promise.resolve([]),
    selected.has("evidence") ? repositories.evidence(project.id) : Promise.resolve([]),
    selected.has("activity") ? repositories.activity(project.id) : Promise.resolve([]),
  ]);
  const plans = filterPlanItemsForAccess(rawPlans.filter((x) => x.projectId === project.id), input.access).sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id)).slice(0, KEPLER_CONTEXT_LIMITS.planItems);
  const planIdSet = new Set(plans.map((x) => x.id));
  const packages = filterWorkPackagesForAccess(rawPackages.filter((x) => x.projectId === project.id), input.access).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)).slice(0, KEPLER_CONTEXT_LIMITS.workPackages);
  const measurements = takeRecent(filterMeasurementsForAccess(rawMeasurements.filter((x) => x.projectId === project.id), input.access).filter((x) => planIdSet.has(x.planItemId) || !selected.has("planItems")), KEPLER_CONTEXT_LIMITS.measurements);
  const measurementIds = new Set(measurements.map((x) => x.id));
  const deltas = takeRecent(filterDeltasForAccess(rawDeltas.filter((x) => x.projectId === project.id), input.access).filter((x) => planIdSet.has(x.planItemId) || !selected.has("planItems")), KEPLER_CONTEXT_LIMITS.deltas);
  const allowedEvidence = filterEvidenceForAccess(rawEvidence, measurements, deltas, input.access);
  const evidence = takeRecent(allowedEvidence.filter((x) => x.projectId === project.id), KEPLER_CONTEXT_LIMITS.evidence);
  let ownMeasurementIds = new Set<string>();
  if (accessMode === "assigned_scope") {
    const candidates = rawActivity.filter((item) => item.type === "measurement_accepted" || item.type === "measurement_rejected");
    const own = await Promise.all(candidates.map((item) => repositories.measurementById(item.subjectId)));
    ownMeasurementIds = new Set(own.filter((item): item is Measurement => !!item && item.projectId === project.id && item.capturedByUid === input.access.currentUserId).map((item) => item.id));
  }
  const activity = takeRecent(filterActivityEventsForAccess(rawActivity.filter((x) => x.projectId === project.id), input.access, { currentUserMeasurementIds: ownMeasurementIds }), KEPLER_CONTEXT_LIMITS.activity);
  let progress: KeplerProjectContext["progress"];
  if (accessMode === "full" && /progress|planned|actual|baseline/.test(input.question.toLowerCase())) {
    const [baseline, actual] = await Promise.all([repositories.progressBaseline(project.id), repositories.progressActual(project.id)]);
    progress = { baseline: baseline.slice(-20), actual: actual.slice(-20) };
    selected.add("progress");
  }

  const references: KeplerReference[] = [ref("project", project.id, project.name)];
  for (const item of plans) references.push(ref("plan_item", item.id, item.label));
  for (const item of packages) references.push(ref("work_package", item.id, item.name));
  for (const item of measurements) references.push(ref("measurement", item.id, item.label));
  for (const item of deltas) references.push(ref("delta", item.id, plans.find((p)=>p.id===item.planItemId)?.label ?? "Recorded variance"));
  for (const item of activity) references.push(ref("activity", item.id, item.type.replaceAll("_", " ")));

  return {
    project: { id: project.id, name: project.name, location: project.location, status: project.status },
    datasets: [...selected],
    planItems: plans.map(({id,label,type,plannedValue,unit})=>({id,label,type,plannedValue,unit})),
    workPackages: packages.map(({id,name,status,planItemIds})=>({id,name,status,planItemIds:planItemIds.filter((itemId)=>planIdSet.has(itemId))})),
    measurements: measurements.map(({id,planItemId,label,value,unit,createdAt,reviewStatus})=>({id,planItemId,label,value,unit,createdAt,reviewStatus:reviewStatus ?? "accepted"})),
    deltas: deltas.map(({id,planItemId,measurementId,plannedValue,actualValue,difference,percentDifference,unit,costImpact,scheduleImpactDays,laborImpactHours,status,createdAt})=>({id,planItemId,measurementId: measurementIds.has(measurementId) ? measurementId : "",plannedValue,actualValue,difference,percentDifference,unit,costImpact,scheduleImpactDays,laborImpactHours,status,createdAt})),
    evidence: evidence.map(({id,type,note,createdAt,localMeasurementId,localDeltaId})=>({id,type,note:note.slice(0,500),createdAt,...(localMeasurementId ? { measurementId: measurements.find((m)=>m.localMeasurementId===localMeasurementId)?.id } : {}),...(localDeltaId ? { deltaId: deltas.find((d)=>d.localDeltaId===localDeltaId)?.id } : {})})),
    activity: activity.map(({id,type,createdAt,subjectType})=>({id,type,createdAt,subjectType})),
    ...(progress ? { progress: {
      baseline: progress.baseline.slice(-20).map((item) => ({ effectiveDate: item.effectiveDate, plannedPercent: item.plannedPercent })),
      actual: progress.actual.slice(-20).map((item) => ({ capturedAt: item.capturedAt, actualPercent: item.actualPercent, source: item.source })),
    } } : {}),
    allowedReferences: references,
  };
}
