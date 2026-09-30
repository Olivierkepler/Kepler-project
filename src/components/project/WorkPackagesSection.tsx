import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  getRemoteWorkPackageAssignmentsForProject,
  updateRemoteWorkPackageAssignment,
  type RemoteWorkPackageAssignment,
} from "../../services/api/workPackageAssignments";
import { assignTeamToWorkPackage as assignRemoteTeam, listTeamWorkPackageAssignments, removeTeamFromWorkPackage } from "../../services/api/teamWorkPackageAssignments";
import { listTeams, listTeamMembers } from "../../services/api/teams";
import {
  getRemoteWorkPackagesForProject,
  type RemoteWorkPackage,
} from "../../services/api/workPackages";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getRemoteWorkPackageId } from "../../store/workPackageCloudMappings";
import { getProjectMembersForProject } from "../../store/projectMembers";
import { getRemoteProjectMembers } from "../../services/api/projects";
import {
  addWorkPackageAssignmentIfAbsent,
  createLocalWorkPackageAssignmentId,
  getWorkPackageAssignmentsForProject,
  removeWorkPackageAssignment,
  updateWorkPackageAssignment,
} from "../../store/workPackageAssignments";
import {
  addWorkPackageIfAbsent,
  createLocalWorkPackageId,
  getWorkPackagesForProject,
  removeWorkPackage,
  updateWorkPackage,
} from "../../store/workPackages";
import {
  publishWorkPackageToCloud,
  resolveCloudProjectMemberId,
} from "../../services/sync/workPackageCloudPublish";
import { colors, typography } from "../../theme/colors";
import type {
  ProjectMember,
  ProjectMemberRole,
} from "../../types/projectMember";
import type { WorkPackage, WorkPackageStatus } from "../../types/workPackage";
import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";
import type { Team } from "../../types/team";
import type {
  WorkPackageAssignment,
  WorkPackageAssignmentStatus,
} from "../../types/workPackageAssignment";
import {
  createRemoteProjectMemberId,
  formatAssignmentProgressStatusLabel,
  getMemberProgressAction,
} from "../../utils/assignmentProgress";
import { formatAssignmentStatusPresentation } from "../../utils/domain/statusPresentation";
import AssignmentProgressActions from "./AssignmentProgressActions";
import {
  type MemberPresentationContext,
} from "../../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../../utils/domain/memberPresentationContext";
import WorkPackageAssignmentsModal, {
  formatAssignmentStatusLabel,
  resolveAssignmentMemberDisplay,
  type AssignmentView,
  type TeamAssignmentOption,
  type TeamAssignmentView,
} from "./WorkPackageAssignmentsModal";
import WorkPackageEditorModal, {
  formatWorkPackageStatusLabel,
  type WorkPackageFormValues,
  type WorkPackagePlanItemOption,
} from "./WorkPackageEditorModal";

type WorkPackageView = {
  id: string;
  name: string;
  description?: string;
  status: WorkPackageStatus;
  planItemIds: string[];
};

type Props = {
  /**
   * Local: AsyncStorage project id + ownerUid store.
   * Remote: canonical cloud project id (shared / cloud reads).
   */
  mode: "local" | "remote";
  projectId: string;
  /** Required when mode === "local". */
  ownerUid?: string;
  /** Owner mutation controls. Always false for shared collaborators. */
  canMutate: boolean;
  planItems: WorkPackagePlanItemOption[];
  /**
   * Presentation-only shared membership role (Phase 2H.2).
   * Not a security boundary — used for empty-state / roster UX only.
   */
  membershipRole?: ProjectMemberRole;
  /**
   * Authenticated Firebase UID — used to match the collaborator's own
   * remote assignment for Phase 2K.2 self-service progress.
   */
  currentUserId?: string;
};

function isAssignedScopeRole(role: ProjectMemberRole | undefined): boolean {
  return role === "contractor" || role === "field_member";
}

function toViewFromLocal(item: WorkPackage): WorkPackageView {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: item.status,
    planItemIds: [...item.planItemIds],
  };
}

function toViewFromRemote(item: RemoteWorkPackage): WorkPackageView {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: item.status,
    planItemIds: [...item.planItemIds],
  };
}

