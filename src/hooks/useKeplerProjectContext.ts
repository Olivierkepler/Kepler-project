import { useCallback, useEffect, useState } from "react";
import { getRemoteProjectActivity } from "../services/api/activity";
import { getRemoteDeltasForProject } from "../services/api/deltas";
import { getProjectProgress } from "../services/api/projectProgress";
import { getRemoteProjectMembers } from "../services/api/projects";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import { getDeltasForProject } from "../store/deltas";
import { getEvidenceForProject } from "../store/evidence";
import { getMeasurementsForProject } from "../store/measurements";
import { getPlanItemsForProject } from "../store/planItems";
import { getProjectById } from "../store/projects";
import { getSavedFieldReportsForProject } from "../store/savedFieldReports";
import { getWorkPackageAssignmentsForProject } from "../store/workPackageAssignments";
import { getWorkPackagesForProject } from "../store/workPackages";
import type { Project } from "../types/project";
import type { ProjectActivityItem } from "../utils/domain/projectActivity";
import { buildProjectActivity } from "../utils/domain/projectActivity";
import { formatActivityActorLabel, formatCloudActivitySubtitle, formatCloudActivityTitle } from "../utils/domain/activityPresentation";
import { summarizeProjectProgress } from "../utils/domain/projectProgressSummary";
import { deriveProjectTodos, type ProjectTodoItem } from "../utils/domain/projectTodos";
import { rankCurrentProjectVariances } from "../utils/domain/projectVarianceRanking";
import { getRemoteMeasurementsForProject } from "../services/api/measurements";
import { getPlanItemCloudMappingsForProject } from "../store/planItemCloudMappings";
import { getRemoteWorkPackageId } from "../store/workPackageCloudMappings";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { listTeamWorkPackageAssignments } from "../services/api/teamWorkPackageAssignments";
import { listTeams } from "../services/api/teams";
import type { RankedProjectVariance } from "../utils/domain/projectVarianceRanking";
import type { ProjectProgressSummary } from "../utils/domain/projectProgressSummary";
import type { KeplerActivityFact } from "../utils/domain/keplerProjectAnswers";

export type KeplerProjectContext = {
  project: Project;
  todos: ProjectTodoItem[];
  progress: ProjectProgressSummary | null;
  progressAvailable: boolean;
  variances: RankedProjectVariance[];
  varianceAvailable: boolean;
  varianceLabels: Map<string, string>;
  activity: KeplerActivityFact[];
};

type LoadState = {
  scopeKey: string | null;
  loading: boolean;
  error: boolean;
  context: KeplerProjectContext | null;
};

function localActivityFacts(items: ProjectActivityItem[]): KeplerActivityFact[] {
  return items.map((item) => {
    if (item.kind === "measurement") return { id: item.id, occurredAt: item.occurredAt, label: `Measurement recorded: ${item.label}` };
    if (item.kind === "delta") return { id: item.id, occurredAt: item.occurredAt, label: `Variance recorded: ${item.label}` };
    if (item.kind === "evidence") return { id: item.id, occurredAt: item.occurredAt, label: `Evidence added: ${item.relatedLabel}` };
    return { id: item.id, occurredAt: item.occurredAt, label: `Field report saved: ${item.periodLabel}` };
  });
}

