import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BlurView } from "expo-blur";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  useFocusEffect,
} from "@react-navigation/native";

import {
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";

import ProjectPlan from "../components/project/ProjectPlan";
import ProjectPlanContent from "../components/project/ProjectPlanContent";
import ProjectProgressManagementModal from "../components/project/ProjectProgressManagementModal";
import ProjectTeamContent from "../components/project/ProjectTeamContent";
import WorkPackagesSection from "../components/project/WorkPackagesSection";
import WorkProgressContent from "../components/project/WorkProgressContent";

import type {
  ProjectMemberRole,
} from "../types/projectMember";

import type {
  RootStackParamList,
} from "../navigation/types";

import {
  loadSharedProjectSnapshot,
  SharedProjectUnavailableError,
} from "../services/api/sharedProjects";

import {
  getPendingRemoteMeasurements,
} from "../services/api/measurements";

import {
  getRemoteWorkPackageAssignmentsForProject,
} from "../services/api/workPackageAssignments";

import {
  getRemoteWorkPackagesForProject,
} from "../services/api/workPackages";

import {
  getRemoteProjectId,
} from "../store/projectCloudMappings";

import {
  getDeltasForProject,
} from "../store/deltas";

import {
  getEvidenceForProject,
} from "../store/evidence";

import {
  getMeasurementsForProject,
} from "../store/measurements";

import {
  getPlanItemsForProject,
} from "../store/planItems";

import {
  getProjectById,
} from "../store/projects";

import { colors, typography } from "../theme/colors";

import type {
  Delta,
} from "../types/delta";

import type {
  Evidence,
} from "../types/evidence";

import type {
  Measurement,
} from "../types/measurement";

import type {
  PlanItem,
} from "../types/plan";

import type {
  Project,
} from "../types/project";

import type {
  WorkPackage,
} from "../types/workPackage";

import type {
  WorkPackageAssignment,
} from "../types/workPackageAssignment";

import {
  calculateDifference,
  calculatePercentDifference,
} from "../utils/calculations/comparison";

import {
  buildProjectIntelligence,
} from "../utils/domain/projectIntelligence";

import {
  summarizeDeltas,
} from "../utils/domain/summarizeDeltas";

import {
  type UserPresentationRecord,
} from "../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../utils/domain/memberPresentationContext";

import {
  effectiveMeasurementReviewStatus,
} from "../utils/measurementReview";

import {
  formatSubmissionReviewStatusLabel,
  measurementReviewStatusColor,
} from "../utils/domain/statusPresentation";
import Ionicons from "@expo/vector-icons/Ionicons";

type Props =
  NativeStackScreenProps<
    RootStackParamList,
    "Project"
  >;

/* -------------------------------------------------------------------------- */
/*                               Helper Types                                 */
/* -------------------------------------------------------------------------- */

type ProjectTab =
  | "project"
  | "plan"
  | "team"
  | "workProgress";

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function formatMembershipRoleLabel(
  role: ProjectMemberRole,
): string {
  switch (role) {
    case "owner":
      return "Owner";

    case "project_admin":
      return "Project Admin";

    case "contractor":
      return "Contractor";

    case "field_member":
      return "Field Member";

    case "viewer":
      return "Viewer";

    default:
      return role;
  }
}

function projectStatusLabel(status: Project["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "planning":
      return "Planning";
    case "on-hold":
      return "On hold";
    case "completed":
      return "Completed";
  }
}

function isAssignedScopeRole(
  role:
    | ProjectMemberRole
    | undefined,
): boolean {
  return (
    role === "contractor" ||
    role === "field_member"
  );
}

function formatPlannedValue(
  value: number,
  unit: string,
): string {
  if (unit === "ea") {
    return `${value} ${unit}`;
  }

  return `${value.toFixed(
    2,
  )} ${unit}`;
}

function formatSignedValue(
  value: number,
  unit: string,
): string {
  const sign =
    value > 0 ? "+" : "";

  return `${sign}${value.toFixed(
    2,
  )} ${unit}`;
}

function formatSignedPercent(
  value: number,
): string {
  const sign =
    value > 0 ? "+" : "";

  return `${sign}${value.toFixed(
    1,
  )}%`;
}

function formatSignedCurrency(
  value: number,
): string {
  if (value === 0) {
    return "$0.00";
  }

  const sign =
    value > 0 ? "+" : "-";

  return `${sign}$${Math.abs(
    value,
  ).toFixed(2)}`;
}

function formatSignedDays(
  value: number,
): string {
  const absolute =
    Math.abs(value).toFixed(2);

  const unitLabel =
    Math.abs(value) === 1
      ? "day"
      : "days";

  if (value === 0) {
    return `0.00 ${unitLabel}`;
  }

  const sign =
    value > 0 ? "+" : "-";

  return `${sign}${absolute} ${unitLabel}`;
}

function formatSignedHours(
  value: number,
): string {
  if (value === 0) {
    return "0.00 hr";
  }

  const sign =
    value > 0 ? "+" : "-";

  return `${sign}${Math.abs(
    value,
  ).toFixed(2)} hr`;
}

/* -------------------------------------------------------------------------- */
/*                         Project Screen UI Components                       */
/* -------------------------------------------------------------------------- */

const GRAPHITE = colors.text.primary;
const NAVY = colors.brand.navy;
const KEPLER_NAVY = "#012169";

type GlassIconButtonProps = {
  iconName: React.ComponentProps<
    typeof Ionicons
  >["name"];
  onPress: () => void;
  accessibilityLabel: string;
  label?: string;
};

function GlassIconButton({
  iconName,
  onPress,
  accessibilityLabel,
  label,
}: GlassIconButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.projectsBackButton,
        pressed && styles.glassButtonPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
        <Ionicons
          name={iconName}
          size={18}
          color={KEPLER_NAVY}
        />
        {label ? (
          <Text style={styles.projectsBackText}>{label}</Text>
        ) : null}
    </Pressable>
  );
}

type ProjectNavRowProps = {
  iconName: React.ComponentProps<
    typeof Ionicons
  >["name"];
  title: string;
  description: string;
  onPress: () => void;
  accessibilityLabel: string;
  isLast?: boolean;
};