function toAssignmentView(
  item: WorkPackageAssignment | RemoteWorkPackageAssignment,
): AssignmentView {
  return {
    id: item.id,
    workPackageId: item.workPackageId,
    projectMemberId: item.projectMemberId,
    status: item.status,
  };
}

function planItemCountLabel(count: number): string {
  return `${count} plan item${count === 1 ? "" : "s"}`;
}

function toTeamAssignmentView(item: TeamWorkPackageAssignment): TeamAssignmentView {
  return { id: item.id, workPackageId: item.workPackageId, teamId: item.teamId, status: item.status };
}

export default function WorkPackagesSection({
  mode,
  projectId,
  ownerUid,
  canMutate,
  planItems,
  membershipRole,
  currentUserId,
}: Props) {
  const [items, setItems] = useState<WorkPackageView[]>([]);
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignmentView[]>([]);
  const [assignmentTeams, setAssignmentTeams] = useState<TeamAssignmentOption[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [presentationContext, setPresentationContext] =
    useState<MemberPresentationContext>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"unavailable" | "network" | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<WorkPackageView | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignmentTarget, setAssignmentTarget] =
    useState<WorkPackageView | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [progressMutatingId, setProgressMutatingId] = useState<string | null>(
    null,
  );

  // Viewer assignment roster is intentionally private (backend returns []).
  // Hide roster UI so empty arrays are not shown as "no one assigned."
  const showAssignmentRoster = membershipRole !== "viewer";
  const assignedScopeEmptyCopy = isAssignedScopeRole(membershipRole);
  const canSelfProgress =
    mode === "remote" &&
    isAssignedScopeRole(membershipRole) &&
    !!currentUserId?.trim();

  const ownProjectMemberId =
    canSelfProgress && currentUserId
      ? createRemoteProjectMemberId(projectId, currentUserId)
      : null;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (mode === "local") {
        if (!ownerUid?.trim()) {
          setItems([]);
          setAssignments([]);
          setTeamAssignments([]);
          setAssignmentTeams([]);
          setMembers([]);
          setError("unavailable");
          return;
        }

        const [localItems, localAssignments, localMembers, remoteProjectId] =
          await Promise.all([
            getWorkPackagesForProject(ownerUid, projectId),
            getWorkPackageAssignmentsForProject(ownerUid, projectId),
            getProjectMembersForProject(ownerUid, projectId),
            getRemoteProjectId(ownerUid, projectId),
          ]);

        let mergedMembers = localMembers;

        if (remoteProjectId) {
          try {
            const remoteMembers = await getRemoteProjectMembers(remoteProjectId);
            const byId = new Map(
              localMembers.map((member) => [member.id, member] as const),
            );
            for (const member of remoteMembers) {
              byId.set(member.id, {
                id: member.id,
                projectId,
                userId: member.userId,
                role: member.role,
                status: member.status,
                invitedBy: member.invitedBy,
                createdAt: member.createdAt,
                updatedAt: member.updatedAt,
              });
            }
            mergedMembers = [...byId.values()];
          } catch {
            mergedMembers = localMembers;
          }
        }

        setItems(localItems.map(toViewFromLocal));
        setAssignments(localAssignments.map(toAssignmentView));
        setMembers(mergedMembers);
        if (remoteProjectId) {
          try {
            const [remoteTeams, teamAssignmentsFromCloud] = await Promise.all([
              listTeams(remoteProjectId),
              listTeamWorkPackageAssignments(remoteProjectId),
            ]);
            const options = await Promise.all(remoteTeams.filter((team) => team.status === "active").map(async (team) => ({
              team,
              memberCount: (await listTeamMembers(remoteProjectId, team.id)).filter((membership) => membership.status === "active").length,
            })));
            setAssignmentTeams(options);
            const remoteToLocal = new Map<string, string>();
            if (ownerUid) {
              for (const localItem of localItems) {
                const remoteId = await getRemoteWorkPackageId(ownerUid, projectId, localItem.id);
                if (remoteId) remoteToLocal.set(remoteId, localItem.id);
              }
            }
            setTeamAssignments(teamAssignmentsFromCloud
              .filter((assignment) => remoteToLocal.has(assignment.workPackageId))
              .map((assignment) => ({ ...toTeamAssignmentView(assignment), workPackageId: remoteToLocal.get(assignment.workPackageId)! })));
          } catch {
            setAssignmentTeams([]);
            setTeamAssignments([]);
          }
        } else {
          setAssignmentTeams([]);
          setTeamAssignments([]);
        }
        setPresentationContext(
          await fetchMemberPresentationContext({
            members: mergedMembers,
          }),
        );
        return;
      }

      // Shared / remote: assignments from cloud. Member admin API is
      // owner-only, so display falls back to projectMemberId identity.
      const [remoteItems, remoteAssignments] = await Promise.all([
        getRemoteWorkPackagesForProject(projectId),
        getRemoteWorkPackageAssignmentsForProject(projectId),
      ]);

      setItems(remoteItems.map(toViewFromRemote));
      setAssignments(remoteAssignments.map(toAssignmentView));
      try {
        const [remoteTeams, teamAssignmentsFromCloud] = await Promise.all([
          listTeams(projectId), listTeamWorkPackageAssignments(projectId),
        ]);
        const options = await Promise.all(remoteTeams.filter((team) => team.status === "active").map(async (team) => ({
          team,
          memberCount: (await listTeamMembers(projectId, team.id)).filter((membership) => membership.status === "active").length,
        })));
        setAssignmentTeams(options);
        setTeamAssignments(teamAssignmentsFromCloud.map(toTeamAssignmentView));
      } catch {
        setAssignmentTeams([]);
        setTeamAssignments([]);
      }
      setMembers([]);
      setPresentationContext(
        await fetchMemberPresentationContext({
          projectId,
          projectMemberIds: remoteAssignments.map(
            (item) => item.projectMemberId,
          ),
        }),
      );
    } catch (loadError) {
      setItems([]);
      setAssignments([]);
      setTeamAssignments([]);
      setAssignmentTeams([]);
      setMembers([]);

      if (
        loadError instanceof Error &&
        (loadError.message === "Project not found." ||
          loadError.message === "This shared project is no longer available.")
      ) {
        setError("unavailable");
      } else {
        setError("network");
      }
    } finally {
      setLoading(false);
    }
  }, [mode, ownerUid, projectId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        if (!active) {
          return;
        }
        await reload();
      })();

      return () => {
        active = false;
      };
    }, [reload, retryToken]),
  );

  const assignmentsByWorkPackage = useMemo(() => {
    const map = new Map<string, AssignmentView[]>();
    for (const assignment of assignments) {
      const list = map.get(assignment.workPackageId) ?? [];
      list.push(assignment);
      map.set(assignment.workPackageId, list);
    }
    return map;
  }, [assignments]);

  const ownWorkEntries = useMemo(() => {
    if (!canSelfProgress || !ownProjectMemberId) {
      return [] as Array<{
        workPackage: WorkPackageView;
        assignment: AssignmentView;
      }>;
    }

    const entries: Array<{
      workPackage: WorkPackageView;
      assignment: AssignmentView;
    }> = [];

    for (const item of items) {
      const own = (assignmentsByWorkPackage.get(item.id) ?? []).find(
        (assignment) =>
          assignment.projectMemberId === ownProjectMemberId &&
          assignment.status !== "cancelled",
      );
      if (own) {
        entries.push({ workPackage: item, assignment: own });
      }
    }

    return entries;
  }, [
    assignmentsByWorkPackage,
    canSelfProgress,
    items,
    ownProjectMemberId,
  ]);

  const displayItems = useMemo(() => {
    if (ownWorkEntries.length === 0) {
      return items;
    }

    const prioritized = new Set(
      ownWorkEntries.map((entry) => entry.workPackage.id),
    );
    return [...items].sort((a, b) => {
      const aOwn = prioritized.has(a.id);
      const bOwn = prioritized.has(b.id);
      if (aOwn && !bOwn) {
        return -1;
      }
      if (!aOwn && bOwn) {
        return 1;
      }
      return 0;
    });
  }, [items, ownWorkEntries]);

  const activeMemberCount = useMemo(
    () => members.filter((member) => member.status === "active").length,
    [members],
  );

  const openCreate = () => {
    setEditorMode("create");
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (item: WorkPackageView) => {
    if (!canMutate) {
      return;
    }

    setEditorMode("edit");
    setEditing(item);
    setEditorOpen(true);
  };

  const openAssignments = (item: WorkPackageView) => {
    if (!showAssignmentRoster) {
      return;
    }
    setAssignmentTarget(item);
  };

  const publishLocalWorkPackageToCloud = async (
    workPackage: WorkPackageView,
    desiredLocalMemberIds: readonly string[],
  ) => {
    if (!ownerUid?.trim()) {
      return;
    }

    const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);
    const desiredCloudProjectMemberIds = remoteProjectId
      ? desiredLocalMemberIds.map((memberId) => {
          const member = members.find((item) => item.id === memberId);
          return resolveCloudProjectMemberId({
            selectedMemberId: memberId,
            remoteProjectId,
            memberUserId: member?.userId ?? null,
          });
        })
      : [...desiredLocalMemberIds];

    const publishResult = await publishWorkPackageToCloud({
      ownerUid,
      localProjectId: projectId,
      localWorkPackage: {
        id: workPackage.id,
        name: workPackage.name,
        description: workPackage.description,
        status: workPackage.status,
        planItemIds: workPackage.planItemIds,
      },
      desiredCloudProjectMemberIds,
    });

    if (!publishResult.ok) {
      Alert.alert(
        "Saved locally",
        `Cloud collaboration sync failed: ${publishResult.error}. Field members will not see this assignment until sync succeeds.`,
      );
    }
  };

  const handleSubmit = async (values: WorkPackageFormValues) => {
    if (!canMutate || saving) {
      return;
    }

    if (mode !== "local" || !ownerUid?.trim()) {
      Alert.alert(
        "Unable to save",
        "Work packages for shared projects are read-only.",
      );
      return;
    }

    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const description = values.description.trim();
      let savedPackage: WorkPackageView | null = null;

      if (editorMode === "create") {
        const workPackage: WorkPackage = {
          id: createLocalWorkPackageId(),
          projectId,
          name: values.name,
          ...(description.length > 0 ? { description } : {}),
          status: values.status,
          planItemIds: values.planItemIds,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const created = await addWorkPackageIfAbsent(ownerUid, workPackage);

        if (!created) {
          throw new Error("Unable to create work package.");
        }

        savedPackage = workPackage;
      } else if (editing) {
        const updated = await updateWorkPackage(ownerUid, editing.id, {
          name: values.name,
          description: values.description,
          status: values.status,
          planItemIds: values.planItemIds,
        });

        if (!updated) {
          throw new Error("Work package not found.");
        }

        savedPackage = updated;
      }

      if (savedPackage) {
        const existingMemberIds = (
          assignmentsByWorkPackage.get(savedPackage.id) ?? []
        )
          .filter((assignment) => assignment.status !== "cancelled")
          .map((assignment) => assignment.projectMemberId);

        await publishLocalWorkPackageToCloud(savedPackage, existingMemberIds);
      }

      setEditorOpen(false);
      setEditing(null);
      await reload();
    } catch (submitError) {
      Alert.alert(
        "Unable to save",
        submitError instanceof Error
          ? submitError.message
          : "Unable to save work package.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item: WorkPackageView) => {
    if (!canMutate || mode !== "local" || !ownerUid?.trim()) {
      return;
    }

    Alert.alert(
      "Delete this work package?",
      "Plan items linked to this work package will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await removeWorkPackage(ownerUid, item.id);
                await reload();
              } catch (deleteError) {
                Alert.alert(
                  "Unable to delete",
                  deleteError instanceof Error
                    ? deleteError.message
                    : "Unable to delete work package.",
                );
              }
            })();
          },
        },
      ],
    );
  };

  const handleAssign = async (projectMemberId: string) => {
    if (
      !canMutate ||
      assignmentSaving ||
      !assignmentTarget ||
      mode !== "local" ||
      !ownerUid?.trim()
    ) {
      return;
    }

    setAssignmentSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const assignment: WorkPackageAssignment = {
        id: createLocalWorkPackageAssignmentId(),
        projectId,
        workPackageId: assignmentTarget.id,
        projectMemberId,
        status: "assigned",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const created = await addWorkPackageAssignmentIfAbsent(
        ownerUid,
        assignment,
      );

      if (!created) {
        throw new Error(
          "That member is already assigned to this work package.",
        );
      }

      const desiredMemberIds = [
        ...(assignmentsByWorkPackage.get(assignmentTarget.id) ?? [])
          .filter((item) => item.status !== "cancelled")
          .map((item) => item.projectMemberId),
        projectMemberId,
      ];

      await publishLocalWorkPackageToCloud(assignmentTarget, [
        ...new Set(desiredMemberIds),
      ]);

      await reload();
    } catch (assignError) {
      Alert.alert(
        "Unable to assign",
        assignError instanceof Error
          ? assignError.message
          : "Unable to assign member.",
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleAssignTeam = async (teamId: string) => {
    if (!canMutate || assignmentSaving || mode !== "local" || !ownerUid?.trim() || !assignmentTarget) return;
    setAssignmentSaving(true);
    try {
      const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);
      if (!remoteProjectId) throw new Error("Connect this project to cloud before assigning a Team.");
      const currentMemberIds = (assignmentsByWorkPackage.get(assignmentTarget.id) ?? [])
        .filter((item) => item.status !== "cancelled").map((item) => item.projectMemberId);
      await publishLocalWorkPackageToCloud(assignmentTarget, currentMemberIds);
      const remoteWorkPackageId = await getRemoteWorkPackageId(ownerUid, projectId, assignmentTarget.id);
      if (!remoteWorkPackageId) throw new Error("Work Package is not available in cloud yet.");
      await assignRemoteTeam(remoteProjectId, remoteWorkPackageId, teamId);
      await reload();
    } catch (error) {
      Alert.alert("Unable to assign Team", error instanceof Error ? error.message : "Team assignment could not be saved.");
    } finally { setAssignmentSaving(false); }
  };

  const handleRemoveTeam = async (teamId: string) => {
    if (!canMutate || assignmentSaving || mode !== "local" || !ownerUid?.trim() || !assignmentTarget) return;
    setAssignmentSaving(true);
    try {
      const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);
      const remoteWorkPackageId = await getRemoteWorkPackageId(ownerUid, projectId, assignmentTarget.id);
      if (!remoteProjectId || !remoteWorkPackageId) throw new Error("Team assignment is unavailable for this Work Package.");
      await removeTeamFromWorkPackage(remoteProjectId, remoteWorkPackageId, teamId);
      await reload();
    } catch (error) {
      Alert.alert("Unable to remove Team", error instanceof Error ? error.message : "Team assignment could not be removed.");
    } finally { setAssignmentSaving(false); }
  };

  const handleUpdateAssignmentStatus = async (
    assignmentId: string,
    status: WorkPackageAssignmentStatus,
  ) => {
    if (
      !canMutate ||
      assignmentSaving ||
      mode !== "local" ||
      !ownerUid?.trim()
    ) {
      return;
    }

    setAssignmentSaving(true);

    try {
      const updated = await updateWorkPackageAssignment(
        ownerUid,
        assignmentId,
        { status },
      );

      if (!updated) {
        throw new Error("Assignment not found.");
      }

      await reload();
    } catch (statusError) {
      Alert.alert(
        "Unable to update",
        statusError instanceof Error
          ? statusError.message
          : "Unable to update assignment.",
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (
      !canMutate ||
      assignmentSaving ||
      mode !== "local" ||
      !ownerUid?.trim()
    ) {
      return;
    }

    setAssignmentSaving(true);

    try {
      const removed = await removeWorkPackageAssignment(
        ownerUid,
        assignmentId,
      );

      if (!removed) {
        throw new Error("Assignment not found.");
      }

      if (assignmentTarget) {
        const desiredMemberIds = (
          assignmentsByWorkPackage.get(assignmentTarget.id) ?? []
        )
          .filter(
            (item) =>
              item.id !== assignmentId && item.status !== "cancelled",
          )
          .map((item) => item.projectMemberId);

        await publishLocalWorkPackageToCloud(
          assignmentTarget,
          desiredMemberIds,
        );
      }

      await reload();
    } catch (removeError) {
      Alert.alert(
        "Unable to remove",
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove assignment.",
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleMemberProgress = async (
    assignmentId: string,
    nextStatus: WorkPackageAssignmentStatus,
    note?: string,
  ) => {
    if (!canSelfProgress || progressMutatingId || mode !== "remote") {
      return;
    }

    setProgressMutatingId(assignmentId);

    try {
      await updateRemoteWorkPackageAssignment(projectId, assignmentId, {
        status: nextStatus,
        ...(note !== undefined ? { note } : {}),
      });
      await reload();
    } catch (progressError) {
      Alert.alert(
        "Unable to update progress",
        progressError instanceof Error
          ? progressError.message
          : "Unable to update assignment progress.",
      );
    } finally {
      setProgressMutatingId(null);
    }
  };

  const renderAssignmentSummary = (item: WorkPackageView) => {
    if (!showAssignmentRoster) {
      return null;
    }

    const packageAssignments = (
      assignmentsByWorkPackage.get(item.id) ?? []
    ).filter((assignment) => assignment.status !== "cancelled");
    const packageTeamAssignments = teamAssignments.filter((assignment) => assignment.workPackageId === item.id && assignment.status !== "cancelled");
    const visibleTeamAssignments = packageTeamAssignments.map((assignment) => ({
      assignment,
      team: assignmentTeams.find((option) => option.team.id === assignment.teamId)?.team,
    })).filter((entry): entry is { assignment: TeamAssignmentView; team: Team } => !!entry.team);

    const ownAssignment =
      ownProjectMemberId != null
        ? packageAssignments.find(
            (assignment) => assignment.projectMemberId === ownProjectMemberId,
          )
        : undefined;

    if (canSelfProgress && ownAssignment) {
      return (
        <View style={styles.yourAssignmentCard}>
          <Text style={styles.yourAssignmentLabel}>Your assignment</Text>
          <Text style={styles.yourAssignmentMeta}>
            {formatAssignmentStatusPresentation(ownAssignment.status)}
          </Text>
          {getMemberProgressAction(ownAssignment.status) == null &&
          ownAssignment.status === "ready_for_review" ? (
            <Text style={styles.yourAssignmentHint}>
              Waiting for owner review
            </Text>
          ) : null}
          <AssignmentProgressActions
            status={ownAssignment.status}
            mode="member"
            mutating={progressMutatingId === ownAssignment.id}
            onTransition={(nextStatus, note) => {
              void handleMemberProgress(ownAssignment.id, nextStatus, note);
            }}
          />
        </View>
      );
    }

    if (packageAssignments.length === 0 && visibleTeamAssignments.length === 0) {
      return (
        <Pressable
          onPress={() => openAssignments(item)}
          accessibilityRole="button"
          accessibilityLabel={
            canMutate
              ? `Assign members to ${item.name}`
              : `No one assigned to ${item.name}`
          }
          style={styles.assignmentSummary}
        >
          <Text style={styles.assignmentSummaryLabel}>Assigned</Text>
          <Text style={styles.assignmentSummaryEmpty}>
            {canMutate ? "No one assigned yet · Assign" : "No one assigned yet"}
          </Text>
        </Pressable>
      );
    }

    if (packageAssignments.length + visibleTeamAssignments.length > 2) {
      return (
        <Pressable
          onPress={() => openAssignments(item)}
          accessibilityRole="button"
          accessibilityLabel={`${packageAssignments.length} assigned to ${item.name}`}
          style={styles.assignmentSummary}
        >
          <Text style={styles.assignmentSummaryLabel}>Assigned</Text>
          <Text style={styles.assignmentSummaryMeta}>
            {packageAssignments.length + visibleTeamAssignments.length} assigned
          </Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={() => openAssignments(item)}
        accessibilityRole="button"
        accessibilityLabel={`Assigned team for ${item.name}`}
        style={styles.assignmentSummary}
      >
        <Text style={styles.assignmentSummaryLabel}>Assigned</Text>
        {packageAssignments.map((assignment) => {
          const display = resolveAssignmentMemberDisplay(
            projectId,
            assignment.projectMemberId,
            members,
            presentationContext,
          );
          return (
            <View key={assignment.id} style={styles.assignmentRow}>
              <View style={styles.miniAvatar}>
                <Text style={styles.miniAvatarText}>{display.initial}</Text>
              </View>
              <Text style={styles.assignmentRole} numberOfLines={1}>
                {display.roleLabel}
              </Text>
              <Text style={styles.assignmentStatus}>
                {formatAssignmentStatusLabel(assignment.status)}
              </Text>
            </View>
          );
        })}
        {visibleTeamAssignments.map(({ assignment, team }) => (
          <View key={assignment.id} style={styles.assignmentRow}>
            <View style={styles.teamMiniIcon}><Text style={styles.teamMiniIconText}>T</Text></View>
            <Text style={styles.assignmentRole} numberOfLines={1}>{team.name}</Text>
            <Text style={styles.assignmentStatus}>Team</Text>
          </View>
        ))}
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>WORK PACKAGES</Text>
        {canMutate ? (
          <Pressable
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="Add work package"
            hitSlop={8}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>+ Work Package</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator color={colors.brand.blue} />
          <Text style={styles.stateText}>Loading work packages…</Text>
        </View>
      ) : null}

      {!loading && error === "network" ? (
        <View style={styles.stateBlock}>
          <Text style={styles.errorText}>Unable to load work packages.</Text>
          <Pressable
            onPress={() => setRetryToken((value) => value + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading work packages"
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && error === "unavailable" ? (
        <Text style={styles.stateText}>
          Work packages are not available for this project.
        </Text>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {assignedScopeEmptyCopy
              ? "No work assigned yet"
              : "No work packages yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {canMutate
              ? "Organize this project into construction scopes."
              : assignedScopeEmptyCopy
                ? "No work has been assigned to you yet."
                : "The project owner has not added work packages yet."}
          </Text>
          {canMutate ? (
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Create first work package"
              style={styles.emptyCta}
            >
              <Text style={styles.emptyCtaText}>+ Work Package</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!loading && !error && ownWorkEntries.length > 0 ? (
        <View style={styles.yourWorkBanner}>
          <Text style={styles.yourWorkEyebrow}>YOUR WORK</Text>
          {ownWorkEntries.map(({ workPackage, assignment }) => {
            const next = getMemberProgressAction(assignment.status);
            return (
              <View key={assignment.id} style={styles.yourWorkRow}>
                <Text style={styles.yourWorkName} numberOfLines={2}>
                  {workPackage.name}
                </Text>
                <Text style={styles.yourWorkStatus}>
                  {formatAssignmentStatusPresentation(assignment.status)}
                </Text>
                <Text style={styles.yourWorkHint}>
                  {assignment.status === "ready_for_review"
                    ? "Waiting for owner review"
                    : next
                      ? `Next: ${next.label}`
                      : formatAssignmentProgressStatusLabel(assignment.status)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {!loading && !error
        ? displayItems.map((item) => (
            <View key={item.id} style={styles.card}>
              <Pressable
                onPress={() => openEdit(item)}
                disabled={!canMutate}
                accessibilityRole={canMutate ? "button" : "text"}
                accessibilityLabel={`${item.name}, ${formatWorkPackageStatusLabel(item.status)}, ${planItemCountLabel(item.planItemIds.length)}`}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardStatus}>
                    {formatWorkPackageStatusLabel(item.status)}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>
                  {planItemCountLabel(item.planItemIds.length)}
                </Text>
                {item.description ? (
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </Pressable>

              {showAssignmentRoster ? renderAssignmentSummary(item) : null}

              {canMutate ? (
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => openEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.name}`}
                    hitSlop={8}
                    style={styles.cardActionButton}
                  >
                    <Text style={styles.cardEditHint}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.name}`}
                    hitSlop={8}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        : null}

      {canMutate ? (
        <WorkPackageEditorModal
          visible={editorOpen}
          mode={editorMode}
          initial={
            editing
              ? {
                  name: editing.name,
                  description: editing.description ?? "",
                  status: editing.status,
                  planItemIds: editing.planItemIds,
                }
              : null
          }
          planItems={planItems}
          saving={saving}
          onClose={() => {
            if (!saving) {
              setEditorOpen(false);
              setEditing(null);
            }
          }}
          onSubmit={(values) => {
            void handleSubmit(values);
          }}
        />
      ) : null}

      {showAssignmentRoster && assignmentTarget ? (
        <WorkPackageAssignmentsModal
          visible
          workPackageName={assignmentTarget.name}
          projectId={projectId}
          assignments={(
            assignmentsByWorkPackage.get(assignmentTarget.id) ?? []
          ).filter((assignment) => assignment.status !== "cancelled")}
          teamAssignments={teamAssignments.filter((assignment) => assignment.workPackageId === assignmentTarget.id && assignment.status !== "cancelled")}
          teams={assignmentTeams}
          members={members}
          canMutate={canMutate && mode === "local"}
          noAssignableMembersAvailable={
            canMutate && mode === "local" && activeMemberCount === 0
          }
          saving={assignmentSaving}
          onClose={() => {
            if (!assignmentSaving) {
              setAssignmentTarget(null);
            }
          }}
          onAssign={(projectMemberId) => {
            void handleAssign(projectMemberId);
          }}
          onAssignTeam={(teamId) => { void handleAssignTeam(teamId); }}
          onRemoveTeam={(teamId) => { void handleRemoveTeam(teamId); }}
          onUpdateStatus={(assignmentId, status) => {
            void handleUpdateAssignmentStatus(assignmentId, status);
          }}
          onRemove={(assignmentId) => {
            void handleRemoveAssignment(assignmentId);
          }}
          presentationContext={presentationContext}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.text.primary,
  },
  addButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  addButtonText: {
    ...typography.button,
    color: colors.brand.blue,
  },
  stateBlock: {
    gap: 10,
    paddingVertical: 8,
  },
  stateText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    minHeight: 40,
    justifyContent: "center",
  },
  retryText: {
    ...typography.button,
    color: colors.text.primary,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
  },
  emptyTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  emptyBody: {
    ...typography.body,
    marginTop: 6,
    color: colors.text.secondary,
  },
  emptyCta: {
    marginTop: 14,
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  emptyCtaText: {
    ...typography.button,
    color: colors.brand.blue,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardName: {
    ...typography.bodyLarge,
    flex: 1,
    color: colors.text.primary,
  },
  cardStatus: {
    ...typography.caption,
    color: colors.brand.blue,
  },
  cardMeta: {
    ...typography.caption,
    marginTop: 8,
    color: colors.text.secondary,
  },
  cardDescription: {
    ...typography.body,
    marginTop: 6,
    color: colors.text.muted,
  },
  assignmentSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  yourAssignmentCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#D6EAF9",
    gap: 8,
    backgroundColor: "#F5FAFE",
    marginHorizontal: -4,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 12,
  },
  yourAssignmentLabel: {
    ...typography.caption,
    color: colors.brand.blue,
  },
  yourAssignmentMeta: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
  },
  yourAssignmentHint: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  yourWorkBanner: {
    backgroundColor: "#F5FAFE",
    borderWidth: 1,
    borderColor: "#D6EAF9",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  yourWorkEyebrow: {
    ...typography.caption,
    color: colors.brand.blue,
  },
  yourWorkRow: {
    gap: 4,
  },
  yourWorkName: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
  },
  yourWorkStatus: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
  },
  yourWorkHint: {
    ...typography.caption,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  assignmentSummaryLabel: {
    ...typography.metadata,
    color: colors.text.muted,
  },
  assignmentSummaryEmpty: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  assignmentSummaryMeta: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  assignmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EAF5FC",
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: {
    ...typography.metadata,
    color: colors.brand.blue,
  },
  assignmentRole: {
    ...typography.caption,
    flex: 1,
    color: colors.text.secondary,
  },
  assignmentStatus: {
    ...typography.caption,
    color: colors.brand.blue,
  },
  teamMiniIcon: { width: 24, height: 24, borderRadius: 7, backgroundColor: "rgba(1, 33, 105, 0.08)", alignItems: "center", justifyContent: "center" },
  teamMiniIconText: { ...typography.metadata, color: colors.brand.navy, fontWeight: "700" },
  cardActions: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardActionButton: {
    minHeight: 36,
    justifyContent: "center",
  },
  cardEditHint: {
    ...typography.caption,
    color: colors.text.muted,
  },
  deleteButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  deleteText: {
    ...typography.button,
    color: colors.danger,
  },
});
