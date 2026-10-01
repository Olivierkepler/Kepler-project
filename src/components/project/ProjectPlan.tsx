import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../../auth/AuthProvider";

import PlanItemCard from "./PlanItemCard";
import OrganizeWorkModal from "./OrganizeWorkModal";
import WorkPackageEditorModal, {
  type WorkPackageFormValues,
} from "./WorkPackageEditorModal";
import WorkPackageImage from "./WorkPackageImage";
import SharePlanItemSheet, {
  type SharePlanItemDestination,
} from "../chat/SharePlanItemSheet";

import {
  listProjectInvitations,
} from "../../services/api/invitations";

import {
  type UserPresentationRecord,
} from "../../utils/domain/memberDisplay";

import {
  fetchMemberPresentationContext,
} from "../../utils/domain/memberPresentationContext";

import {
  getDeltasForProject,
} from "../../store/deltas";

import {
  getMeasurementsForProject,
} from "../../store/measurements";

import {
  getPlanItemsForProject,
} from "../../store/planItems";

import {
  getProjectMembersForProject,
} from "../../store/projectMembers";

import {
  getProjectById,
} from "../../store/projects";

import {
  getRemoteProjectId,
} from "../../store/projectCloudMappings";
import { getRemoteWorkPackageId } from "../../store/workPackageCloudMappings";
import {
  deleteRemoteWorkPackageImage,
  getRemoteWorkPackagesForProject,
} from "../../services/api/workPackages";
import { uploadWorkPackageImage } from "../../services/workPackages/workPackageImage";

import {
  getWorkPackageAssignmentsForProject,
} from "../../store/workPackageAssignments";

import {
  getWorkPackagesForProject,
  updateWorkPackage,
} from "../../store/workPackages";

import {
  publishWorkPackageToCloud,
  resolveCloudProjectMemberId,
} from "../../services/sync/workPackageCloudPublish";

import {
  typography,
} from "../../theme/colors";

import type {
  Delta,
} from "../../types/delta";

import type {
  Measurement,
} from "../../types/measurement";

import type {
  PlanItem,
} from "../../types/plan";

import type {
  Project,
} from "../../types/project";

import type {
  ProjectMember,
} from "../../types/projectMember";

import type {
  WorkPackage,
} from "../../types/workPackage";

import type {
  WorkPackageAssignment,
} from "../../types/workPackageAssignment";

import {
  getLatestDeltaForPlanItem,
  getLatestMeasurementForPlanItem,
} from "../../utils/domain/planItemFieldContext";

import {
  buildPlanItemAssignmentMaps,
} from "../../utils/domain/planItemAssignmentContext";

import {
  buildPlanWorkPackageGroups,
  filterPlanItemsForListFilter,
} from "../../utils/domain/planWorkPackageGroups";
import PlanSearchFilterControls, {
  type PlanAssignmentFilter,
  type PlanStatusFilter,
} from "./PlanSearchFilterControls";
import { searchPlanWorkPackageGroups } from "../../utils/domain/planWorkPackageSearch";

import {
  resolveSharePlanItemDestination,
  SharePlanItemFlowError,
} from "../../utils/domain/sharePlanItemFlow";

import type { RootStackParamList } from "../../navigation/types";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";

/**
 * ProjectPlan lives in:
 *
 * src/components/project/
 *
 * so ../../../assets resolves to the project-level assets folder.
 */