async function loadContext(ownerUid: string, projectId: string): Promise<KeplerProjectContext> {
  const [project, planItems, measurements, deltas, evidence, savedReports, workPackages, memberAssignments, remoteProjectId] = await Promise.all([
    getProjectById(ownerUid, projectId),
    getPlanItemsForProject(ownerUid, projectId),
    getMeasurementsForProject(ownerUid, projectId),
    getDeltasForProject(ownerUid, projectId),
    getEvidenceForProject(ownerUid, projectId),
    getSavedFieldReportsForProject(ownerUid, projectId),
    getWorkPackagesForProject(ownerUid, projectId),
    getWorkPackageAssignmentsForProject(ownerUid, projectId),
    getRemoteProjectId(ownerUid, projectId),
  ]);
  if (!project) throw new Error("Project is unavailable.");

  let teamAssignments: Awaited<ReturnType<typeof listTeamWorkPackageAssignments>> = [];
  let assignmentDataComplete = !remoteProjectId;
  const remoteTeamNames = new Map<string, string>();
  if (remoteProjectId) {
    const [remoteTeams, remoteTeamAssignments] = await Promise.all([
      listTeams(remoteProjectId),
      listTeamWorkPackageAssignments(remoteProjectId),
    ]);
    const activeTeamIds = new Set(remoteTeams.filter((team) => team.status === "active").map((team) => team.id));
    for (const team of remoteTeams) remoteTeamNames.set(team.id, team.name);
    const remoteToLocalPackageIds = new Map<string, string>();
    await Promise.all(workPackages.map(async (workPackage) => {
      const remoteId = await getRemoteWorkPackageId(ownerUid, projectId, workPackage.id);
      if (remoteId) remoteToLocalPackageIds.set(remoteId, workPackage.id);
    }));
    teamAssignments = remoteTeamAssignments.flatMap((assignment) => {
      const localWorkPackageId = remoteToLocalPackageIds.get(assignment.workPackageId);
      return localWorkPackageId && activeTeamIds.has(assignment.teamId)
        ? [{ ...assignment, workPackageId: localWorkPackageId }]
        : [];
    });
    assignmentDataComplete = true;
  }

  const todos = deriveProjectTodos({
    planItems,
    workPackages,
    memberAssignments,
    teamAssignments,
    measurements,
    assignmentDataComplete,
    canManageAssignments: true,
    canReviewMeasurements: true,
  });
  const activityLocal = buildProjectActivity({ projectId, measurements, deltas, evidence, planItems, savedReports });

  if (!remoteProjectId) {
    return {
      project,
      todos,
      progress: null,
      progressAvailable: false,
      variances: [],
      varianceAvailable: false,
      varianceLabels: new Map(),
      activity: localActivityFacts(activityLocal),
    };
  }

  const [progressSeries, remoteMeasurements, remoteDeltas, mappings, activityPage, remotePackages, remoteMembers] = await Promise.all([
    getProjectProgress(remoteProjectId),
    getRemoteMeasurementsForProject(remoteProjectId),
    getRemoteDeltasForProject(remoteProjectId),
    getPlanItemCloudMappingsForProject(ownerUid, projectId),
    getRemoteProjectActivity(remoteProjectId, { limit: 30 }),
    getRemoteWorkPackagesForProject(remoteProjectId),
    getRemoteProjectMembers(remoteProjectId),
  ]);
  const remotePlanItemToLocal = new Map(mappings.map((item) => [item.remotePlanItemId, item.localPlanItemId]));
  const planItemById = new Map(planItems.map((item) => [item.id, item]));
  const packageNames = new Map(remotePackages.map((item) => [item.id, item.name]));
  const memberNameByMemberId = new Map(remoteMembers.map((item) => [item.id, item.displayName?.trim() || item.email?.trim() || "Project member"]));
  const memberNameByUserId = new Map(remoteMembers.map((item) => [item.userId, item.displayName?.trim() || item.email?.trim() || "Project member"]));
  const varianceLabels = new Map<string, string>();
  for (const measurement of remoteMeasurements) {
    const localId = remotePlanItemToLocal.get(measurement.planItemId);
    if (localId) {
      const label = planItemById.get(localId)?.label;
      if (label) varianceLabels.set(measurement.planItemId, label);
    }
  }
  const variances = rankCurrentProjectVariances(remoteMeasurements, remoteDeltas);
  const cloudActivity = activityPage.items.map((event) => {
    const title = formatCloudActivityTitle(event.type);
    const localPlanItemId = event.related.planItemId
      ? remotePlanItemToLocal.get(event.related.planItemId)
      : undefined;
    const resolvedPlanItemLabel = localPlanItemId ? planItemById.get(localPlanItemId)?.label : undefined;
    const subtitle = formatCloudActivitySubtitle(event, {
      ...(event.related.workPackageId ? { workPackageName: packageNames.get(event.related.workPackageId) } : {}),
      ...(resolvedPlanItemLabel ? { planItemLabel: resolvedPlanItemLabel } : {}),
      ...(event.related.teamId
        ? { assignmentTargetName: remoteTeamNames.get(event.related.teamId) }
        : event.related.projectMemberId
          ? { assignmentTargetName: memberNameByMemberId.get(event.related.projectMemberId) }
          : {}),
    });
    return {
      id: event.id,
      occurredAt: event.createdAt,
      label: `${event.actorType === "human"
        ? memberNameByUserId.get(event.actorUid ?? "") ?? "Project member"
        : formatActivityActorLabel(event.actorType)} ${title.toLowerCase()}${subtitle ? ` · ${subtitle}` : ""}`,
    };
  });

  return {
    project,
    todos,
    progress: summarizeProjectProgress(progressSeries),
    progressAvailable: true,
    variances,
    varianceAvailable: true,
    varianceLabels,
    activity: cloudActivity,
  };
}

export function useKeplerProjectContext(ownerUid: string | undefined, projectId: string | undefined) {
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<LoadState>({ scopeKey: null, loading: false, error: false, context: null });
  const scopeKey = ownerUid && projectId ? `${ownerUid}:${projectId}` : null;

  useEffect(() => {
    if (!ownerUid || !projectId) {
      setState({ scopeKey: null, loading: false, error: false, context: null });
      return;
    }
    let active = true;
    const requestedScopeKey = `${ownerUid}:${projectId}`;
    setState({ scopeKey: requestedScopeKey, loading: true, error: false, context: null });
    void loadContext(ownerUid, projectId)
      .then((context) => { if (active) setState({ scopeKey: requestedScopeKey, loading: false, error: false, context }); })
      .catch(() => { if (active) setState({ scopeKey: requestedScopeKey, loading: false, error: true, context: null }); });
    return () => { active = false; };
  }, [ownerUid, projectId, retryToken]);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  const stateMatches = state.scopeKey === scopeKey;
  return {
    loading: Boolean(scopeKey) && (!stateMatches || state.loading),
    error: stateMatches && state.error,
    context: stateMatches ? state.context : null,
    retry,
  };
}
