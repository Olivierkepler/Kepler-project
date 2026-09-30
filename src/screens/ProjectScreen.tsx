import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Image,
  Modal,
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
import WorkProgressContent from "../components/project/WorkProgressContent";
import { ProjectActivityContent } from "./ProjectActivityScreen";

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
  type UserPresentationRecord,
} from "../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../utils/domain/memberPresentationContext";
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
  const [projectToolsVisible, setProjectToolsVisible] = useState(false);
  const pendingProjectToolAction = useRef<(() => void) | null>(null);
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
        setSharedWorkPackages([]);
        setSharedAssignments([]);
        setSharedProfileByUserId(new Map());
        setSharedError(null);
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

        }

      }

      async function loadShared() {
        setProject(undefined);

        setSharedError(null);

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

  const projectToolActions = !isShared && user?.uid
    ? [
        {
          label: "Capture Field Data",
          icon: "camera-outline" as const,
          onPress: () => navigation.navigate("CaptureProject", { projectId }),
        },
        {
          label: "Measurements",
          icon: "resize-outline" as const,
          onPress: () => navigation.navigate("ProjectMeasurements", { projectId }),
        },
        {
          label: "Field Evidence",
          icon: "images-outline" as const,
          onPress: () => navigation.navigate("ProjectEvidence", { projectId }),
        },
        {
          label: "Field Reports",
          icon: "document-text-outline" as const,
          onPress: () => navigation.navigate("ProjectFieldReports", { projectId }),
        },
        {
          label: "Intelligence",
          icon: "pulse-outline" as const,
          onPress: () => navigation.navigate("ProjectIntelligence", { projectId }),
        },
        {
          label: "Agent Activity",
          icon: "hardware-chip-outline" as const,
          onPress: () => navigation.navigate("ProjectAgentActivity", { projectId }),
        },
        {
          label: "Manage Progress Data",
          icon: "trending-up-outline" as const,
          onPress: () => setProgressManagementVisible(true),
        },
      ]
    : canSharedFieldCapture && sharedCaptureRole
      ? [
          {
            label: "Capture Field Data",
            icon: "camera-outline" as const,
            onPress: () => navigation.navigate("SharedCapture", {
              remoteProjectId: projectId,
              membershipRole: sharedCaptureRole,
            }),
          },
        ]
      : [];

  const closeProjectToolsAndRun = (action: () => void) => {
    pendingProjectToolAction.current = action;
    setProjectToolsVisible(false);
    // Android does not invoke Modal.onDismiss consistently across supported
    // React Native versions, so keep a short fallback after its close motion.
    setTimeout(() => {
      const pendingAction = pendingProjectToolAction.current;
      pendingProjectToolAction.current = null;
      pendingAction?.();
    }, 350);
  };

  const runPendingProjectToolAction = () => {
    const pendingAction = pendingProjectToolAction.current;
    pendingProjectToolAction.current = null;
    pendingAction?.();
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

              {projectToolActions.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    pressed && styles.glassButtonPressed,
                  ]}
                  onPress={() => setProjectToolsVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Project tools"
                  hitSlop={8}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={21}
                    color={KEPLER_NAVY}
                  />
                </Pressable>
              ) : null}

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

        {activeTab === "project" ? (
          <ProjectActivityContent
            projectId={project.id}
            source={isShared ? "shared" : "local"}
            embedded
          />
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

      <Modal
        visible={projectToolsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProjectToolsVisible(false)}
        onDismiss={runPendingProjectToolAction}
      >
        <Pressable
          style={styles.projectToolsBackdrop}
          onPress={() => setProjectToolsVisible(false)}
          accessible={false}
        >
          <Pressable
            style={styles.projectToolsSheet}
            onPress={(event) => event.stopPropagation()}
            accessible={false}
          >
            <View style={styles.projectToolsHeader}>
              <Text style={styles.projectToolsTitle}>Project Tools</Text>
              <Pressable
                onPress={() => setProjectToolsVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close project tools"
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.projectToolsList}
              showsVerticalScrollIndicator={false}
            >
              {projectToolActions.map((action) => (
                <Pressable
                  key={action.label}
                  style={({ pressed }) => [
                    styles.projectToolsRow,
                    pressed && styles.projectToolsRowPressed,
                  ]}
                  onPress={() => {
                    closeProjectToolsAndRun(action.onPress);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Ionicons name={action.icon} size={19} color={KEPLER_NAVY} />
                  <Text style={styles.projectToolsRowText}>{action.label}</Text>
                  <Ionicons name="chevron-forward" size={17} color={colors.text.muted} />
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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

    projectToolsBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(15,23,42,0.28)",
      paddingHorizontal: 16,
      paddingBottom: 24,
    },

    projectToolsSheet: {
      maxHeight: "78%",
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 16,
    },

    projectToolsHeader: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },

    projectToolsTitle: {
      ...typography.title,
      color: colors.text.primary,
    },

    projectToolsList: {
      flexGrow: 0,
    },

    projectToolsRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    projectToolsRowPressed: {
      opacity: 0.68,
    },

    projectToolsRowText: {
      ...typography.bodyMedium,
      color: colors.text.primary,
      flex: 1,
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