const PROJECT_BACKGROUND =
  require("../../../assets/bgproject.png");

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function looksLikeInternalUserIdLabel(
  label: string,
): boolean {
  const trimmed = label.trim();

  if (!trimmed) {
    return true;
  }

  if (
    /^[A-Za-z0-9_-]{4,12}…[A-Za-z0-9_-]{4,10}$/.test(
      trimmed,
    )
  ) {
    return true;
  }

  if (
    trimmed.length >= 16 &&
    !trimmed.includes("@") &&
    !/\s/.test(trimmed) &&
    /^[A-Za-z0-9_-]+$/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function findUnassignedGroupKey(
  groups: readonly {
    key: string;
    workPackageId: string | null;
  }[],
): string | null {
  const unassigned = groups.find(
    (group) =>
      group.workPackageId === null,
  );

  return unassigned?.key ?? null;
}

async function attachWorkPackageImagePresentations(input: {
  ownerUid: string;
  localProjectId: string;
  workPackages: WorkPackage[];
}): Promise<WorkPackage[]> {
  try {
    const remoteProjectId = await getRemoteProjectId(
      input.ownerUid,
      input.localProjectId,
    );
    if (!remoteProjectId) return input.workPackages;
    const remotePackages = await getRemoteWorkPackagesForProject(remoteProjectId);
    const remoteById = new Map(remotePackages.map((item) => [item.id, item] as const));
    return await Promise.all(input.workPackages.map(async (workPackage) => {
      try {
        const remoteWorkPackageId = await getRemoteWorkPackageId(
          input.ownerUid,
          input.localProjectId,
          workPackage.id,
        );
        const remote = remoteWorkPackageId
          ? remoteById.get(remoteWorkPackageId)
          : undefined;
        return {
          ...workPackage,
          ...(remote?.imageUrl ? { imageUrl: remote.imageUrl } : {}),
        };
      } catch {
        return workPackage;
      }
    }));
  } catch {
    return input.workPackages;
  }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ProjectPlanProps = {
  projectId: string;

  onAddPlanItem: () => void;

  onOpenPlanItem: (
    planItemId: string,
  ) => void;
};

/* -------------------------------------------------------------------------- */
/* Project Plan                                                               */
/* -------------------------------------------------------------------------- */

export default function ProjectPlan({
  projectId,
  onAddPlanItem,
  onOpenPlanItem,
}: ProjectPlanProps) {
  const { user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [
    project,
    setProject,
  ] = useState<
    Project | null | undefined
  >(undefined);

  const [
    planItems,
    setPlanItems,
  ] = useState<PlanItem[]>([]);

  const [
    measurements,
    setMeasurements,
  ] = useState<Measurement[]>([]);

  const [
    deltas,
    setDeltas,
  ] = useState<Delta[]>([]);

  const [
    workPackages,
    setWorkPackages,
  ] = useState<WorkPackage[]>([]);

  const [
    assignments,
    setAssignments,
  ] = useState<
    WorkPackageAssignment[]
  >([]);

  const [
    members,
    setMembers,
  ] = useState<ProjectMember[]>([]);

  const [
    organizeOpen,
    setOrganizeOpen,
  ] = useState(false);
  const [organizeUnassignedItems, setOrganizeUnassignedItems] =
    useState<PlanItem[] | null>(null);

  const [
    editingWorkPackage,
    setEditingWorkPackage,
  ] = useState<WorkPackage | null>(null);
  const [savingWorkPackage, setSavingWorkPackage] = useState(false);

  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>("all");
  const [assignmentFilter, setAssignmentFilter] =
    useState<PlanAssignmentFilter>("all");
  const [searchText, setSearchText] = useState("");

  const [
    expandedGroupKey,
    setExpandedGroupKey,
  ] = useState<string | null>(
    null,
  );

  /**
   * Once the user manually toggles a package,
   * stop auto-opening Unassigned.
   */
  const accordionUserControlledRef =
    useRef(false);

  /**
   * Tracks the filter for which the default
   * accordion behavior was already applied.
   */
  const accordionDefaultedFilterRef = useRef<string | null>(null);
  const searchAutoExpandedRef = useRef<string | null>(null);

  const [
    emailByUserId,
    setEmailByUserId,
  ] = useState<
    Map<string, string>
  >(
    () => new Map(),
  );

  const [
    profileByUserId,
    setProfileByUserId,
  ] = useState<
    Map<
      string,
      UserPresentationRecord
    >
  >(
    () => new Map(),
  );

  const [
    remoteProjectId,
    setRemoteProjectId,
  ] = useState<string | null>(null);

  const [
    shareSheetVisible,
    setShareSheetVisible,
  ] = useState(false);

  const [
    shareTarget,
    setShareTarget,
  ] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [
    shareError,
    setShareError,
  ] = useState<string | null>(null);

  const [
    sharing,
    setSharing,
  ] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Load                                                                     */
  /* ------------------------------------------------------------------------ */

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setPlanItems([]);
        setMeasurements([]);
        setDeltas([]);
        setWorkPackages([]);
        setAssignments([]);
        setMembers([]);

        setEmailByUserId(
          new Map(),
        );

        setProfileByUserId(
          new Map(),
        );

        return;
      }

      const ownerUid =
        user.uid;

      let active = true;

      async function load() {
        const [
          found,
          items,
          measurementItems,
          deltaItems,
          packageItems,
          assignmentItems,
          memberItems,
        ] = await Promise.all([
          getProjectById(
            ownerUid,
            projectId,
          ),

          getPlanItemsForProject(
            ownerUid,
            projectId,
          ),

          getMeasurementsForProject(
            ownerUid,
            projectId,
          ),

          getDeltasForProject(
            ownerUid,
            projectId,
          ),

          getWorkPackagesForProject(
            ownerUid,
            projectId,
          ),

          getWorkPackageAssignmentsForProject(
            ownerUid,
            projectId,
          ),

          getProjectMembersForProject(
            ownerUid,
            projectId,
          ),
        ]);

        if (!active) {
          return;
        }

        const presentedPackageItems = await attachWorkPackageImagePresentations({
          ownerUid,
          localProjectId: projectId,
          workPackages: packageItems,
        });

        if (!active) return;

        setProject(
          found ?? null,
        );

        setPlanItems(
          items,
        );

        setMeasurements(
          measurementItems,
        );

        setDeltas(
          deltaItems,
        );

        setWorkPackages(presentedPackageItems);

        setAssignments(
          assignmentItems,
        );

        setMembers(
          memberItems,
        );

        const nextEmails =
          new Map<
            string,
            string
          >();

        try {
          const remoteProjectId =
            await getRemoteProjectId(
              ownerUid,
              projectId,
            );

          if (!active) {
            return;
          }

          setRemoteProjectId(
            remoteProjectId ?? null,
          );

          if (remoteProjectId) {
            const invitations =
              await listProjectInvitations(
                remoteProjectId,
              );

            if (!active) {
              return;
            }

            for (
              const invitation
              of invitations
            ) {
              if (
                invitation.acceptedByUserId &&
                invitation.email
                  .trim()
                  .length > 0
              ) {
                nextEmails.set(
                  invitation
                    .acceptedByUserId,

                  invitation.email
                    .trim()
                    .toLowerCase(),
                );
              }
            }
          }
        } catch {
          if (active) {
            setRemoteProjectId(null);
          }
          /**
           * Invitation display context
           * is optional.
           */
        }

        try {
          const presentationContext =
            await fetchMemberPresentationContext(
              {
                members:
                  memberItems,

                emailByUserId:
                  nextEmails,
              },
            );

          if (!active) {
            return;
          }

          setEmailByUserId(
            nextEmails,
          );

          setProfileByUserId(
            new Map(
              presentationContext
                .profileByUserId ??
                [],
            ),
          );
        } catch {
          if (active) {
            setEmailByUserId(
              nextEmails,
            );

            setProfileByUserId(
              new Map(),
            );
          }
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [
      projectId,
      user?.uid,
    ]),
  );

  /* ------------------------------------------------------------------------ */
  /* Derived                                                                  */
  /* ------------------------------------------------------------------------ */

  const sortedPlanItems =
    useMemo(
      () =>
        planItems
          .slice()
          .sort(
            (a, b) =>
              a.label.localeCompare(
                b.label,
              ),
          ),
      [
        planItems,
      ],
    );

  const planItemAssignmentMaps =
    useMemo(
      () =>
        buildPlanItemAssignmentMaps(
          sortedPlanItems.map(
            (item) => item.id,
          ),

          workPackages,
          assignments,
          members,
          projectId,
        ),
      [
        assignments,
        members,
        projectId,
        sortedPlanItems,
        workPackages,
      ],
    );

  const workPackageGroups = useMemo(() => {
    const statusMatchedItems = filterPlanItemsForListFilter({
      planItems: sortedPlanItems,
      filter: statusFilter,
      measurements,
      assignmentByPlanItemId: planItemAssignmentMaps.byPlanItemId,
    });
    const visibleItems = filterPlanItemsForListFilter({
      planItems: statusMatchedItems,
      filter: assignmentFilter,
      measurements,
      assignmentByPlanItemId: planItemAssignmentMaps.byPlanItemId,
    });
    const groups = buildPlanWorkPackageGroups({
      planItems: visibleItems,
      workPackages,
      assignments,
      members,
      projectId,
      measurements,
      emailByUserId,
      profileByUserId,
    });
    return searchPlanWorkPackageGroups(groups, searchText, measurements);
  }, [
    assignmentFilter,
    assignments,
    emailByUserId,
    members,
    measurements,
    planItemAssignmentMaps,
    profileByUserId,
    projectId,
    searchText,
    sortedPlanItems,
    statusFilter,
    workPackages,
  ]);
  const activeFilterKey = `${statusFilter}:${assignmentFilter}`;

  /* ------------------------------------------------------------------------ */
  /* Accordion                                                                */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      accordionUserControlledRef.current
    ) {
      return;
    }

    const unassignedKey =
      findUnassignedGroupKey(
        workPackageGroups,
      );

    if (
      accordionDefaultedFilterRef.current !== activeFilterKey
    ) {
      setExpandedGroupKey(
        unassignedKey,
      );

      accordionDefaultedFilterRef.current =
        activeFilterKey;

      return;
    }

    if (
      expandedGroupKey === null &&
      unassignedKey != null
    ) {
      setExpandedGroupKey(
        unassignedKey,
      );
    }
  }, [
    expandedGroupKey,
    activeFilterKey,
    workPackageGroups,
  ]);

  useEffect(() => {
    const normalizedQuery = searchText.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      searchAutoExpandedRef.current = null;
      return;
    }
    if (
      workPackageGroups.length > 0 &&
      searchAutoExpandedRef.current !== normalizedQuery
    ) {
      searchAutoExpandedRef.current = normalizedQuery;
      accordionUserControlledRef.current = false;
      setExpandedGroupKey(workPackageGroups[0].key);
    }
  }, [searchText, workPackageGroups]);

  const toggleGroupExpanded =
    useCallback(
      (
        groupKey: string,
      ) => {
        accordionUserControlledRef.current =
          true;

        setExpandedGroupKey(
          (current) =>
            current === groupKey
              ? null
              : groupKey,
        );
      },
      [],
    );

  const openWorkPackageEditor = useCallback(
    (workPackageId: string | null) => {
      if (!user?.uid || !workPackageId) {
        return;
      }
      const workPackage = workPackages.find((item) => item.id === workPackageId);
      if (workPackage) {
        setEditingWorkPackage(workPackage);
      }
    },
    [user?.uid, workPackages],
  );

  /* ------------------------------------------------------------------------ */
  /* Reload assignment context                                                */
  /* ------------------------------------------------------------------------ */

  const reloadAssignmentContext =
    useCallback(
      async () => {
        if (!user?.uid) {
          return;
        }

        const ownerUid =
          user.uid;

        const [
          packageItems,
          assignmentItems,
          memberItems,
        ] = await Promise.all([
          getWorkPackagesForProject(
            ownerUid,
            projectId,
          ),

          getWorkPackageAssignmentsForProject(
            ownerUid,
            projectId,
          ),

          getProjectMembersForProject(
            ownerUid,
            projectId,
          ),
        ]);

        const presentedPackageItems = await attachWorkPackageImagePresentations({
          ownerUid,
          localProjectId: projectId,
          workPackages: packageItems,
        });

        setWorkPackages(
          presentedPackageItems,
        );

        setAssignments(
          assignmentItems,
        );

        setMembers(
          memberItems,
        );
      },
      [
        projectId,
        user?.uid,
      ],
    );

  const saveWorkPackageName = useCallback(
    async (values: WorkPackageFormValues) => {
      const current = editingWorkPackage;
      const ownerUid = user?.uid;
      const imageChanged = Boolean(values.pickedImage) || values.removeImage === true;

      if (!current || !ownerUid || savingWorkPackage) {
        return;
      }

      setSavingWorkPackage(true);
      let updated: WorkPackage;

      try {
        const result = await updateWorkPackage(ownerUid, current.id, {
          name: values.name,
        });
        if (!result) {
          throw new Error("Work package not found.");
        }
        updated = result;
      } catch (error) {
        Alert.alert(
          "Unable to save",
          error instanceof Error ? error.message : "Unable to save work package.",
        );
        setSavingWorkPackage(false);
        return;
      }

      setWorkPackages((items) =>
        items.map((item) =>
          item.id === updated.id
            ? { ...updated, imageUrl: item.imageUrl }
            : item,
        ),
      );

      let committedImageUrl: string | undefined;
      let imageError: string | null = null;
      let cloudError: string | null = null;
      if (imageChanged) {
        try {
          let remoteProjectId = await getRemoteProjectId(ownerUid, projectId);
          if (!remoteProjectId) {
            throw new Error("Connect this project to cloud before changing a Work Package image.");
          }
          const resolvedRemoteProjectId = remoteProjectId;

          let remoteWorkPackageId = await getRemoteWorkPackageId(
            ownerUid,
            projectId,
            current.id,
          );
          if (!remoteWorkPackageId) {
            const desiredCloudProjectMemberIds = assignments
              .filter(
                (assignment) =>
                  assignment.workPackageId === updated.id &&
                  assignment.status !== "cancelled",
              )
              .map((assignment) => {
                const member = members.find(
                  (candidate) => candidate.id === assignment.projectMemberId,
                );
                return resolveCloudProjectMemberId({
                  selectedMemberId: assignment.projectMemberId,
                  remoteProjectId: resolvedRemoteProjectId,
                  memberUserId: member?.userId ?? null,
                });
              });
            const publishResult = await publishWorkPackageToCloud({
              ownerUid,
              localProjectId: projectId,
              localWorkPackage: {
                id: updated.id,
                name: updated.name,
                description: updated.description,
                status: updated.status,
                planItemIds: updated.planItemIds,
              },
              desiredCloudProjectMemberIds,
            });
            if (!publishResult.ok || publishResult.skipped) {
              throw new Error(
                publishResult.ok
                  ? "Work Package is not connected to cloud yet."
                  : publishResult.error,
              );
            }
            remoteProjectId = publishResult.remoteProjectId;
            remoteWorkPackageId = publishResult.remoteWorkPackageId;
          }

          if (values.pickedImage) {
            const remote = await uploadWorkPackageImage({
              remoteProjectId,
              remoteWorkPackageId,
              image: values.pickedImage,
            });
            committedImageUrl = remote.imageUrl;
          } else if (values.removeImage) {
            const remote = await deleteRemoteWorkPackageImage(
              remoteProjectId,
              remoteWorkPackageId,
            );
            committedImageUrl = remote.imageUrl;
          }
          setWorkPackages((items) =>
            items.map((item) =>
              item.id === updated.id
                ? { ...item, imageUrl: values.removeImage ? undefined : committedImageUrl }
                : item,
            ),
          );
        } catch (error) {
          imageError = error instanceof Error
            ? error.message
            : "The Work Package image could not be saved.";
        }
      }

      // Local name persistence is complete. Cloud publication follows the
      // established Work Packages path and cannot undo the local edit.
      try {
        const remoteId = await getRemoteProjectId(ownerUid, projectId);
        const desiredCloudProjectMemberIds = remoteId
          ? assignments
              .filter(
                (assignment) =>
                  assignment.workPackageId === updated.id &&
                  assignment.status !== "cancelled",
              )
              .map((assignment) => {
                const member = members.find(
                  (candidate) => candidate.id === assignment.projectMemberId,
                );
                return resolveCloudProjectMemberId({
                  selectedMemberId: assignment.projectMemberId,
                  remoteProjectId: remoteId,
                  memberUserId: member?.userId ?? null,
                });
              })
          : [];

        const publishResult = await publishWorkPackageToCloud({
          ownerUid,
          localProjectId: projectId,
          localWorkPackage: {
            id: updated.id,
            name: updated.name,
            description: updated.description,
            status: updated.status,
            planItemIds: updated.planItemIds,
          },
          desiredCloudProjectMemberIds,
        });

        if (!publishResult.ok) {
          cloudError = publishResult.error;
        }
      } catch {
        cloudError = "Unable to reach cloud synchronization.";
      }

      setSavingWorkPackage(false);
      if (imageError) {
        Alert.alert(
          "Name saved on this device",
          `The Work Package name is saved locally, but the image change did not finish. ${imageError}`,
        );
      } else {
        setEditingWorkPackage(null);
        if (cloudError) {
          Alert.alert(
            "Saved on this device",
            `The Work Package name was saved locally, but its cloud update failed. ${cloudError}`,
          );
        }
      }
      void reloadAssignmentContext().catch(() => undefined);
    },
    [
      assignments,
      editingWorkPackage,
      members,
      projectId,
      reloadAssignmentContext,
      savingWorkPackage,
      user?.uid,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /* Baseline metrics                                                         */
  /* ------------------------------------------------------------------------ */

  const measuredCount =
    useMemo(
      () =>
        sortedPlanItems.filter(
          (item) =>
            Boolean(
              getLatestMeasurementForPlanItem(
                measurements,
                item.id,
              ),
            ),
        ).length,
      [
        sortedPlanItems,
        measurements,
      ],
    );

  const pendingCount =
    Math.max(
      sortedPlanItems.length -
        measuredCount,
      0,
    );

  const baselineProgress =
    sortedPlanItems.length > 0
      ? measuredCount /
        sortedPlanItems.length
      : 0;

  const baselineProgressPercent =
    Math.round(
      baselineProgress * 100,
    );

  const openShareSheet = useCallback(
    (
      planItemId: string,
      planItemLabel: string,
    ) => {
      setShareError(null);
      setShareTarget({
        id: planItemId,
        label: planItemLabel,
      });
      setShareSheetVisible(true);
    },
    [],
  );

  const closeShareSheet = useCallback(() => {
    setShareSheetVisible(false);
    setShareTarget(null);
    setShareError(null);
  }, []);

  const handleShareDestination = useCallback(
    async (
      destination: SharePlanItemDestination,
    ) => {
      if (
        !user?.uid ||
        !project ||
        !shareTarget ||
        sharing
      ) {
        return;
      }

      setSharing(true);
      setShareError(null);

      try {
        const chatParams =
          await resolveSharePlanItemDestination({
            ownerUid: user.uid,
            projectId,
            planItemId: shareTarget.id,
            planItemLabel: shareTarget.label,
            projectName: project.name,
            isShared: false,
            remoteProjectId,
            remotePlanItemId: null,
            destination,
          });

        setRemoteProjectId(
          chatParams.remoteProjectId,
        );
        closeShareSheet();
        navigation.navigate(
          "ProjectChat",
          chatParams,
        );
      } catch (err) {
        setShareError(
          err instanceof SharePlanItemFlowError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to share Plan Item.",
        );
      } finally {
        setSharing(false);
      }
    },
    [
      closeShareSheet,
      navigation,
      project,
      projectId,
      remoteProjectId,
      shareTarget,
      sharing,
      user?.uid,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                  */
  /* ------------------------------------------------------------------------ */

  if (
    project === undefined
  ) {
    return (
      <ImageBackground
        source={
          PROJECT_BACKGROUND
        }
        style={[
          styles.container,
          styles.loadingContainer,
        ]}
        resizeMode="cover"
      >
        <ActivityIndicator
          size="small"
          color={
            KEPLER_NAVY
          }
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading plan…
        </Text>
      </ImageBackground>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Missing                                                                  */
  /* ------------------------------------------------------------------------ */

  if (!project) {
    return (
      <ImageBackground
        source={
          PROJECT_BACKGROUND
        }
        style={[
          styles.container,
          styles.missingContainer,
        ]}
        resizeMode="cover"
      >
        <View
          style={
            styles.missingIcon
          }
        >
          <Ionicons
            name="folder-open-outline"
            size={23}
            color={
              KEPLER_NAVY
            }
          />
        </View>

        <Text
          style={
            styles.missingEyebrow
          }
        >
          PLAN WORKSPACE
        </Text>

        <Text
          style={
            styles.missingTitle
          }
        >
          Project not found
        </Text>

        <Text
          style={
            styles.missingDescription
          }
        >
          This project may have been
          removed or is no longer
          available on this device.
        </Text>
      </ImageBackground>
    );
  }

  const isArchived =
    typeof project.archivedAt ===
    "string";

  /* ------------------------------------------------------------------------ */
  /* Main                                                                     */
  /* ------------------------------------------------------------------------ */

  return (
    <ImageBackground
      source={
        PROJECT_BACKGROUND
      }
      style={
        styles.container
      }
      resizeMode="cover"
    >
      <ScrollView
        style={
          styles.scroll
        }
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <PlanSearchFilterControls
          searchText={searchText}
          onSearchTextChange={setSearchText}
          statusFilter={statusFilter}
          assignmentFilter={assignmentFilter}
          onApply={(status, assignment) => {
            accordionUserControlledRef.current = false;
            accordionDefaultedFilterRef.current = null;
            searchAutoExpandedRef.current = null;
            setStatusFilter(status);
            setAssignmentFilter(assignment);
          }}
        />

        {/* Archived */}

        {isArchived ? (
          <Text
            style={
              styles.archivedBanner
            }
            accessibilityRole="text"
          >
            ARCHIVED · Baseline preserved as project history
          </Text>
        ) : null}

        {/* -------------------------------------------------------------- */}
        {/* Summary                                                        */}
        {/* -------------------------------------------------------------- */}

        <View
          style={
            styles.workspaceIntro
          }
        >
          <View
            style={
              styles.summaryRow
            }
            accessibilityLabel={`${sortedPlanItems.length} plan items, ${workPackages.length} work packages, ${measuredCount} measured, ${pendingCount} pending, ${baselineProgressPercent} percent verified`}
          >
            <View
              style={
                styles.summaryPrimary
              }
            >
              <Text style={styles.summaryMetric}>
                {sortedPlanItems.length} plan {sortedPlanItems.length === 1 ? "item" : "items"}
              </Text>
              <Text style={styles.summarySep}>·</Text>
              <Text style={styles.summaryMetric}>
                {workPackages.length} work {workPackages.length === 1 ? "package" : "packages"}
              </Text>
            </View>
          </View>
        </View>

        {/* -------------------------------------------------------------- */}
        {/* Organize Work                                                  */}
        {/* -------------------------------------------------------------- */}

        <View
          style={
            styles.organizationRow
          }
        >
          <Pressable
            style={({
              pressed,
            }) => [
              styles.organizeButton,

              pressed &&
                styles.organizeButtonPressed,
            ]}
            onPress={() =>
              {
                setOrganizeUnassignedItems(null);
                setOrganizeOpen(true);
              }
            }
            accessibilityRole="button"
            accessibilityLabel="Organize work"
          >
            <View style={styles.organizeButtonContent}>
              <Ionicons name="people-outline" size={16} color={KEPLER_NAVY} />
              <Text style={styles.organizeButtonText}>Organize items</Text>
            </View>
          </Pressable>
        </View>

        {/* -------------------------------------------------------------- */}
        {/* Empty State                                                    */}
        {/* -------------------------------------------------------------- */}

        {sortedPlanItems.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyEyebrow
              }
            >
              BUILD YOUR BASELINE
            </Text>

            <Text
              style={
                styles.emptyTitle
              }
            >
              Start with your first
              plan item
            </Text>

            <Text
              style={
                styles.emptyBody
              }
            >
              Define the quantities and
              targets Kepler will
              compare against field
              reality.
            </Text>

            <Pressable
              style={({
                pressed,
              }) => [
                styles.emptyAction,

                pressed &&
                  styles.emptyActionPressed,
              ]}
              onPress={
                onAddPlanItem
              }
              accessibilityRole="button"
              accessibilityLabel="Add to Plan"
            >
              <Ionicons
                name="add"
                size={17}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.emptyActionText
                }
              >
                Add first item
              </Text>
            </Pressable>
          </View>
        ) : (
          /* ------------------------------------------------------------ */
          /* Plan Items                                                   */
          /* ------------------------------------------------------------ */

          <View
            style={
              styles.planList
            }
          >
            {/* Filter empty */}

            {workPackageGroups.length ===
            0 ? (
              <View
                style={
                  styles.filterEmpty
                }
              >
                <Text
                  style={
                    styles.filterEmptyText
                  }
                >
                  {sortedPlanItems.length === 0
                    ? "No plan items yet."
                    : "No matching plan items. Try adjusting your search or filters."}
                </Text>
              </View>
            ) : (
              workPackageGroups.map(
                (
                  group,
                ) => {
                  const expanded =
                    expandedGroupKey ===
                    group.key;

                  const itemCountLabel = `${group.items.length} plan ${
                    group.items.length === 1 ? "item" : "items"
                  }`;
                  const assigneeName = looksLikeInternalUserIdLabel(
                    group.assignee.nameLabel,
                  )
                    ? "Assigned member"
                    : group.assignee.nameLabel.trim() || "Assigned member";
                  const genericAssignee =
                    assigneeName === "Assigned member";
                  const groupAssignmentLine = group.assignee.hasAssignee
                    ? genericAssignee && group.assignee.roleLabel.trim()
                      ? `Assigned · ${group.assignee.roleLabel}`
                      : `Assigned to ${assigneeName}`
                    : "";

                  return (
                    <View
                      key={
                        group.key
                      }
                      style={
                        styles.packageGroup
                      }
                    >
                      {/* ------------------------------------------------ */}
                      {/* Package Header                                   */}
                      {/* ------------------------------------------------ */}

                      <View style={styles.packageHeaderRow}>
                        <Pressable
                          onPress={() => toggleGroupExpanded(group.key)}
                          style={styles.packageHeader}
                          accessibilityRole="button"
                          accessibilityLabel={`${group.title}, ${itemCountLabel}${groupAssignmentLine ? `, ${groupAssignmentLine}` : ""}`}
                          accessibilityState={{ expanded }}
                        >
                          <Ionicons
                            name={expanded ? "chevron-down" : "chevron-forward"}
                            size={18}
                            color={TEXT_MUTED}
                          />
                          <WorkPackageImage
                            uri={
                              group.workPackageId
                                ? workPackages.find(
                                    (item) => item.id === group.workPackageId,
                                  )?.imageUrl
                                : undefined
                            }
                            size={36}
                            radius={9}
                          />
                          <View style={styles.packageHeaderText}>
                            <Text style={styles.packageTitle} numberOfLines={2}>
                              {group.title}
                            </Text>
                            <Text style={styles.packageAssignee} numberOfLines={1}>
                              {itemCountLabel}{groupAssignmentLine ? ` · ${groupAssignmentLine}` : ""}
                            </Text>
                            <Text style={styles.packageSummary}>
                              {group.measuredCount} measured · {group.pendingCount} pending
                            </Text>
                          </View>
                        </Pressable>
                        {user?.uid && group.workPackageId ? (
                          <Pressable
                            onPress={() => openWorkPackageEditor(group.workPackageId)}
                            style={styles.packageEditButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${group.title}`}
                            hitSlop={8}
                          >
                            <Ionicons
                              name="create-outline"
                              size={18}
                              color={KEPLER_NAVY}
                            />
                          </Pressable>
                        ) : null}
                        {user?.uid && !group.workPackageId ? (
                          <Pressable
                            onPress={() => {
                              setOrganizeUnassignedItems(group.items);
                              setOrganizeOpen(true);
                            }}
                            style={({ pressed }) => [
                              styles.unassignedOrganizeButton,
                              pressed && styles.unassignedOrganizeButtonPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Organize unassigned work"
                            hitSlop={6}
                          >
                            <Ionicons name="people-outline" size={14} color={KEPLER_NAVY} />
                            <Text style={styles.unassignedOrganizeButtonText}>
                              Organize Work
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {/* ------------------------------------------------ */}
                      {/* Expanded Plan Items                              */}
                      {/* ------------------------------------------------ */}

                      {expanded ? (
                        <>
                          {/* One accent line only */}
                          <View
                            pointerEvents="none"
                            style={
                              styles.planItemTopAccent
                            }
                          >
                            <View
                              style={
                                styles.planItemTopAccentBlue
                              }
                            />

                            <View
                              style={
                                styles.planItemTopAccentRed
                              }
                            />
                          </View>

                          {group.items.map(
                            (
                              item,
                              index,
                            ) => (
                              <PlanItemCard
                                key={
                                  item.id
                                }
                                item={
                                  item
                                }
                                latestMeasurement={getLatestMeasurementForPlanItem(
                                  measurements,
                                  item.id,
                                )}
                                latestDelta={getLatestDeltaForPlanItem(
                                  deltas,
                                  item.id,
                                )}
                                assignment={
                                  planItemAssignmentMaps.byPlanItemId.get(
                                    item.id,
                                  ) ??
                                  null
                                }
                                showAssignmentMeta={
                                  true
                                }
                                showExecutionDetails={false}
                                onView={() =>
                                  onOpenPlanItem(
                                    item.id,
                                  )
                                }
                                onEdit={() =>
                                  navigation.navigate(
                                    "EditPlanItem",
                                    {
                                      projectId,
                                      planItemId:
                                        item.id,
                                    },
                                  )
                                }
                                onShare={() =>
                                  openShareSheet(
                                    item.id,
                                    item.label,
                                  )
                                }
                                showDivider={
                                  index !==
                                  group
                                    .items
                                    .length -
                                    1
                                }
                              />
                            ),
                          )}
                        </>
                      ) : null}
                    </View>
                  );
                },
              )
            )}
          </View>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Bottom Hint                                                    */}
        {/* -------------------------------------------------------------- */}

        {sortedPlanItems.length >
        0 ? (
          <View
            style={
              styles.bottomHint
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={
                TEXT_MUTED
              }
            />

            <Text
              style={
                styles.bottomHintText
              }
            >
              Tap a plan item to view field comparison.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {shareError ? (
        <View style={styles.shareErrorBanner}>
          <Text style={styles.shareErrorText}>
            {shareError}
          </Text>
        </View>
      ) : null}

      <SharePlanItemSheet
        visible={shareSheetVisible}
        remoteProjectId={remoteProjectId}
        projectName={project.name}
        planItemLabel={
          shareTarget?.label ?? ""
        }
        onClose={closeShareSheet}
        onSelect={(destination) => {
          void handleShareDestination(
            destination,
          );
        }}
      />

      {/* -------------------------------------------------------------- */}
      {/* Floating Add                                                   */}
      {/* -------------------------------------------------------------- */}

      {sortedPlanItems.length >
      0 ? (
        <Pressable
          style={({
            pressed,
          }) => [
            styles.floatingAddButton,

            pressed &&
              styles.floatingAddButtonPressed,
          ]}
          onPress={
            onAddPlanItem
          }
          accessibilityRole="button"
          accessibilityLabel="Add to Plan"
          hitSlop={8}
        >
          <Ionicons
            name="add"
            size={28}
            color="#FFFFFF"
          />
        </Pressable>
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Organize Modal                                                 */}
      {/* -------------------------------------------------------------- */}

      {user?.uid ? (
        <OrganizeWorkModal
          visible={
            organizeOpen
          }
          projectId={
            projectId
          }
          ownerUid={
            user.uid
          }
          canMutate
          planItems={
            organizeUnassignedItems ?? sortedPlanItems
          }
          selectionMode={organizeUnassignedItems ? "unassignedItemsFirst" : "default"}
          onClose={() =>
            {
              setOrganizeOpen(false);
              setOrganizeUnassignedItems(null);
            }
          }
          onUpdated={() => {
            void reloadAssignmentContext();
          }}
        />
      ) : null}

      {user?.uid ? (
        <WorkPackageEditorModal
          visible={editingWorkPackage !== null}
          mode="edit"
          nameOnly
          imageUrl={editingWorkPackage?.imageUrl ?? null}
          initial={
            editingWorkPackage
              ? {
                  name: editingWorkPackage.name,
                  description: editingWorkPackage.description ?? "",
                  status: editingWorkPackage.status,
                  planItemIds: [...editingWorkPackage.planItemIds],
                }
              : null
          }
          planItems={sortedPlanItems.map((item) => ({
            id: item.id,
            label: item.label,
          }))}
          saving={savingWorkPackage}
          onClose={() => {
            if (!savingWorkPackage) {
              setEditingWorkPackage(null);
            }
          }}
          onSubmit={(values) => {
            void saveWorkPackageName(values);
          }}
        />
      ) : null}
    </ImageBackground>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Screen                                                                 */
    /* ---------------------------------------------------------------------- */

    container: {
      flex: 1,

      backgroundColor:
        "transparent",

      position: "relative",
    },

    scroll: {
      flex: 1,
    },

    content: {
      paddingTop: 10,

      paddingHorizontal: 14,

      paddingBottom: 110,
    },

    /* ---------------------------------------------------------------------- */
    /* Loading                                                                */
    /* ---------------------------------------------------------------------- */

    loadingContainer: {
      alignItems: "center",

      justifyContent:
        "center",

      gap: 10,
    },

    loadingText: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      fontWeight: "600",
    },

    /* ---------------------------------------------------------------------- */
    /* Archive                                                                */
    /* ---------------------------------------------------------------------- */

    archivedBanner: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      fontWeight: "600",

      marginBottom: 8,

      paddingHorizontal: 2,
    },

    /* ---------------------------------------------------------------------- */
    /* Summary                                                                */
    /* ---------------------------------------------------------------------- */

    workspaceIntro: {
      marginBottom: 10,

      paddingHorizontal: 6,
    },

    summaryRow: {
      marginTop: 8,

      flexDirection: "row",

      alignItems: "center",

      flexWrap: "wrap",

      columnGap: 10,

      rowGap: 4,
    },

    summaryPrimary: {
      flexDirection: "row",

      alignItems: "center",

      flexWrap: "wrap",

      flexShrink: 1,

      gap: 6,
    },

    summaryMetric: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      fontWeight: "600",
    },

    summarySep: {
      ...typography.caption,

      color:
        "rgba(152,162,179,0.85)",

      fontWeight: "500",
    },

    /* ---------------------------------------------------------------------- */
    /* Organize Work                                                          */
    /* ---------------------------------------------------------------------- */

    organizationRow: {
      marginTop: 12,
    },

    organizeButton: {
      minHeight: 44,
      alignSelf: "flex-end",
      paddingHorizontal: 10,
      borderRadius: 8,
      justifyContent: "center",
    },

    organizeButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    organizeButtonPressed: {
      opacity: 0.82,
    },

    organizeButtonText: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight: "700",
    },

    /* ---------------------------------------------------------------------- */
    /* Floating Add                                                           */
    /* ---------------------------------------------------------------------- */

    floatingAddButton: {
      position: "absolute",

      right: 18,

      bottom: 22,

      width: 56,

      height: 56,

      borderRadius: 28,

      alignItems: "center",

      justifyContent:
        "center",

      backgroundColor:
        KEPLER_NAVY,

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width: 0,

        height: 7,
      },

      shadowOpacity: 0.24,

      shadowRadius: 12,

      elevation: 7,

      zIndex: 20,
    },

    floatingAddButtonPressed: {
      opacity: 0.9,

      transform: [
        {
          scale: 0.95,
        },
      ],
    },

    /* ---------------------------------------------------------------------- */
    /* Plan List                                                              */
    /* ---------------------------------------------------------------------- */

    planList: {
      marginTop: 12,
    },

    filterEmpty: {
      paddingHorizontal: 8,

      paddingVertical: 20,
    },

    filterEmptyText: {
      ...typography.body,

      color:
        TEXT_SECONDARY,

      textAlign: "center",
    },

    /* ---------------------------------------------------------------------- */
    /* Work Package                                                           */
    /* ---------------------------------------------------------------------- */

    packageGroup: {
      borderTopWidth:
        StyleSheet.hairlineWidth,

      borderTopColor:
        "rgba(1,33,105,0.08)",
    },

    packageHeader: {
      flex: 1,
      paddingHorizontal: 8,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: "rgba(1,33,105,0.012)",
    },

    packageHeaderRow: {
      flexDirection: "row",
      alignItems: "stretch",
    },

    packageEditButton: {
      width: 42,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(1,33,105,0.012)",
    },

    unassignedOrganizeButton: {
      alignSelf: "center",
      minHeight: 34,
      marginHorizontal: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      backgroundColor: "rgba(1,33,105,0.07)",
    },
    unassignedOrganizeButtonPressed: {
      opacity: 0.78,
    },
    unassignedOrganizeButtonText: {
      ...typography.caption,
      color: KEPLER_NAVY,
      fontWeight: "600",
    },

    packageHeaderText: {
      flex: 1,
      minWidth: 0,
    },

    packageTitle: {
      ...typography.bodyMedium,
      color: TEXT_PRIMARY,
      minWidth: 0,
      fontWeight: "700",
    },

    packageAssignee: {
      ...typography.caption,
      color: "#344054",
      marginTop: 3,
    },

    packageSummary: {
      ...typography.caption,
      color: TEXT_MUTED,
      marginTop: 2,
    },

    /* ---------------------------------------------------------------------- */
    /* One Kepler Accent For Expanded Section                                 */
    /* ---------------------------------------------------------------------- */

    planItemTopAccent: {
      width: "100%",

      height: 2,

      flexDirection: "row",
    },

    planItemTopAccentBlue: {
      flex: 1,

      backgroundColor:
        KEPLER_NAVY,
    },

    planItemTopAccentRed: {
      width: 34,

      backgroundColor:
        KEPLER_RED,
    },

    /* ---------------------------------------------------------------------- */
    /* Empty                                                                  */
    /* ---------------------------------------------------------------------- */

    emptyCard: {
      marginTop: 14,

      alignItems: "center",

      paddingHorizontal: 18,

      paddingVertical: 28,
    },

    emptyEyebrow: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontWeight: "700",

      letterSpacing: 1.1,
    },

    emptyTitle: {
      ...typography.sectionTitle,

      color:
        TEXT_PRIMARY,

      textAlign: "center",

      marginTop: 6,
    },

    emptyBody: {
      ...typography.body,

      color:
        TEXT_SECONDARY,

      textAlign: "center",

      maxWidth: 290,

      marginTop: 6,
    },

    emptyAction: {
      marginTop: 16,

      minHeight: 42,

      paddingHorizontal: 16,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "center",

      gap: 6,

      backgroundColor:
        KEPLER_NAVY,
    },

    emptyActionPressed: {
      opacity: 0.9,

      transform: [
        {
          scale: 0.98,
        },
      ],
    },

    emptyActionText: {
      ...typography.button,

      color: "#FFFFFF",
    },

    /* ---------------------------------------------------------------------- */
    /* Bottom Hint                                                            */
    /* ---------------------------------------------------------------------- */

    bottomHint: {
      flexDirection: "row",

      alignItems:
        "flex-start",

      gap: 6,

      paddingHorizontal: 2,

      marginTop: 8,
    },

    bottomHintText: {
      ...typography.caption,

      color:
        TEXT_MUTED,

      flex: 1,
    },

    shareErrorBanner: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 90,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: "rgba(227,24,55,0.08)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(227,24,55,0.18)",
    },

    shareErrorText: {
      ...typography.caption,
      color: KEPLER_RED,
      textAlign: "center",
    },

    /* ---------------------------------------------------------------------- */
    /* Missing                                                                */
    /* ---------------------------------------------------------------------- */

    missingContainer: {
      alignItems: "center",

      justifyContent:
        "center",

      paddingHorizontal: 30,
    },

    missingIcon: {
      width: 56,

      height: 56,

      borderRadius: 28,

      alignItems: "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1,33,105,0.06)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.10)",

      marginBottom: 16,
    },

    missingEyebrow: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontWeight: "700",

      letterSpacing: 1.1,

      marginBottom: 8,
    },

    missingTitle: {
      ...typography.title,

      color:
        TEXT_PRIMARY,

      textAlign: "center",
    },

    missingDescription: {
      ...typography.body,

      color:
        TEXT_SECONDARY,

      textAlign: "center",

      maxWidth: 290,

      marginTop: 8,
    },
  });