function ProjectNavRow({
  iconName,
  title,
  description,
  onPress,
  accessibilityLabel,
  isLast = false,
}: ProjectNavRowProps) {
  return (
    <Pressable
      style={[
        styles.navRow,
        isLast && styles.navRowLast,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel
      }
    >
      <View
        style={
          styles.navRowIconWrap
        }
      >
        <Ionicons
          name={iconName}
          size={20}
          color={NAVY}
        />
      </View>

      <View
        style={
          styles.navRowContent
        }
      >
        <Text
          style={
            styles.navRowTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.navRowDescription
          }
        >
          {description}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={
          colors.text.muted
        }
      />
    </Pressable>
  );
}

type OperationalShortcutProps = {
  iconName: React.ComponentProps<
    typeof Ionicons
  >["name"];
  title: string;
  description: string;
  onPress?: () => void;
};

function OperationalShortcut({
  iconName,
  title,
  description,
  onPress,
}: OperationalShortcutProps) {
  const content = (
    <>
      <View
        style={
          styles.actionIconWrap
        }
      >
        <Ionicons
          name={iconName}
          size={20}
          color={NAVY}
        />
      </View>

      <View>
        <Text
          style={
            styles.actionTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.actionDescription
          }
        >
          {description}
        </Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.action}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.action}>
      {content}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Project Tabs                                 */
/* -------------------------------------------------------------------------- */

type ProjectTabsProps = {
  activeTab: ProjectTab;
  onProject: () => void;
  onPlan: () => void;
  onTeam: () => void;
  onWorkProgress: () => void;
};

const PROJECT_TAB_ITEMS: {
  id: ProjectTab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  accessibilityLabel: string;
}[] = [
  {
    id: "plan",
    label: "Plan",
    icon: "document-text-outline",
    accessibilityLabel: "Plan",
  },
  {
    id: "team",
    label: "Team",
    icon: "people-outline",
    accessibilityLabel: "Project team",
  },
  {
    id: "project",
    label: "Activity",
    icon: "time-outline",
    accessibilityLabel: "Activity",
  },
  {
    id: "workProgress",
    label: "Progress",
    icon: "bar-chart-outline",
    accessibilityLabel: "Progress",
  },
];

function ProjectTabs({
  activeTab,
  onProject,
  onPlan,
  onTeam,
  onWorkProgress,
}: ProjectTabsProps) {
  const handlers: Record<ProjectTab, () => void> = {
    project: onProject,
    plan: onPlan,
    team: onTeam,
    workProgress: onWorkProgress,
  };

  return (
    <View style={styles.tabsContainer}>
      {PROJECT_TAB_ITEMS.map((tab) => {
        const selected = activeTab === tab.id;

        return (
          <Pressable
            key={tab.id}
            style={styles.tabButton}
            onPress={handlers[tab.id]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.accessibilityLabel}
          >
            <View style={styles.tabLabelRow}>
              <Ionicons
                name={tab.icon}
                size={16}
                color={selected ? colors.text.primary : colors.text.muted}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  selected && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </View>

            {selected ? (
              <View style={styles.tabIndicator} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Project Screen                                */
/* -------------------------------------------------------------------------- */

export default function ProjectScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();

  const projectId =
    route.params.projectId;

  const isShared =
    route.params.source ===
    "shared";

  const membershipRole =
    route.params.membershipRole;

  /*
   * Plan is the default tab when ProjectScreen opens.
   */
  const [
    activeTab,
    setActiveTab,
  ] = useState<ProjectTab>(
    "plan",
  );

  const [
    project,
    setProject,
  ] = useState<
    | Project
    | null
    | undefined
  >(undefined);
  const [failedProjectAvatarUri, setFailedProjectAvatarUri] = useState<
    string | null
  >(null);
  const [progressManagementVisible, setProgressManagementVisible] =
    useState(false);
  const [progressRemoteProjectId, setProgressRemoteProjectId] = useState<
    string | null | undefined
  >(undefined);
  const [progressMappingFailed, setProgressMappingFailed] = useState(false);

  useEffect(() => {
    if (!progressManagementVisible) return;

    let active = true;
    if (!user?.uid) {
      setProgressRemoteProjectId(null);
      setProgressMappingFailed(false);
      return () => {
        active = false;
      };
    }

    void getRemoteProjectId(user.uid, projectId)
      .then((remoteProjectId) => {
        if (!active) return;
        setProgressRemoteProjectId(remoteProjectId ?? null);
        setProgressMappingFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setProgressRemoteProjectId(null);
        setProgressMappingFailed(true);
      });

    return () => {
      active = false;
    };
  }, [progressManagementVisible, projectId, user?.uid]);

  const [
    plannedItems,
    setPlannedItems,
  ] = useState<PlanItem[]>([]);

  const [
    measurements,
    setMeasurements,
  ] = useState<
    Measurement[]
  >([]);

  const [
    projectDeltas,
    setProjectDeltas,
  ] = useState<Delta[]>([]);

  const [
    projectEvidence,
    setProjectEvidence,
  ] = useState<
    Evidence[]
  >([]);

  const [
    sharedWorkPackages,
    setSharedWorkPackages,
  ] = useState<WorkPackage[]>([]);

  const [
    sharedAssignments,
    setSharedAssignments,
  ] = useState<WorkPackageAssignment[]>([]);

  const [
    sharedProfileByUserId,
    setSharedProfileByUserId,
  ] = useState<Map<string, UserPresentationRecord>>(
    () => new Map(),
  );

  const [
    sharedError,
    setSharedError,
  ] = useState<
    | "unavailable"
    | "network"
    | null
  >(null);

  const [
    sharedRetryToken,
    setSharedRetryToken,
  ] = useState(0);

  const [
    pendingReviewCount,
    setPendingReviewCount,
  ] = useState(0);

  const [
    readyForReviewCount,
    setReadyForReviewCount,
  ] = useState(0);

  /* ------------------------------------------------------------------------ */
  /* Project Loading                                                          */
  /* ------------------------------------------------------------------------ */

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setPlannedItems([]);
        setMeasurements([]);
        setProjectDeltas([]);
        setProjectEvidence([]);
        setSharedWorkPackages([]);
        setSharedAssignments([]);
        setSharedProfileByUserId(new Map());
        setSharedError(null);
        setPendingReviewCount(0);
        setReadyForReviewCount(0);

        return;
      }

      let active = true;

      async function loadLocal() {
        const ownerUid =
          user!.uid;

        const [
          found,
          planItems,
          measurementItems,
          deltaItems,
          evidenceItems,
        ] =
          await Promise.all([
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

            getEvidenceForProject(
              ownerUid,
              projectId,
            ),
          ]);

        if (active) {
          setSharedError(null);

          setProject(
            found ?? null,
          );

          setPlannedItems(
            planItems,
          );

          setMeasurements(
            measurementItems,
          );

          setProjectDeltas(
            deltaItems,
          );

          setProjectEvidence(
            evidenceItems,
          );
        }

        if (
          !found ||
          !active
        ) {
          if (active) {
            setPendingReviewCount(
              0,
            );

            setReadyForReviewCount(
              0,
            );
          }

          return;
        }

        try {
          const remoteId =
            await getRemoteProjectId(
              ownerUid,
              projectId,
            );

          if (!remoteId) {
            if (active) {
              setPendingReviewCount(
                0,
              );

              setReadyForReviewCount(
                0,
              );
            }

            return;
          }

          const [
            pending,
            assignments,
          ] =
            await Promise.all([
              getPendingRemoteMeasurements(
                remoteId,
              ),

              getRemoteWorkPackageAssignmentsForProject(
                remoteId,
              ).catch(
                () => [],
              ),
            ]);

          if (active) {
            setPendingReviewCount(
              pending.length,
            );

            setReadyForReviewCount(
              assignments.filter(
                (item) =>
                  item.status ===
                  "ready_for_review",
              ).length,
            );
          }
        } catch {
          if (active) {
            setPendingReviewCount(
              0,
            );

            setReadyForReviewCount(
              0,
            );
          }
        }
      }

      async function loadShared() {
        setProject(undefined);

        setSharedError(null);

        setPendingReviewCount(
          0,
        );

        setReadyForReviewCount(
          0,
        );

        try {
          const snapshot =
            await loadSharedProjectSnapshot(
              projectId,
            );

          if (!active) {
            return;
          }

          setProject(
            snapshot.project,
          );

          setPlannedItems(
            snapshot.planItems,
          );

          setMeasurements(
            snapshot.measurements,
          );

          setProjectDeltas(
            snapshot.deltas,
          );

          setProjectEvidence(
            snapshot.evidence,
          );

          try {
            const [remotePackages, remoteAssignments] =
              await Promise.all([
                getRemoteWorkPackagesForProject(projectId),
                getRemoteWorkPackageAssignmentsForProject(projectId),
              ]);

            if (!active) {
              return;
            }

            setSharedWorkPackages(remotePackages);
            setSharedAssignments(remoteAssignments);

            const memberIds = remoteAssignments.map(
              (item) => item.projectMemberId,
            );
            const presentationContext = await fetchMemberPresentationContext({
              projectId,
              projectMemberIds: memberIds,
            });

            if (!active) {
              return;
            }

            setSharedProfileByUserId(
              new Map(presentationContext.profileByUserId ?? []),
            );
          } catch {
            if (!active) {
              return;
            }

            // Plan items already loaded; grouping metadata is best-effort.
            setSharedWorkPackages([]);
            setSharedAssignments([]);
            setSharedProfileByUserId(new Map());
          }
        } catch (error) {
          if (!active) {
            return;
          }

          setProject(null);
          setPlannedItems([]);
          setMeasurements([]);
          setSharedWorkPackages([]);
          setSharedAssignments([]);
          setSharedProfileByUserId(new Map());
          setProjectDeltas([]);
          setProjectEvidence([]);

          setPendingReviewCount(
            0,
          );

          setReadyForReviewCount(
            0,
          );

          if (
            error instanceof
            SharedProjectUnavailableError
          ) {
            setSharedError(
              "unavailable",
            );
          } else {
            setSharedError(
              "network",
            );
          }
        }
      }

      if (isShared) {
        void loadShared();
      } else {
        void loadLocal();
      }

      return () => {
        active = false;
      };
    }, [
      user?.uid,
      projectId,
      isShared,
      sharedRetryToken,
    ]),
  );

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                  */
  /* ------------------------------------------------------------------------ */

  if (
    project === undefined
  ) {
    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
        edges={["top"]}
      >
        <View
          style={
            styles.container
          }
        >
          {isShared ? (
            <>
              <Pressable
                style={
                  styles.backButton
                }
                onPress={() =>
                  navigation.goBack()
                }
              >
                <Text
                  style={
                    styles.backButtonText
                  }
                >
                  ←
                </Text>
              </Pressable>

              <Text
                style={
                  styles.sharedLoadingText
                }
              >
                Loading shared
                project…
              </Text>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Missing / unavailable project                                            */
  /* ------------------------------------------------------------------------ */

  if (!project) {
    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
        edges={["top"]}
      >
        <View
          style={
            styles.container
          }
        >
          <Pressable
            style={
              styles.backButton
            }
            onPress={() =>
              navigation.goBack()
            }
          >
            <Text
              style={
                styles.backButtonText
              }
            >
              ←
            </Text>
          </Pressable>

          <Text
            style={styles.title}
          >
            {isShared &&
            sharedError ===
              "unavailable"
              ? "This shared project is no longer available."
              : isShared &&
                  sharedError ===
                    "network"
                ? "Unable to load shared project."
                : "Project not found."}
          </Text>

          {isShared &&
          sharedError ===
            "network" ? (
            <Pressable
              style={
                styles.retryButton
              }
              onPress={() =>
                setSharedRetryToken(
                  (value) =>
                    value + 1,
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Retry loading shared project"
            >
              <Text
                style={
                  styles.retryButtonText
                }
              >
                Retry
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Derived Project State                                                    */
  /* ------------------------------------------------------------------------ */

  const recentMeasurements =
    measurements
      .slice(-3)
      .reverse();

  const deltaSummary =
    summarizeDeltas(
      projectDeltas,
    );

  const intelligencePulse =
    buildProjectIntelligence({
      measurements,
      deltas:
        projectDeltas,
      evidence:
        projectEvidence,
      planItems:
        plannedItems,
    });

  const latestMeasurement =
    recentMeasurements[0];

  const sharedRoleLabel =
    membershipRole
      ? formatMembershipRoleLabel(
          membershipRole,
        )
      : null;

  const showAssignedScopeEmpty =
    isShared &&
    isAssignedScopeRole(
      membershipRole,
    );

  const canSharedFieldCapture =
    isShared &&
    isAssignedScopeRole(
      membershipRole,
    ) &&
    plannedItems.length > 0;

  const sharedCaptureRole =
    membershipRole ===
      "contractor" ||
    membershipRole ===
      "field_member"
      ? membershipRole
      : null;

  /* ------------------------------------------------------------------------ */
  /* Tab Navigation                                                           */
  /* ------------------------------------------------------------------------ */

  const openProjectTab = () => {
    setActiveTab("project");
  };

  const openPlanTab = () => {
    setActiveTab("plan");
  };

  const openTeamTab = () => {
    setActiveTab("team");
  };

  const openWorkProgressTab =
    () => {
      setActiveTab(
        "workProgress",
      );
    };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <View
        style={
          styles.container
        }
      >
        <View
          style={
            styles.chrome
          }
        >
        {/* --------------------------------------------------------------- */}
        {/* Top Bar                                                        */}
        {/* --------------------------------------------------------------- */}

        <View style={styles.topBar}>
          <View style={styles.topNavigationBar}>
            <GlassIconButton
              iconName="chevron-back"
              label="Projects"
              onPress={() =>
                navigation.navigate(
                  "MainTabs",
                )
              }
              accessibilityLabel="Go back to projects"
            />

            <View style={styles.headerActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed && styles.glassButtonPressed,
                ]}
                onPress={() => navigation.navigate("Notifications")}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                hitSlop={8}
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={KEPLER_NAVY}
                />
              </Pressable>

              {!isShared ? (
                <BlurView
                  intensity={35}
                  tint="light"
                  style={styles.glassButtonOuter}
                >
                  <View
                    pointerEvents="none"
                    style={styles.glassButtonHighlight}
                  />

                  <Pressable
                    style={({ pressed }) => [
                      styles.glassEditButton,
                      pressed && styles.glassButtonPressed,
                    ]}
                    onPress={() =>
                      navigation.navigate("EditProject", {
                        projectId: project.id,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Edit project."
                  >
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={GRAPHITE}
                    />
                    <Text style={styles.glassEditButtonText}>Edit</Text>
                  </Pressable>
                </BlurView>
              ) : null}
            </View>
          </View>

          <View style={styles.projectIdentity}>
            <View
              style={
                styles.projectAvatarWrap
              }
            >
              {project.avatarUri &&
              failedProjectAvatarUri !== project.avatarUri ? (
                <Image
                  source={{
                    uri: project.avatarUri,
                  }}
                  style={
                    styles.projectAvatar
                  }
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  onError={() =>
                    setFailedProjectAvatarUri(project.avatarUri ?? null)
                  }
                />
              ) : (
                <View
                  style={
                    styles.projectAvatarFallback
                  }
                >
                  <Ionicons
                    name="business-outline"
                    size={22}
                    color={
                      KEPLER_NAVY
                    }
                  />
                </View>
              )}
            </View>

            <View
              style={
                styles.projectIdentityText
              }
            >
              <Text
                style={
                  styles.topBarTitle
                }
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {project.name}
              </Text>

              {project.location?.trim() ? (
                <View style={styles.topBarLocationRow}>
                  <Ionicons
                    name="location-outline"
                    size={13}
                    color={colors.text.secondary}
                  />
                  <Text
                    style={styles.topBarLocation}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {project.location}
                  </Text>
                </View>
              ) : null}

              {project.status ? (
                <View style={styles.projectStatusPill}>
                  <View style={styles.projectStatusDot} />
                  <Text style={styles.projectStatusText}>
                    {projectStatusLabel(project.status)}
                  </Text>
                </View>
              ) : null}

              {isShared ? (
                <Text style={styles.sharedMeta}>
                  Shared project
                  {sharedRoleLabel ? ` · ${sharedRoleLabel}` : ""}
                </Text>
              ) : null}
            </View>
          </View>

        </View>
   

        {/* --------------------------------------------------------------- */}
        {/* Project Header                                                 */}
        {/* --------------------------------------------------------------- */}

       

        {/* --------------------------------------------------------------- */}
        {/* Project Tabs                                                   */}
        {/* --------------------------------------------------------------- */}

        <ProjectTabs
          activeTab={
            activeTab
          }
          onProject={
            openProjectTab
          }
          onPlan={
            openPlanTab
          }
          onTeam={
            openTeamTab
          }
          onWorkProgress={
            openWorkProgressTab
          }
        />
        </View>

        {/* --------------------------------------------------------------- */}
        {/* PLAN TAB CONTENT                                                */}
        {/* --------------------------------------------------------------- */}

        {activeTab ===
        "plan" ? (
          isShared ? (
            <ProjectPlanContent
              plannedItems={
                plannedItems
              }
              isShared={
                isShared
              }
              showAssignedScopeEmpty={
                showAssignedScopeEmpty
              }
              projectId={project.id}
              projectName={project.name}
              workPackages={sharedWorkPackages}
              assignments={sharedAssignments}
              members={[]}
              profileByUserId={sharedProfileByUserId}
              measurements={measurements}
              deltas={projectDeltas}
              onOpenPlanItem={(planItemId) =>
                navigation.navigate("PlanItemDetail", {
                  projectId: project.id,
                  planItemId,
                  source: "shared",
                })
              }
            />
          ) : (
            <ProjectPlan
              projectId={
                project.id
              }
              onAddPlanItem={() =>
                navigation.navigate(
                  "PlanAddMethod",
                  {
                    projectId:
                      project.id,
                  },
                )
              }
              onOpenPlanItem={(
                planItemId,
              ) =>
                navigation.navigate(
                  "PlanItemDetail",
                  {
                    projectId:
                      project.id,
                    planItemId,
                  },
                )
              }
            />
          )
        ) : null}

        {/* --------------------------------------------------------------- */}
        {/* TEAM TAB CONTENT                                                */}
        {/* --------------------------------------------------------------- */}

        {activeTab ===
        "team" ? (
          <ProjectTeamContent
            projectId={
              project.id
            }
            isShared={isShared}
            projectNameHint={project.name}
            onInviteMember={() =>
              navigation.navigate(
                "InviteProjectMember",
                {
                  projectId:
                    project.id,
                },
              )
            }
            onOpenMember={(projectMemberId) =>
              navigation.navigate("ProjectTeamMember", {
                projectId: project.id,
                projectMemberId,
              })
            }
            onOpenConversation={(params) =>
              navigation.navigate("ProjectChat", params)
            }
          />
        ) : null}

        {/* --------------------------------------------------------------- */}
        {/* WORK PROGRESS TAB CONTENT                                       */}
        {/* --------------------------------------------------------------- */}

        {activeTab ===
        "workProgress" ? (
          <WorkProgressContent
            projectId={
              project.id
            }
            onOpenWorkPackage={({
              remoteProjectId,
              workPackageId,
            }) =>
              navigation.navigate(
                "WorkProgressDetail",
                {
                  projectId:
                    project.id,
                  remoteProjectId,
                  workPackageId,
                },
              )
            }
          />
        ) : null}

        {/* --------------------------------------------------------------- */}
        {/* PROJECT TAB CONTENT                                             */}
        {/* --------------------------------------------------------------- */}

        {activeTab ===
        "project" ? (
        <ScrollView
          style={
            styles.tabScroll
          }
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
        <View
          style={
            styles.projectTabContent
          }
        >
          <View
            style={
              styles.overviewSurface
            }
          >
            <View
              style={
                styles.overviewMetric
              }
            >
              <Text
                style={
                  styles.smallLabel
                }
              >
                PROGRESS
              </Text>

              <Text
                style={
                  styles.progressNumber
                }
              >
                {project.progress}%
              </Text>
            </View>

            <View
              style={
                styles.overviewDivider
              }
            />

            <View
              style={
                styles.overviewMetric
              }
            >
              <Text
                style={
                  styles.smallLabel
                }
              >
                OPEN DELTAS
              </Text>

              <Text
                style={
                  styles.overviewDeltaNumber
                }
              >
                {
                  deltaSummary.openCount
                }
              </Text>
            </View>

            <View
              style={
                styles.overviewDivider
              }
            />

            <View
              style={
                styles.overviewMetric
              }
            >
              <Text
                style={
                  styles.smallLabel
                }
              >
                TASKS
              </Text>

              <Text
                style={
                  styles.taskNumber
                }
              >
                {
                  project.assignedTasks
                }
              </Text>
            </View>
          </View>

          {!isShared && user?.uid ? (
            <Pressable
              style={styles.progressManagementAction}
              onPress={() => {
                setProgressRemoteProjectId(undefined);
                setProgressMappingFailed(false);
                setProgressManagementVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Manage project progress data"
            >
              <View style={styles.progressManagementIcon}>
                <Ionicons
                  name="trending-up-outline"
                  size={18}
                  color={colors.brand.navy}
                />
              </View>
              <View style={styles.progressManagementCopy}>
                <Text style={styles.progressManagementTitle}>
                  Project progress data
                </Text>
                <Text style={styles.progressManagementDescription}>
                  Manage planned baseline and actual snapshots
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.text.muted}
              />
            </Pressable>
          ) : null}


          <Text
            style={
              styles.sectionTitle
            }
          >
            FIELD OPERATIONS
          </Text>

          {!isShared ? (
            <>
              {(pendingReviewCount >
                0 ||
                readyForReviewCount >
                  0) ? (
                <>
                  <Text
                    style={
                      styles.attentionSectionTitle
                    }
                  >
                    ATTENTION
                  </Text>

                  {pendingReviewCount >
                  0 ? (
                    <Pressable
                      style={
                        styles.attentionCard
                      }
                      onPress={() =>
                        navigation.navigate(
                          "ContributionReview",
                          {
                            projectId:
                              project.id,
                          },
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Needs review, ${pendingReviewCount} pending field submissions`}
                    >
                      <View
                        style={
                          styles.attentionCardHeader
                        }
                      >
                        <View
                          style={
                            styles.attentionIconWrap
                          }
                        >
                          <Ionicons
                            name="alert-circle-outline"
                            size={18}
                            color={
                              colors.danger
                            }
                          />
                        </View>

                        <Text
                          style={
                            styles.attentionEyebrow
                          }
                        >
                          NEEDS REVIEW
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.attentionLine
                        }
                      >
                        {
                          pendingReviewCount
                        }{" "}
                        field
                        submission
                        {pendingReviewCount ===
                        1
                          ? ""
                          : "s"}{" "}
                        pending
                      </Text>

                      <Text
                        style={
                          styles.attentionCta
                        }
                      >
                        Review
                        submissions
                      </Text>
                    </Pressable>
                  ) : null}

                  {readyForReviewCount >
                  0 ? (
                    <Pressable
                      style={
                        styles.attentionCard
                      }
                      onPress={
                        openWorkProgressTab
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Work ready for review, ${readyForReviewCount} assignments`}
                    >
                      <View
                        style={
                          styles.attentionCardHeader
                        }
                      >
                        <View
                          style={
                            styles.attentionIconWrap
                          }
                        >
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={18}
                            color={
                              NAVY
                            }
                          />
                        </View>

                        <Text
                          style={
                            styles.attentionEyebrow
                          }
                        >
                          READY FOR
                          REVIEW
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.attentionLine
                        }
                      >
                        {
                          readyForReviewCount
                        }{" "}
                        assignment
                        {readyForReviewCount ===
                        1
                          ? ""
                          : "s"}{" "}
                        ready for
                        owner review
                      </Text>

                      <Text
                        style={
                          styles.attentionCta
                        }
                      >
                        Open Work
                        Progress
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {/*
               * WORK PROGRESS and PROJECT TEAM
               * cards were intentionally removed
               * from the Project tab because they
               * now live in the tab strip above.
               */}

              <Pressable
                style={
                  styles.primaryAction
                }
                onPress={() =>
                  navigation.navigate(
                    "CaptureProject",
                    {
                      projectId:
                        project.id,
                    },
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Capture field reality"
              >
                <View
                  style={
                    styles.primaryIconWrap
                  }
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color={NAVY}
                  />
                </View>

                <View
                  style={
                    styles.primaryContent
                  }
                >
                  <Text
                    style={
                      styles.primaryTitle
                    }
                  >
                    CAPTURE FIELD
                    REALITY
                  </Text>

                  <Text
                    style={
                      styles.primaryDescription
                    }
                  >
                    Record evidence
                    from the jobsite
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={
                    colors.text.muted
                  }
                />
              </Pressable>

              <Text
                style={
                  styles.sectionTitle
                }
              >
                PROJECT INSIGHTS
              </Text>

              <View
                style={
                  styles.navGroup
                }
              >
                <ProjectNavRow
                  iconName="pulse-outline"
                  title="Field Intelligence"
                  description={`${intelligencePulse.disposition.open} open delta${intelligencePulse.disposition.open === 1 ? "" : "s"} · ${intelligencePulse.evidence} evidence record${intelligencePulse.evidence === 1 ? "" : "s"}${latestMeasurement ? ` · Latest ${latestMeasurement.value.toFixed(2)} ${latestMeasurement.unit}` : " · No measurements yet"}`}
                  onPress={() =>
                    navigation.navigate(
                      "ProjectIntelligence",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                  accessibilityLabel="View field intelligence"
                />

                <ProjectNavRow
                  iconName="document-text-outline"
                  title="Field Reports"
                  description="Build a read-only report from documented field activity."
                  onPress={() =>
                    navigation.navigate(
                      "ProjectFieldReports",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                  accessibilityLabel="View field reports"
                />

                <ProjectNavRow
                  iconName="hardware-chip-outline"
                  title="BuildSigma Intelligence"
                  description="Field-variance analysis runs and summaries."
                  onPress={() =>
                    navigation.navigate(
                      "ProjectAgentActivity",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                  accessibilityLabel="View BuildSigma Intelligence"
                />

                <ProjectNavRow
                  iconName="time-outline"
                  title="Project Activity"
                  description="Everything documented on this project."
                  onPress={() =>
                    navigation.navigate(
                      "ProjectActivity",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                  accessibilityLabel="View project activity"
                  isLast
                />
              </View>
            </>
          ) : (
            <View>
              <View
                style={
                  styles.navGroup
                }
              >
                <ProjectNavRow
                  iconName="time-outline"
                  title="Project Activity"
                  description="Collaboration events for this project."
                  onPress={() =>
                    navigation.navigate(
                      "ProjectActivity",
                      {
                        projectId:
                          project.id,

                        source:
                          "shared",
                      },
                    )
                  }
                  accessibilityLabel="View project activity"
                  isLast
                />
              </View>

              <View
                style={
                  styles.contributionSummary
                }
              >
                <Text
                  style={
                    styles.contributionEyebrow
                  }
                >
                  {canSharedFieldCapture
                    ? "FIELD CONTRIBUTION"
                    : "READ ONLY"}
                </Text>

                <Text
                  style={
                    styles.contributionLine
                  }
                >
                  {
                    intelligencePulse
                      .disposition
                      .open
                  }{" "}
                  open delta
                  {intelligencePulse
                    .disposition
                    .open === 1
                    ? ""
                    : "s"}
                </Text>

                <Text
                  style={
                    styles.contributionLine
                  }
                >
                  {
                    intelligencePulse
                      .evidence
                  }{" "}
                  evidence record
                  {intelligencePulse
                    .evidence ===
                  1
                    ? ""
                    : "s"}
                </Text>

                <Text
                  style={
                    styles.contributionMeta
                  }
                >
                  {latestMeasurement
                    ? `Latest measurement ${latestMeasurement.value.toFixed(
                        2,
                      )} ${latestMeasurement.unit}`
                    : showAssignedScopeEmpty
                      ? "No work has been assigned to you yet."
                      : "No measurements yet"}
                </Text>
              </View>

              {canSharedFieldCapture &&
              sharedCaptureRole ? (
                <Pressable
                  style={
                    styles.primaryAction
                  }
                  onPress={() =>
                    navigation.navigate(
                      "SharedCapture",
                      {
                        remoteProjectId:
                          project.id,

                        membershipRole:
                          sharedCaptureRole,
                      },
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Capture shared field measurement"
                >
                  <View
                    style={
                      styles.primaryIconWrap
                    }
                  >
                    <Ionicons
                      name="add"
                      size={22}
                      color={NAVY}
                    />
                  </View>

                  <View
                    style={
                      styles.primaryContent
                    }
                  >
                    <Text
                      style={
                        styles.primaryTitle
                      }
                    >
                      CAPTURE FIELD
                      REALITY
                    </Text>

                    <Text
                      style={
                        styles.primaryDescription
                      }
                    >
                      Record
                      measurement
                      for your
                      assigned work
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={
                      colors.text.muted
                    }
                  />
                </Pressable>
              ) : null}
            </View>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Existing Grid                                                */}
          {/* ------------------------------------------------------------- */}

          <View
            style={styles.grid}
          >
            {isShared ? (
              <>
                <OperationalShortcut
                  iconName="resize-outline"
                  title="Measurements"
                  description={`${measurements.length} recorded`}
                />

                <OperationalShortcut
                  iconName="trending-up-outline"
                  title="Progress"
                  description={`${project.progress}% complete`}
                />

                <OperationalShortcut
                  iconName="git-compare-outline"
                  title="Deltas"
                  description={`${deltaSummary.openCount} open`}
                />

                <OperationalShortcut
                  iconName="images-outline"
                  title="Field Evidence"
                  description={`${projectEvidence.length} records`}
                />
              </>
            ) : (
              <>
                <OperationalShortcut
                  iconName="resize-outline"
                  title="Measurements"
                  description="Record field dimensions"
                  onPress={() =>
                    navigation.navigate(
                      "ProjectMeasurements",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                />

                <OperationalShortcut
                  iconName="trending-up-outline"
                  title="Progress"
                  description="Track installed quantities"
                />

                <OperationalShortcut
                  iconName="git-compare-outline"
                  title="Deltas"
                  description="Review plan differences"
                  onPress={() =>
                    navigation.navigate(
                      "ProjectDeltas",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                />

                <OperationalShortcut
                  iconName="images-outline"
                  title="Field Evidence"
                  description="Photos & notes"
                  onPress={() =>
                    navigation.navigate(
                      "ProjectEvidence",
                      {
                        projectId:
                          project.id,
                      },
                    )
                  }
                />
              </>
            )}
          </View>

         
          <WorkPackagesSection
            mode={
              isShared
                ? "remote"
                : "local"
            }
            projectId={
              project.id
            }
            ownerUid={
              isShared
                ? undefined
                : user?.uid
            }
            canMutate={
              !isShared &&
              !!user?.uid
            }
            membershipRole={
              isShared
                ? membershipRole
                : undefined
            }
            currentUserId={
              isShared
                ? user?.uid
                : undefined
            }
            planItems={plannedItems.map(
              (item) => ({
                id: item.id,
                label:
                  item.label,
              }),
            )}
          />

          {/* ------------------------------------------------------------- */}
          {/* Delta Summary                                                */}
          {/* ------------------------------------------------------------- */}

          <Text
            style={
              styles.sectionTitle
            }
          >
            DELTA SUMMARY
          </Text>

          {projectDeltas.length ===
          0 ? (
            <Text
              style={
                styles.emptyMeasurements
              }
            >
              {showAssignedScopeEmpty
                ? "No work has been assigned to you yet."
                : "No plan-vs-reality differences recorded yet."}
            </Text>
          ) : (
            <View
              style={
                styles.deltaSummaryCard
              }
            >
              <View
                style={
                  styles.deltaSummaryRow
                }
              >
                <Text
                  style={
                    styles.smallLabel
                  }
                >
                  OPEN
                </Text>

                <Text
                  style={
                    styles.deltaSummaryValue
                  }
                >
                  {
                    deltaSummary.openCount
                  }
                </Text>
              </View>

              <View
                style={
                  styles.deltaSummaryRow
                }
              >
                <Text
                  style={
                    styles.smallLabel
                  }
                >
                  ACCEPTED
                </Text>

                <Text
                  style={
                    styles.deltaSummaryValue
                  }
                >
                  {
                    deltaSummary.acceptedCount
                  }
                </Text>
              </View>

              <View
                style={
                  styles.deltaSummaryRow
                }
              >
                <Text
                  style={
                    styles.smallLabel
                  }
                >
                  COST IMPACT
                </Text>

                <Text
                  style={
                    styles.deltaSummaryValue
                  }
                >
                  {formatSignedCurrency(
                    deltaSummary.totalCostImpact,
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.deltaSummaryRow
                }
              >
                <Text
                  style={
                    styles.smallLabel
                  }
                >
                  SCHEDULE
                  IMPACT
                </Text>

                <Text
                  style={
                    styles.deltaSummaryValue
                  }
                >
                  {formatSignedDays(
                    deltaSummary.totalScheduleImpactDays,
                  )}
                </Text>
              </View>

              <View
                style={[
                  styles.deltaSummaryRow,
                  styles.deltaSummaryRowLast,
                ]}
              >
                <Text
                  style={
                    styles.smallLabel
                  }
                >
                  LABOR IMPACT
                </Text>

                <Text
                  style={
                    styles.deltaSummaryValue
                  }
                >
                  {formatSignedHours(
                    deltaSummary.totalLaborImpactHours,
                  )}
                </Text>
              </View>
            </View>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Recent Measurements                                          */}
          {/* ------------------------------------------------------------- */}

          <Text
            style={
              styles.sectionTitle
            }
          >
            RECENT MEASUREMENTS
          </Text>

          {recentMeasurements.length ===
          0 ? (
            <Text
              style={
                styles.emptyMeasurements
              }
            >
              {showAssignedScopeEmpty
                ? "No work has been assigned to you yet."
                : "No field measurements recorded yet."}
            </Text>
          ) : (
            recentMeasurements.map(
              (
                measurement,
              ) => {
                const planItem =
                  plannedItems.find(
                    (item) =>
                      item.id ===
                      measurement.planItemId,
                  );

                const unitsMatch =
                  !!planItem &&
                  planItem.unit ===
                    measurement.unit;

                const difference =
                  unitsMatch
                    ? calculateDifference(
                        planItem.plannedValue,
                        measurement.value,
                      )
                    : null;

                const percentDifference =
                  unitsMatch
                    ? calculatePercentDifference(
                        planItem.plannedValue,
                        measurement.value,
                      )
                    : null;

                return (
                  <Pressable
                    key={
                      measurement.id
                    }
                    style={
                      styles.measurementCard
                    }
                    onPress={
                      isShared
                        ? undefined
                        : () =>
                            navigation.navigate(
                              "MeasurementDetail",
                              {
                                measurementId:
                                  measurement.id,
                              },
                            )
                    }
                    disabled={
                      isShared
                    }
                  >
                    <View
                      style={
                        styles.measurementCardTop
                      }
                    >
                      <Text
                        style={[
                          styles.measurementLabel,
                          styles.measurementLabelFlex,
                        ]}
                      >
                        {
                          measurement.label
                        }
                      </Text>

                      {isShared ? (
                        <Text
                          style={[
                            styles.reviewStatusChip,
                            {
                              color:
                                measurementReviewStatusColor(
                                  measurement.reviewStatus,
                                ),
                            },
                          ]}
                          accessibilityLabel={formatSubmissionReviewStatusLabel(
                            measurement.reviewStatus,
                          )}
                        >
                          {formatSubmissionReviewStatusLabel(
                            measurement.reviewStatus,
                          )}
                        </Text>
                      ) : null}
                    </View>

                    {planItem ? (
                      <Text
                        style={
                          styles.comparisonLine
                        }
                      >
                        Planned:{" "}
                        {formatPlannedValue(
                          planItem.plannedValue,
                          planItem.unit,
                        )}
                      </Text>
                    ) : (
                      <Text
                        style={
                          styles.comparisonLine
                        }
                      >
                        Planned:
                        unavailable
                      </Text>
                    )}

                    <Text
                      style={
                        styles.comparisonLine
                      }
                    >
                      Field:{" "}
                      {measurement.value.toFixed(
                        2,
                      )}{" "}
                      {
                        measurement.unit
                      }
                    </Text>

                    {planItem &&
                    unitsMatch &&
                    difference !==
                      null ? (
                      <>
                        <Text
                          style={
                            styles.comparisonLine
                          }
                        >
                          Difference:{" "}
                          {formatSignedValue(
                            difference,
                            measurement.unit,
                          )}
                        </Text>

                        <Text
                          style={
                            styles.comparisonLine
                          }
                        >
                          Difference:{" "}
                          {percentDifference ===
                          null
                            ? "n/a"
                            : formatSignedPercent(
                                percentDifference,
                              )}
                        </Text>
                      </>
                    ) : (
                      <Text
                        style={
                          styles.comparisonLine
                        }
                      >
                        {planItem
                          ? "Comparison unavailable (unit mismatch)"
                          : "Comparison unavailable"}
                      </Text>
                    )}

                    {isShared &&
                    effectiveMeasurementReviewStatus(
                      measurement.reviewStatus,
                    ) ===
                      "rejected" &&
                    measurement.reviewNote?.trim() ? (
                      <View
                        style={
                          styles.rejectionNoteBlock
                        }
                      >
                        <Text
                          style={
                            styles.rejectionNoteLabel
                          }
                        >
                          Owner feedback
                        </Text>

                        <Text
                          style={
                            styles.rejectionNoteText
                          }
                        >
                          {measurement.reviewNote.trim()}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              },
            )
          )}
        </View>
      </ScrollView>
        ) : null}
      </View>
      {!isShared && user?.uid ? (
        <ProjectProgressManagementModal
          remoteProjectId={progressRemoteProjectId}
          mappingError={progressMappingFailed}
          visible={progressManagementVisible}
          onClose={() => setProgressManagementVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    chrome: {
      paddingHorizontal: 20,
    },

    tabScroll: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 0,
      paddingBottom: 50,
    },

    /* ---------------------------------------------------------------------- */
    /* Top Bar                                                                */
    /* ---------------------------------------------------------------------- */

    topBar: {
      flexDirection: "column",
      alignItems: "stretch",
      paddingTop: 18,
      paddingBottom: 8,
      gap: 12,
    },

    topNavigationBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 42,
    },

    projectsBackButton: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingRight: 8,
    },

    projectsBackText: {
      ...typography.bodyMedium,
      color: KEPLER_NAVY,
    },

    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    headerIconButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },

    projectIdentity: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },

    projectAvatarWrap: {
      width: 76,
      height: 76,
      flexShrink: 0,
    },

    projectAvatar: {
      width: "100%",
      height: "100%",
      borderRadius: 14,
    },

    projectAvatarFallback: {
      width: "100%",
      height: "100%",
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(1,33,105,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(1,33,105,0.10)",
    },

    projectIdentityText: {
      flex: 1,
      minWidth: 0,
    },

    topBarCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },

    topBarRight: {
      minWidth: 42,
      flexShrink: 0,
      alignItems: "flex-end",
      justifyContent: "flex-start",
      paddingTop: 2,
    },

    glassButtonOuter: {
      overflow: "hidden",
      borderRadius: 999,
      backgroundColor:
        "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor:
        "rgba(255,255,255,0.76)",
      shadowColor: "#344054",
      shadowOpacity:
        Platform.OS === "ios"
          ? 0.11
          : 0.08,
      shadowRadius: 14,
      shadowOffset: {
        width: 0,
        height: 6,
      },
      elevation: 4,
    },

    glassButtonHighlight: {
      position: "absolute",
      top: 1,
      left: 9,
      right: 9,
      height: 13,
      borderRadius: 999,
      backgroundColor:
        "rgba(255,255,255,0.15)",
      borderTopWidth: 1,
      borderTopColor:
        "rgba(255,255,255,0.72)",
    },

    glassButtonInner: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        "transparent",
    },

    glassEditButton: {
      minHeight: 42,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor:
        "transparent",
    },

    glassEditButtonText: {
      ...typography.button,
      color: colors.text.primary,
    },

    glassButtonPressed: {
      backgroundColor:
        "rgba(255,255,255,0.16)",
      transform: [
        { scale: 0.97 },
      ],
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 100,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    backButtonText: {
      ...typography.title,
      color:
        colors.text.primary,
    },

    topBarTitle: {
      ...typography.title,
      fontSize: 19,
      lineHeight: 24,
      color:
        colors.text.primary,
      textAlign: "left",
    },

    topBarLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      marginTop: 3,
      minWidth: 0,
    },

    topBarLocation: {
      ...typography.caption,
      color:
        colors.text.secondary,
      textAlign: "left",
      flexShrink: 1,
    },

    projectStatusPill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 7,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: "#F2F4F7",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },

    projectStatusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.brand.blue,
    },

    projectStatusText: {
      ...typography.caption,
      color: colors.text.secondary,
      lineHeight: 16,
    },

    topBarPlaceholder: {
      width: 42,
    },

    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    header: {
      marginTop: 8,
    },

    label: {
      ...typography.caption,
      color: colors.brand.navy,
    },

    title: {
      ...typography.display,
      color:
        colors.text.primary,
      marginTop: 8,
    },

    location: {
      ...typography.bodyLarge,
      color:
        colors.text.secondary,
      marginTop: 6,
    },

    sharedMeta: {
      ...typography.caption,
      marginTop: 5,
      color:
        colors.text.secondary,
    },

    sharedLoadingText: {
      ...typography.body,
      marginTop: 24,
      color:
        colors.text.secondary,
    },

    retryButton: {
      marginTop: 16,

      alignSelf:
        "flex-start",

      paddingHorizontal: 14,
      paddingVertical: 10,

      borderRadius: 10,

      borderWidth: 1,
      borderColor:
        colors.border,

      backgroundColor:
        colors.surface,
    },

    retryButtonText: {
      ...typography.button,
      color:
        colors.text.primary,
    },

    editProjectButton: {
      alignSelf: "flex-start",
      marginTop: 14,
      backgroundColor:
        colors.surface,
      borderRadius: 100,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },

    editProjectButtonText: {
      ...typography.button,
      color: colors.text.primary,
    },

    /* ---------------------------------------------------------------------- */
    /* Project Tabs                                                           */
    /* ---------------------------------------------------------------------- */

    tabsContainer: {
      marginTop: 0,

      minHeight: 48,

      flexDirection: "row",

      alignItems: "stretch",

      borderBottomWidth:
        StyleSheet.hairlineWidth,

      borderBottomColor:
        colors.border,
    },

    tabButton: {
      flex: 1,

      minHeight: 48,

      alignItems: "center",

      justifyContent:
        "center",

      position: "relative",

      paddingHorizontal: 4,
    },

    tabLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      maxWidth: "100%",
    },

    tabText: {
      ...typography.button,
      color:
        colors.text.muted,
      textAlign: "center",
      flexShrink: 1,
    },

    tabTextActive: {
      ...typography.button,
      color:
        colors.text.primary,
    },

    tabIndicator: {
      position: "absolute",
      left: 8,
      right: 8,
      bottom: -1,
      height: 2,
      borderRadius: 999,
      backgroundColor:
        colors.brand.navy,
    },

    projectTabContent: {
      paddingTop: 2,
    },

    /* ---------------------------------------------------------------------- */
    /* Project Overview                                                       */
    /* ---------------------------------------------------------------------- */

    overviewSurface: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 16,
      paddingVertical: 20,
      paddingHorizontal: 12,
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      shadowColor: "#101828",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      elevation: 1,
    },

    overviewMetric: {
      flex: 1,
      alignItems: "center",
    },

    overviewDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor:
        colors.border,
      marginVertical: 4,
    },

    progressCard: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 14,
      padding: 18,
      marginTop: 24,
      flexDirection: "row",
      justifyContent:
        "space-between",
    },

    smallLabel: {
      ...typography.metadata,
      color:
        colors.text.muted,
    },

    progressNumber: {
      ...typography.display,
      color:
        colors.text.primary,
      marginTop: 6,
    },

    overviewDeltaNumber: {
      ...typography.display,
      color: colors.brand.navy,
      marginTop: 6,
    },

    deltaNumber: {
      ...typography.display,
      color: colors.brand.navy,
      marginTop: 5,
    },

    taskNumber: {
      ...typography.display,
      color: colors.success,
      marginTop: 5,
    },

    sectionTitle: {
      ...typography.caption,
      color:
        colors.brand.navy,
      marginTop: 28,
      marginBottom: 10,
      letterSpacing: 0.4,
    },

    /* ---------------------------------------------------------------------- */
    /* Primary Action                                                         */
    /* ---------------------------------------------------------------------- */

    primaryAction: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      paddingVertical: 18,
      paddingHorizontal: 16,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: {
        width: 0,
        height: 3,
      },
      elevation: 2,
    },

    primaryIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor:
        "#F2F4F7",
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },

    primaryIcon: {
      fontSize: 32,
      marginRight: 16,
      color:
        colors.text.primary,
    },

    primaryContent: {
      flex: 1,
      paddingRight: 8,
    },

    primaryTitle: {
      ...typography.bodyMedium,
      color:
        colors.brand.navy,
    },

    primaryDescription: {
      ...typography.caption,
      color:
        colors.text.secondary,
      marginTop: 3,
    },

    /* ---------------------------------------------------------------------- */
    /* Navigation Group                                                       */
    /* ---------------------------------------------------------------------- */

    navGroup: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 16,
      overflow: "hidden",
    },

    navRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        colors.border,
      gap: 12,
    },

    navRowLast: {
      borderBottomWidth: 0,
    },

    navRowIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor:
        "#F9FAFB",
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    navRowContent: {
      flex: 1,
    },

    navRowTitle: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
    },

    navRowDescription: {
      ...typography.caption,
      color:
        colors.text.secondary,
      marginTop: 2,
    },

    /* ---------------------------------------------------------------------- */
    /* Attention                                                              */
    /* ---------------------------------------------------------------------- */

    intelligenceCard: {
      backgroundColor:
        colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 16,
      marginBottom: 14,
    },

    attentionSectionTitle: {
      ...typography.caption,
      color: colors.brand.navy,
      marginBottom: 10,
      letterSpacing: 0.4,
    },

    attentionCard: {
      backgroundColor:
        "#FAFBFC",
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 14,
      marginBottom: 10,
    },

    attentionCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },

    attentionIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    attentionEyebrow: {
      ...typography.caption,
      color: colors.brand.navy,
    },

    attentionLine: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
      marginBottom: 6,
    },

    attentionCta: {
      ...typography.button,
      color: colors.brand.navy,
    },

    contributionSummary: {
      backgroundColor:
        colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 16,
      marginBottom: 14,
    },

    contributionEyebrow: {
      ...typography.caption,
      color: colors.brand.navy,
      marginBottom: 10,
    },

    contributionLine: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
      marginBottom: 4,
    },

    contributionMeta: {
      ...typography.caption,
      color:
        colors.text.secondary,
      marginTop: 4,
    },

    intelligenceEyebrow: {
      ...typography.caption,
      color: colors.brand.navy,
      marginBottom: 10,
    },

    intelligenceLine: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
      marginBottom: 4,
    },

    intelligenceMeta: {
      ...typography.caption,
      color:
        colors.text.secondary,
      marginTop: 4,
      marginBottom: 12,
    },

    intelligenceCta: {
      ...typography.button,
      color: colors.brand.navy,
    },

    /* ---------------------------------------------------------------------- */
    /* Grid                                                                   */
    /* ---------------------------------------------------------------------- */

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent:
        "space-between",
      paddingBottom: 8,
      marginTop: 8,
    },

    progressManagementAction: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: 12,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },

    progressManagementIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: "#F2F4F7",
      alignItems: "center",
      justifyContent: "center",
    },

    progressManagementCopy: {
      flex: 1,
    },

    progressManagementTitle: {
      ...typography.bodyMedium,
      color: colors.text.primary,
    },

    progressManagementDescription: {
      ...typography.caption,
      color: colors.text.secondary,
      marginTop: 2,
    },

    action: {
      width: "48%",
      backgroundColor:
        colors.surface,
      borderColor:
        colors.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginTop: 12,
      minHeight: 112,
      justifyContent:
        "space-between",
    },

    actionIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor:
        "#F9FAFB",
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },

    actionIcon: {
      fontSize: 27,
    },

    actionTitle: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
    },

    actionDescription: {
      ...typography.caption,
      color:
        colors.text.secondary,
      marginTop: 4,
    },

    /* ---------------------------------------------------------------------- */
    /* Delta Summary                                                          */
    /* ---------------------------------------------------------------------- */

    emptyMeasurements: {
      ...typography.caption,
      color:
        colors.text.secondary,
    },

    deltaSummaryCard: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },

    deltaSummaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingVertical: 8,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        colors.border,
    },

    deltaSummaryRowLast: {
      borderBottomWidth: 0,
      paddingBottom: 4,
    },

    deltaSummaryValue: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
    },

    /* ---------------------------------------------------------------------- */
    /* Measurements                                                           */
    /* ---------------------------------------------------------------------- */

    measurementRow: {
      backgroundColor:
        colors.surface,

      borderWidth: 1,

      borderColor:
        colors.border,

      borderRadius: 14,

      padding: 16,

      marginBottom: 10,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",
    },

    measurementCard: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      shadowColor: "#101828",
      shadowOpacity: 0.03,
      shadowRadius: 6,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      elevation: 1,
    },

    planItemTextBlock: {
      flex: 1,

      paddingRight: 12,
    },

    measurementLabel: {
      ...typography.bodyMedium,
      color:
        colors.text.primary,
      marginBottom: 4,
    },

    measurementCardTop: {
      flexDirection: "row",

      alignItems:
        "flex-start",

      justifyContent:
        "space-between",

      gap: 8,

      marginBottom: 4,
    },

    measurementLabelFlex: {
      flex: 1,

      marginBottom: 0,
    },

    reviewStatusChip: {
      ...typography.caption,
    },

    rejectionNoteBlock: {
      marginTop: 10,

      paddingTop: 10,

      borderTopWidth: 1,

      borderTopColor:
        colors.border,

      gap: 4,
    },

    rejectionNoteLabel: {
      ...typography.caption,
      color:
        colors.text.muted,
    },

    rejectionNoteText: {
      ...typography.caption,
      color:
        colors.text.secondary,
    },

    planItemEditHint: {
      ...typography.caption,
      color:
        colors.text.secondary,
    },

    measurementValue: {
      ...typography.bodyMedium,
      color: colors.brand.navy,
    },

    comparisonLine: {
      ...typography.caption,
      color:
        colors.text.secondary,
    },
  });
