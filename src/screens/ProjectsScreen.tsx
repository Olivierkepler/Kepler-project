import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Animated,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import KeplerLogo from "../components/branding/KeplerLogo1";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import type {
  BottomTabScreenProps,
} from "@react-navigation/bottom-tabs";

import {
  useFocusEffect,
  type CompositeScreenProps,
} from "@react-navigation/native";

import type {
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";

import type {
  MainTabParamList,
  RootStackParamList,
} from "../navigation/types";

import {
  getMyInvitations,
} from "../services/api/invitations";

import {
  getMyDiscoveredProjects,
} from "../services/api/projects";

import {
  getDeltas,
} from "../store/deltas";

import {
  getProjects,
  isProjectArchived,
} from "../store/projects";

import type {
  DiscoveredProject,
} from "../types/discoveredProject";

import type {
  Project,
  ProjectStatus,
} from "../types/project";

import {
  summarizeDeltas,
} from "../utils/domain/summarizeDeltas";

import {
  formatProjectMemberRoleLabel,
} from "../utils/domain/memberRoleLabels";

import { typography } from "../theme/colors";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Props = CompositeScreenProps<
  BottomTabScreenProps<
    MainTabParamList,
    "Projects"
  >,
  NativeStackScreenProps<RootStackParamList>
>;

type ProjectScopeFilter =
  | "all"
  | "created"
  | "assigned";

type ProjectWorkspaceMode =
  | "current"
  | "archived";

type ProjectStatusFilter =
  | "any"
  | ProjectStatus;

type ProjectSortMode =
  | "recent"
  | "newest"
  | "oldest"
  | "name"
  | "progress";

type ProjectListEntry = {
  key: string;
  source: "created" | "assigned";
  id: string;
  name: string;
  location: string;
  status: ProjectStatus;
  progress: number;
  avatarUri?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  original: Project | DiscoveredProject;
};

const STATUS_FILTER_OPTIONS: readonly ProjectStatusFilter[] =
  [
    "any",
    "active",
    "planning",
    "on-hold",
    "completed",
  ] as const;

const SCOPE_FILTER_OPTIONS: readonly {
  key: ProjectScopeFilter;
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "assigned", label: "Assigned" },
] as const;

function projectToListEntry(
  project: Project,
): ProjectListEntry {
  return {
    key: `created:${project.id}`,
    source: "created",
    id: project.id,
    name: project.name,
    location: project.location,
    status: project.status,
    progress: project.progress,
    avatarUri: project.avatarUri,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
    original: project,
  };
}

function discoveredToListEntry(
  project: DiscoveredProject,
): ProjectListEntry {
  return {
    key: `assigned:${project.id}`,
    source: "assigned",
    id: project.id,
    name: project.name,
    location: project.location,
    status: project.status,
    progress: 0,
    original: project,
  };
}

function parseTimestamp(
  value?: string,
): number | null {
  if (!value) {
    return null;
  }

  const parsed =
    Date.parse(value);

  return Number.isNaN(parsed)
    ? null
    : parsed;
}

function compareTimestampDesc(
  aValue: number | null,
  bValue: number | null,
  aIndex: number,
  bIndex: number,
): number {
  if (
    aValue != null &&
    bValue != null
  ) {
    if (aValue !== bValue) {
      return bValue - aValue;
    }

    return aIndex - bIndex;
  }

  if (
    aValue != null &&
    bValue == null
  ) {
    return -1;
  }

  if (
    aValue == null &&
    bValue != null
  ) {
    return 1;
  }

  return aIndex - bIndex;
}

function compareTimestampAsc(
  aValue: number | null,
  bValue: number | null,
  aIndex: number,
  bIndex: number,
): number {
  if (
    aValue != null &&
    bValue != null
  ) {
    if (aValue !== bValue) {
      return aValue - bValue;
    }

    return aIndex - bIndex;
  }

  if (
    aValue != null &&
    bValue == null
  ) {
    return -1;
  }

  if (
    aValue == null &&
    bValue != null
  ) {
    return 1;
  }

  return aIndex - bIndex;
}

function sortProjectEntries(
  items: readonly ProjectListEntry[],
  mode: ProjectSortMode,
): ProjectListEntry[] {
  const indexed = items.map(
    (item, index) => ({
      item,
      index,
    }),
  );

  switch (mode) {
    case "recent":
      return indexed
        .sort((a, b) =>
          compareTimestampDesc(
            parseTimestamp(
              a.item.updatedAt ??
                a.item.createdAt,
            ),
            parseTimestamp(
              b.item.updatedAt ??
                b.item.createdAt,
            ),
            a.index,
            b.index,
          ),
        )
        .map(
          (entry) =>
            entry.item,
        );

    case "newest":
      return indexed
        .sort((a, b) =>
          compareTimestampDesc(
            parseTimestamp(
              a.item.createdAt,
            ),
            parseTimestamp(
              b.item.createdAt,
            ),
            a.index,
            b.index,
          ),
        )
        .map(
          (entry) =>
            entry.item,
        );

    case "oldest":
      return indexed
        .sort((a, b) =>
          compareTimestampAsc(
            parseTimestamp(
              a.item.createdAt,
            ),
            parseTimestamp(
              b.item.createdAt,
            ),
            a.index,
            b.index,
          ),
        )
        .map(
          (entry) =>
            entry.item,
        );

    case "name":
      return indexed
        .sort((a, b) => {
          const byName =
            a.item.name.localeCompare(
              b.item.name,
              undefined,
              {
                sensitivity:
                  "base",
              },
            );

          if (byName !== 0) {
            return byName;
          }

          return (
            a.index -
            b.index
          );
        })
        .map(
          (entry) =>
            entry.item,
        );

    case "progress":
      return indexed
        .sort((a, b) => {
          const byProgress =
            b.item.progress -
            a.item.progress;

          if (
            byProgress !==
            0
          ) {
            return byProgress;
          }

          return (
            a.index -
            b.index
          );
        })
        .map(
          (entry) =>
            entry.item,
        );
  }
}

function statusFilterLabel(
  status: ProjectStatusFilter,
): string {
  switch (status) {
    case "any":
      return "Any";

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

function sortModeLabel(
  mode: ProjectSortMode,
): string {
  switch (mode) {
    case "recent":
      return "Recent";

    case "newest":
      return "Newest";

    case "oldest":
      return "Oldest";

    case "name":
      return "Name A-Z";

    case "progress":
      return "Progress";
  }
}

function emptyStateTitle(
  workspaceMode: ProjectWorkspaceMode,
  scope: ProjectScopeFilter,
  status: ProjectStatusFilter,
): string {
  if (workspaceMode === "archived") {
    if (status !== "any") {
      switch (status) {
        case "active":
          return "No active archived projects";

        case "planning":
          return "No planning archived projects";

        case "on-hold":
          return "No on hold archived projects";

        case "completed":
          return "No completed archived projects";

        default:
          break;
      }
    }

    return "No archived projects";
  }

  if (status !== "any") {
    switch (status) {
      case "active":
        return "No active projects";

      case "planning":
        return "No planning projects";

      case "on-hold":
        return "No on hold projects";

      case "completed":
        return "No completed projects";

      default:
        break;
    }
  }

  switch (scope) {
    case "all":
      return "No projects yet";

    case "created":
      return "No projects created yet";

    case "assigned":
      return "No projects assigned to you";
  }
}

function emptyStateMessage(
  workspaceMode: ProjectWorkspaceMode,
  scope: ProjectScopeFilter,
  status: ProjectStatusFilter,
): string {
  if (workspaceMode === "archived") {
    if (status !== "any") {
      return "Try another status filter or restore a project from Archived.";
    }

    return "Projects you archive will appear here and can be restored at any time.";
  }

  if (status !== "any") {
    return "Try another status filter or create a new project.";
  }

  switch (scope) {
    case "all":
      return "Create your first project to start tracking field activity.";

    case "created":
      return "Create a project to organize plans, measurements, and field work.";

    case "assigned":
      return "Projects you are invited to will appear here after acceptance.";
  }
}

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

/* -------------------------------------------------------------------------- */
/* Background                                                                 */
/* -------------------------------------------------------------------------- */

const PROJECTS_BACKGROUND =
  require("../../assets/bg1.png");

function ProjectListAvatar({
  avatarUri,
}: {
  avatarUri?: string | null;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (avatarUri && failedUri !== avatarUri) {
    return (
      <Image
        source={{
          uri: avatarUri,
        }}
        style={
          styles.projectAvatarImage
        }
        resizeMode="cover"
        onError={() => setFailedUri(avatarUri)}
      />
    );
  }

  return (
    <View
      style={
        styles.projectAvatarFallback
      }
    >
      <Ionicons
        name="business-outline"
        size={22}
        color="#012169"
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Projects Screen                                                            */
/* -------------------------------------------------------------------------- */

export default function ProjectsScreen({
  navigation,
}: Props) {
  const { user } = useAuth();

  /* ------------------------------------------------------------------------ */
  /* Sticky Header Animation                                                  */
  /* ------------------------------------------------------------------------ */

  const scrollY = useRef(
    new Animated.Value(0),
  ).current;

  const [
    headerHeight,
    setHeaderHeight,
  ] = useState(84);

  /**
   * Header stays transparent at the top.
   * Glass progressively appears as
   * content scrolls underneath.
   */
  const glassOpacity =
    scrollY.interpolate({
      inputRange: [
        0,
        8,
        34,
        72,
      ],

      outputRange: [
        0,
        0.06,
        0.56,
        1,
      ],

      extrapolate:
        "clamp",
    });

  const borderOpacity =
    scrollY.interpolate({
      inputRange: [
        10,
        40,
        72,
      ],

      outputRange: [
        0,
        0.3,
        1,
      ],

      extrapolate:
        "clamp",
    });

  const shadowOpacity =
    scrollY.interpolate({
      inputRange: [
        22,
        72,
      ],

      outputRange: [
        0,
        0.075,
      ],

      extrapolate:
        "clamp",
    });

  /* ------------------------------------------------------------------------ */
  /* Project Data                                                             */
  /* ------------------------------------------------------------------------ */

  const [
    projects,
    setProjects,
  ] = useState<Project[]>([]);

  const [
    openDeltaCounts,
    setOpenDeltaCounts,
  ] = useState<
    Map<string, number>
  >(
    () => new Map(),
  );

  const [
    discovered,
    setDiscovered,
  ] = useState<
    DiscoveredProject[]
  >([]);

  const [
    discoveryLoading,
    setDiscoveryLoading,
  ] = useState(false);

  const [
    discoveryError,
    setDiscoveryError,
  ] = useState<
    string | null
  >(null);

  const [
    pendingInvitationCount,
    setPendingInvitationCount,
  ] = useState(0);

  const [
    scopeFilter,
    setScopeFilter,
  ] =
    useState<ProjectScopeFilter>(
      "all",
    );

  const [
    workspaceMode,
    setWorkspaceMode,
  ] =
    useState<ProjectWorkspaceMode>(
      "current",
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<ProjectStatusFilter>(
      "any",
    );

  const [
    sortMode,
    setSortMode,
  ] =
    useState<ProjectSortMode>(
      "recent",
    );

  /* ------------------------------------------------------------------------ */
  /* Load Data                                                                */
  /* ------------------------------------------------------------------------ */

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProjects([]);

        setOpenDeltaCounts(
          new Map(),
        );

        setDiscovered([]);

        setDiscoveryError(
          null,
        );

        setDiscoveryLoading(
          false,
        );

        setPendingInvitationCount(
          0,
        );

        return;
      }

      const ownerUid =
        user.uid;

      let active = true;

      async function loadLocal() {
        const [
          items,
          deltas,
        ] =
          await Promise.all([
            getProjects(
              ownerUid,
            ),

            getDeltas(
              ownerUid,
            ),
          ]);

        if (!active) {
          return;
        }

        const counts =
          new Map<
            string,
            number
          >();

        for (
          const project
          of items
        ) {
          const summary =
            summarizeDeltas(
              deltas.filter(
                (delta) =>
                  delta.projectId ===
                  project.id,
              ),
            );

          counts.set(
            project.id,
            summary.openCount,
          );
        }

        setProjects(items);

        setOpenDeltaCounts(
          counts,
        );
      }

      async function loadDiscovery() {
        setDiscoveryLoading(
          true,
        );

        setDiscoveryError(
          null,
        );

        try {
          const items =
            await getMyDiscoveredProjects();

          if (!active) {
            return;
          }

          setDiscovered(
            items,
          );
        } catch {
          if (!active) {
            return;
          }

          setDiscovered([]);

          setDiscoveryError(
            "Unable to load shared projects.",
          );
        } finally {
          if (active) {
            setDiscoveryLoading(
              false,
            );
          }
        }
      }

      async function loadInvitations() {
        try {
          const invitations =
            await getMyInvitations();

          if (!active) {
            return;
          }

          setPendingInvitationCount(
            invitations.filter(
              (item) =>
                item.status ===
                "pending",
            ).length,
          );
        } catch {
          /**
           * Keep last known count.
           * Never convert a request
           * failure into an empty state.
           */
        }
      }

      void loadLocal();
      void loadDiscovery();
      void loadInvitations();

      return () => {
        active = false;
      };
    }, [user?.uid]),
  );

  /* ------------------------------------------------------------------------ */
  /* Shared Projects                                                          */
  /* ------------------------------------------------------------------------ */

  const sharedProjects =
    useMemo(() => {
      if (!user?.uid) {
        return [];
      }

      return discovered.filter(
        (project) =>
          project.ownerUid !==
          user.uid,
      );
    }, [
      discovered,
      user?.uid,
    ]);

  const createdProjectEntries =
    useMemo(
      () =>
        projects.map(
          projectToListEntry,
        ),
      [projects],
    );

  const currentCreatedEntries =
    useMemo(
      () =>
        createdProjectEntries.filter(
          (entry) =>
            !isProjectArchived(
              entry,
            ),
        ),
      [createdProjectEntries],
    );

  const archivedCreatedEntries =
    useMemo(
      () =>
        createdProjectEntries.filter(
          (entry) =>
            isProjectArchived(
              entry,
            ),
        ),
      [createdProjectEntries],
    );

  const assignedProjectEntries =
    useMemo(() => {
      if (
        workspaceMode ===
        "archived"
      ) {
        // DiscoveredProject has no archivedAt — do not invent remote archive.
        return [];
      }

      return sharedProjects.map(
        discoveredToListEntry,
      );
    }, [
      sharedProjects,
      workspaceMode,
    ]);

  const scopedCreatedEntries =
    workspaceMode ===
    "archived"
      ? archivedCreatedEntries
      : currentCreatedEntries;

  const allProjectEntries =
    useMemo(() => {
      const createdLocalIds =
        new Set(
          scopedCreatedEntries.map(
            (entry) =>
              entry.id,
          ),
        );

      const dedupedAssigned =
        assignedProjectEntries.filter(
          (entry) => {
            const discoveredProject =
              entry.original as DiscoveredProject;

            return (
              !createdLocalIds.has(
                discoveredProject.localProjectId,
              ) &&
              !createdLocalIds.has(
                entry.id,
              )
            );
          },
        );

      return [
        ...scopedCreatedEntries,
        ...dedupedAssigned,
      ];
    }, [
      scopedCreatedEntries,
      assignedProjectEntries,
    ]);

  const scopeBaseProjects =
    useMemo(() => {
      switch (scopeFilter) {
        case "created":
          return scopedCreatedEntries;

        case "assigned":
          return assignedProjectEntries;

        case "all":
        default:
          return allProjectEntries;
      }
    }, [
      scopeFilter,
      scopedCreatedEntries,
      assignedProjectEntries,
      allProjectEntries,
    ]);

  const visibleProjects =
    useMemo(() => {
      let items =
        scopeBaseProjects;

      if (
        statusFilter !==
        "any"
      ) {
        items =
          items.filter(
            (entry) =>
              entry.status ===
              statusFilter,
          );
      }

      return sortProjectEntries(
        items,
        sortMode,
      );
    }, [
      scopeBaseProjects,
      statusFilter,
      sortMode,
    ]);

  const scopeCounts =
    useMemo(
      () => ({
        all: allProjectEntries.length,
        created:
          scopedCreatedEntries.length,
        assigned:
          assignedProjectEntries.length,
      }),
      [
        allProjectEntries.length,
        scopedCreatedEntries.length,
        assignedProjectEntries.length,
      ],
    );

  const archivedCount =
    archivedCreatedEntries.length;

  const showAssignedDiscoveryStatus =
    workspaceMode ===
      "current" &&
    (scopeFilter ===
      "assigned" ||
      scopeFilter === "all");

  const openSortMenu =
    useCallback(() => {
      Alert.alert(
        "Sort projects",
        undefined,
        [
          {
            text: "Recent",
            onPress: () =>
              setSortMode(
                "recent",
              ),
          },
          {
            text: "Newest",
            onPress: () =>
              setSortMode(
                "newest",
              ),
          },
          {
            text: "Oldest",
            onPress: () =>
              setSortMode(
                "oldest",
              ),
          },
          {
            text: "Name A-Z",
            onPress: () =>
              setSortMode(
                "name",
              ),
          },
          {
            text: "Progress",
            onPress: () =>
              setSortMode(
                "progress",
              ),
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ],
      );
    }, []);

  const handleSharedPress = (
    item: DiscoveredProject,
  ) => {
    navigation
      .getParent()
      ?.navigate(
        "Project",
        {
          projectId:
            item.id,

          source:
            "shared",

          membershipRole:
            item.membership
              .role,
        },
      );
  };

  const retryDiscovery =
    () => {
      if (!user?.uid) {
        return;
      }

      setDiscoveryLoading(
        true,
      );

      setDiscoveryError(
        null,
      );

      void (async () => {
        try {
          const items =
            await getMyDiscoveredProjects();

          setDiscovered(
            items,
          );
        } catch {
          setDiscovered([]);

          setDiscoveryError(
            "Unable to load shared projects.",
          );
        } finally {
          setDiscoveryLoading(
            false,
          );
        }
      })();
    };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <ImageBackground
      source={
        PROJECTS_BACKGROUND
      }
      style={
        styles.background
      }
      imageStyle={
        styles.backgroundImage
      }
      resizeMode="cover"
    >
      {/* -------------------------------------------------------------------- */}
      {/* Subtle readability layer                                             */}
      {/* -------------------------------------------------------------------- */}

      <View
        pointerEvents="none"
        style={
          styles.backgroundWash
        }
      />

      <SafeAreaView
        style={
          styles.safeArea
        }
      >
        <View
          style={
            styles.screen
          }
        >
          {/* ================================================================== */}
          {/* STICKY GLASS HEADER                                               */}
          {/* ================================================================== */}

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.stickyHeaderShadow,

              {
                shadowOpacity,
              },
            ]}
          >
            <View
              style={
                styles.stickyHeader
              }
              onLayout={(
                event,
              ) => {
                const measuredHeight =
                  event
                    .nativeEvent
                    .layout
                    .height;

                if (
                  Math.abs(
                    measuredHeight -
                      headerHeight,
                  ) > 1
                ) {
                  setHeaderHeight(
                    measuredHeight,
                  );
                }
              }}
            >
              {/* -------------------------------------------------------------- */}
              {/* Glass Layer                                                    */}
              {/* -------------------------------------------------------------- */}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.headerGlass,

                  {
                    opacity:
                      glassOpacity,
                  },
                ]}
              >
                <BlurView
                  intensity={
                    Platform.OS ===
                    "ios"
                      ? 70
                      : 36
                  }
                  tint="light"
                  style={
                    StyleSheet.absoluteFill
                  }
                />

                <View
                  style={
                    styles.headerGlassTint
                  }
                />

                <View
                  style={
                    styles.headerGlassHighlight
                  }
                />
              </Animated.View>

              {/* -------------------------------------------------------------- */}
              {/* Header Content                                                 */}
              {/* -------------------------------------------------------------- */}

              <View
                style={
                  styles.headerContent
                }
              >
                <View
                  style={
                    styles.headerBrand
                  }
                >
                   <KeplerLogo
              width={108}
              height={46}
              autoPlay
            />
                </View>

                <Pressable
                  style={({
                    pressed,
                  }) => [
                    styles.createButton,

                    pressed &&
                      styles.createButtonPressed,
                  ]}
                  onPress={() =>
                    navigation
                      .getParent()
                      ?.navigate(
                        "CreateProject",
                      )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Create project"
                  hitSlop={10}
                >
                  <Ionicons
                    name="add"
                    size={24}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>

              {/* -------------------------------------------------------------- */}
              {/* Scroll Divider                                                 */}
              {/* -------------------------------------------------------------- */}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.headerBottomBorder,

                  {
                    opacity:
                      borderOpacity,
                  },
                ]}
              />
            </View>
          </Animated.View>

          {/* ================================================================== */}
          {/* PROJECT LIST                                                      */}
          {/* ================================================================== */}

          <FlatList
            data={visibleProjects}
            keyExtractor={(
              item,
            ) => item.key}
            showsVerticalScrollIndicator={
              false
            }
            scrollEventThrottle={
              16
            }
            onScroll={Animated.event(
              [
                {
                  nativeEvent: {
                    contentOffset:
                      {
                        y: scrollY,
                      },
                  },
                },
              ],

              {
                useNativeDriver:
                  false,
              },
            )}
            contentContainerStyle={[
              styles.list,

              {
                paddingTop:
                  headerHeight +
                  18,
              },

              visibleProjects.length ===
                0 &&
                styles.listEmpty,
            ]}
            /* ================================================================ */
            /* List Header                                                      */
            /* ================================================================ */

            ListHeaderComponent={
              <View>
                {/* ------------------------------------------------------------ */}
                {/* Invitations                                                  */}
                {/* ------------------------------------------------------------ */}

                {pendingInvitationCount >
                0 ? (
                  <Pressable
                    style={({
                      pressed,
                    }) => [
                      styles.invitationsBanner,

                      pressed &&
                        styles.rowPressed,
                    ]}
                    onPress={() =>
                      navigation
                        .getParent()
                        ?.navigate(
                          "Invitations",
                        )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Pending invitations, ${pendingInvitationCount}`}
                  >
                    <View
                      style={
                        styles.invitationIcon
                      }
                    >
                      <Ionicons
                        name="mail-unread-outline"
                        size={21}
                        color={
                          KEPLER_RED
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.invitationContent
                      }
                    >
                      <Text
                        style={
                          styles.invitationsBannerTitle
                        }
                      >
                        Invitations
                      </Text>

                      <Text
                        style={
                          styles.invitationsBannerMeta
                        }
                      >
                        {
                          pendingInvitationCount
                        }{" "}
                        pending invitation
                        {pendingInvitationCount ===
                        1
                          ? ""
                          : "s"}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.chevronCircle
                      }
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={
                          KEPLER_NAVY
                        }
                      />
                    </View>
                  </Pressable>
                ) : null}

                {/* ------------------------------------------------------------ */}
                {/* Workspace: Current | Archived                                */}
                {/* ------------------------------------------------------------ */}

                <View
                  style={
                    styles.workspaceModeRow
                  }
                >
                  <Pressable
                    style={({
                      pressed,
                    }) => [
                      styles.workspaceModeTab,

                      workspaceMode ===
                        "current" &&
                        styles.workspaceModeTabActive,

                      pressed &&
                        styles.workspaceModeTabPressed,
                    ]}
                    onPress={() =>
                      setWorkspaceMode(
                        "current",
                      )
                    }
                    accessibilityRole="button"
                    accessibilityState={{
                      selected:
                        workspaceMode ===
                        "current",
                    }}
                    accessibilityLabel="Current projects"
                  >
                    <Text
                      style={[
                        styles.workspaceModeText,

                        workspaceMode ===
                          "current" &&
                          styles.workspaceModeTextActive,
                      ]}
                    >
                      Current
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({
                      pressed,
                    }) => [
                      styles.workspaceModeTab,

                      workspaceMode ===
                        "archived" &&
                        styles.workspaceModeTabActive,

                      pressed &&
                        styles.workspaceModeTabPressed,
                    ]}
                    onPress={() =>
                      setWorkspaceMode(
                        "archived",
                      )
                    }
                    accessibilityRole="button"
                    accessibilityState={{
                      selected:
                        workspaceMode ===
                        "archived",
                    }}
                    accessibilityLabel={`Archived projects, ${archivedCount}`}
                  >
                    <Ionicons
                      name="archive-outline"
                      size={14}
                      color={
                        workspaceMode ===
                        "archived"
                          ? KEPLER_NAVY
                          : "#8A94A6"
                      }
                    />

                    <Text
                      style={[
                        styles.workspaceModeText,

                        workspaceMode ===
                          "archived" &&
                          styles.workspaceModeTextActive,
                      ]}
                    >
                      Archived
                    </Text>

                    <Text
                      style={[
                        styles.workspaceModeCount,

                        workspaceMode ===
                          "archived" &&
                          styles.workspaceModeCountActive,
                      ]}
                    >
                      {
                        archivedCount
                      }
                    </Text>
                  </Pressable>
                </View>

                {/* ------------------------------------------------------------ */}
                {/* Scope tabs                                                   */}
                {/* ------------------------------------------------------------ */}

                <View
                  style={
                    styles.scopeTabRow
                  }
                >
                  {SCOPE_FILTER_OPTIONS.map(
                    (
                      option,
                    ) => {
                      const isSelected =
                        scopeFilter ===
                        option.key;

                      const count =
                        scopeCounts[
                          option.key
                        ];

                      return (
                        <Pressable
                          key={
                            option.key
                          }
                          style={({
                            pressed,
                          }) => [
                            styles.scopeTab,

                            isSelected &&
                              styles.scopeTabActive,

                            pressed &&
                              styles.scopeTabPressed,
                          ]}
                          onPress={() =>
                            setScopeFilter(
                              option.key,
                            )
                          }
                          accessibilityRole="button"
                          accessibilityState={{
                            selected:
                              isSelected,
                          }}
                          accessibilityLabel={`${option.label}, ${count} projects`}
                        >
                          <Text
                            style={[
                              styles.scopeTabText,

                              isSelected &&
                                styles.scopeTabTextActive,
                            ]}
                          >
                            {
                              option.label
                            }
                          </Text>

                          <Text
                            style={[
                              styles.scopeTabCount,

                              isSelected &&
                                styles.scopeTabCountActive,
                            ]}
                          >
                            {
                              count
                            }
                          </Text>

                          {isSelected ? (
                            <View
                              style={
                                styles.scopeTabIndicator
                              }
                            />
                          ) : null}
                        </Pressable>
                      );
                    },
                  )}
                </View>

                {/* ------------------------------------------------------------ */}
                {/* Status chips                                                 */}
                {/* ------------------------------------------------------------ */}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                  contentContainerStyle={
                    styles.statusChipRow
                  }
                >
                  {STATUS_FILTER_OPTIONS.map(
                    (
                      status,
                    ) => {
                      const isSelected =
                        statusFilter ===
                        status;

                      return (
                        <Pressable
                          key={
                            status
                          }
                          style={({
                            pressed,
                          }) => [
                            styles.statusChip,

                            isSelected &&
                              styles.statusChipActive,

                            pressed &&
                              styles.statusChipPressed,
                          ]}
                          onPress={() =>
                            setStatusFilter(
                              status,
                            )
                          }
                          accessibilityRole="button"
                          accessibilityState={{
                            selected:
                              isSelected,
                          }}
                          accessibilityLabel={statusFilterLabel(
                            status,
                          )}
                        >
                          <Text
                            style={[
                              styles.statusChipText,

                              isSelected &&
                                styles.statusChipTextActive,
                            ]}
                          >
                            {statusFilterLabel(
                              status,
                            )}
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </ScrollView>

                {/* ------------------------------------------------------------ */}
                {/* Projects toolbar + discovery status                          */}
                {/* ------------------------------------------------------------ */}

                <View
                  style={
                    styles.listToolbar
                  }
                >
                  <Text
                    style={
                      styles.listToolbarMeta
                    }
                  >
                    {workspaceMode ===
                    "archived"
                      ? "Archived Projects · "
                      : ""}
                    {
                      visibleProjects.length
                    }{" "}
                    {visibleProjects.length ===
                    1
                      ? "project"
                      : "projects"}
                  </Text>

                  <Pressable
                    style={({
                      pressed,
                    }) => [
                      styles.sortButton,

                      pressed &&
                        styles.sortButtonPressed,
                    ]}
                    onPress={
                      openSortMenu
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Sort projects, ${sortModeLabel(sortMode)}`}
                  >
                    <Ionicons
                      name="swap-vertical-outline"
                      size={15}
                      color={
                        KEPLER_NAVY
                      }
                    />

                    <Text
                      style={
                        styles.sortButtonText
                      }
                    >
                      {sortModeLabel(
                        sortMode,
                      )}
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color={
                        KEPLER_NAVY
                      }
                    />
                  </Pressable>
                </View>

                {showAssignedDiscoveryStatus &&
                discoveryLoading ? (
                  <View
                    style={
                      styles.discoveryStatus
                    }
                  >
                    <Text
                      style={
                        styles.discoveryMeta
                      }
                    >
                      Loading shared projects…
                    </Text>
                  </View>
                ) : null}

                {showAssignedDiscoveryStatus &&
                discoveryError ? (
                  <View
                    style={
                      styles.discoveryErrorRow
                    }
                  >
                    <Text
                      style={
                        styles.discoveryErrorText
                      }
                    >
                      {
                        discoveryError
                      }
                    </Text>

                    <Pressable
                      onPress={
                        retryDiscovery
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Retry loading shared projects"
                      hitSlop={8}
                    >
                      <Text
                        style={
                          styles.retryText
                        }
                      >
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            }
            /* ================================================================ */
            /* Empty State                                                      */
            /* ================================================================ */

            ListEmptyComponent={
              showAssignedDiscoveryStatus &&
              discoveryLoading ? (
                <View
                  style={
                    styles.discoveryStatus
                  }
                >
                  <Text
                    style={
                      styles.discoveryMeta
                    }
                  >
                    Loading shared projects…
                  </Text>
                </View>
              ) : (
                <View
                  style={
                    styles.emptyState
                  }
                >
                  <View
                    style={
                      styles.emptyIcon
                    }
                  >
                    <Ionicons
                      name="business-outline"
                      size={24}
                      color={
                        KEPLER_NAVY
                      }
                    />
                  </View>

                  <Text
                    style={
                      styles.emptyTitle
                    }
                  >
                    {emptyStateTitle(
                      workspaceMode,
                      scopeFilter,
                      statusFilter,
                    )}
                  </Text>

                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    {emptyStateMessage(
                      workspaceMode,
                      scopeFilter,
                      statusFilter,
                    )}
                  </Text>
                </View>
              )
            }
            /* ================================================================ */
            /* Separator                                                        */
            /* ================================================================ */

            ItemSeparatorComponent={() => (
              <View
                style={
                  styles.cardGap
                }
              />
            )}
            /* ================================================================ */
            /* Project                                                          */
            /* ================================================================ */

            renderItem={({
              item,
            }) => {
              if (
                item.source ===
                "assigned"
              ) {
                const discovered =
                  item.original as DiscoveredProject;

                return (
                  <Pressable
                    style={({
                      pressed,
                    }) => [
                      styles.projectCard,

                      styles.sharedCard,

                      pressed &&
                        styles.projectCardPressed,
                    ]}
                    onPress={() =>
                      handleSharedPress(
                        discovered,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Assigned project ${item.name}`}
                  >
                    <View
                      style={
                        styles.projectAvatar
                      }
                    >
                      <ProjectListAvatar />
                    </View>

                    <View
                      style={
                        styles.projectRowContent
                      }
                    >
                      <View
                        style={
                          styles.projectPrimaryRow
                        }
                      >
                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.projectName
                          }
                        >
                          {
                            item.name
                          }
                        </Text>

                        <View
                          style={
                            styles.assignedBadge
                          }
                        >
                          <Text
                            style={
                              styles.assignedBadgeText
                            }
                          >
                            ASSIGNED
                          </Text>
                        </View>
                      </View>

                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.projectLocation
                        }
                      >
                        {
                          item.location
                        }
                      </Text>

                      <View
                        style={
                          styles.projectMetaRow
                        }
                      >
                        <View
                          style={
                            styles.statusInline
                          }
                        >
                          <View
                            style={
                              styles.statusDot
                            }
                          />

                          <Text
                            numberOfLines={
                              1
                            }
                            style={
                              styles.projectMetaText
                            }
                          >
                            {
                              item.status
                            }
                          </Text>
                        </View>

                        <View
                          style={
                            styles.metaDivider
                          }
                        />

                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.projectMetaText
                          }
                        >
                          {formatProjectMemberRoleLabel(
                            discovered
                              .membership
                              .role,
                          )}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.sharedChevron
                      }
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#B6BEC9"
                      />
                    </View>
                  </Pressable>
                );
              }

              const project =
                item.original as Project;

              const openDeltas =
                openDeltaCounts.get(
                  item.id,
                ) ?? 0;

              return (
                <Pressable
                  style={({
                    pressed,
                  }) => [
                    styles.projectCard,

                    pressed &&
                      styles.projectCardPressed,
                  ]}
                  onPress={() =>
                    navigation
                      .getParent()
                      ?.navigate(
                        "Project",
                        {
                          projectId:
                            item.id,
                        },
                      )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Project ${item.name}`}
                >
                  <View
                    style={
                      styles.projectAvatar
                    }
                  >
                    <ProjectListAvatar avatarUri={item.avatarUri} />
                  </View>

                  <View
                    style={
                      styles.projectRowContent
                    }
                  >
                    <View
                      style={
                        styles.projectPrimaryRow
                      }
                    >
                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.projectName
                        }
                      >
                        {
                          item.name
                        }
                      </Text>

                      {workspaceMode ===
                      "archived" ? (
                        <View
                          style={
                            styles.archiveBadge
                          }
                        >
                          <Text
                            style={
                              styles.archiveBadgeText
                            }
                          >
                            ARCHIVED
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text
                      numberOfLines={
                        1
                      }
                      style={
                        styles.projectLocation
                      }
                    >
                      {
                        item.location
                      }
                    </Text>

                    <View
                      style={
                        styles.projectMetaRow
                      }
                    >
                      <View
                        style={
                          styles.statusInline
                        }
                      >
                        <View
                          style={
                            styles.statusDot
                          }
                        />

                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.projectMetaText
                          }
                        >
                          {
                            item.status
                          }
                        </Text>
                      </View>

                      {openDeltas >
                      0 ? (
                        <View
                          style={
                            styles.deltaBadge
                          }
                        >
                          <Text
                            style={
                              styles.deltaBadgeText
                            }
                          >
                            {
                              openDeltas
                            }{" "}
                            {openDeltas ===
                            1
                              ? "DELTA"
                              : "DELTAS"}
                          </Text>
                        </View>
                      ) : null}

                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.taskMeta
                        }
                      >
                        {
                          project.assignedTasks
                        }{" "}
                        {project.assignedTasks ===
                        1
                          ? "task"
                          : "tasks"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.projectRight
                    }
                  >
                    <Text
                      style={
                        styles.progressValue
                      }
                    >
                      {
                        item.progress
                      }
                      %
                    </Text>

                    <Text
                      style={
                        styles.progressLabel
                      }
                    >
                      progress
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#B6BEC9"
                      style={
                        styles.rowChevron
                      }
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Background                                                             */
    /* ---------------------------------------------------------------------- */

    background: {
      flex: 1,

      backgroundColor:
        "#FFFFFF",
    },

    backgroundImage: {
      width: "100%",

      height: "100%",
    },

    /**
     * Keeps the background artwork visible
     * without competing with project content.
     */
    backgroundWash: {
      ...StyleSheet.absoluteFill,

      backgroundColor:
        "rgba(255,255,255,0.16)",
    },

    /* ---------------------------------------------------------------------- */
    /* Screen                                                                 */
    /* ---------------------------------------------------------------------- */

    safeArea: {
      flex: 1,

      backgroundColor:
        "transparent",
    },

    screen: {
      flex: 1,

      position:
        "relative",

      backgroundColor:
        "transparent",
    },

    /* ---------------------------------------------------------------------- */
    /* Sticky Glass Header                                                    */
    /* ---------------------------------------------------------------------- */

    stickyHeaderShadow: {
      position:
        "absolute",

      top: 0,
      left: 0,
      right: 0,

      zIndex: 100,

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width: 0,
        height: 5,
      },

      shadowRadius:
        18,

      elevation:
        8,
    },

    stickyHeader: {
      overflow:
        "hidden",

      backgroundColor:
        "transparent",
    },

    headerGlass: {
      ...StyleSheet.absoluteFill,

      overflow:
        "hidden",
    },

    headerGlassTint: {
      ...StyleSheet.absoluteFill,

      backgroundColor:
        Platform.OS ===
        "ios"
          ? "rgba(255,255,255,0.82)"
          : "rgba(255,255,255,0.96)",
    },

    headerGlassHighlight: {
      position:
        "absolute",

      top: 0,

      left: 20,
      right: 20,

      height:
        StyleSheet.hairlineWidth,

      backgroundColor:
        "rgba(255,255,255,0.88)",
    },

    headerContent: {
      minHeight:
        78,

      paddingHorizontal:
        20,

      paddingVertical:
        6,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",
    },

    headerBrand: {
      flex: 1,

      minWidth: 0,

      alignItems:
        "flex-start",

      justifyContent:
        "center",
    },

    headerBottomBorder: {
      position:
        "absolute",

      left: 18,
      right: 18,
      bottom: 0,

      height:
        StyleSheet.hairlineWidth,

      backgroundColor:
        "rgba(1,33,105,0.08)",
    },

    /* ---------------------------------------------------------------------- */
    /* Create Project                                                         */
    /* ---------------------------------------------------------------------- */

    createButton: {
      width: 42,

      height: 42,

      borderRadius:
        100,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1, 32, 105, 0.94)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(255,255,255,0.85)",

      shadowColor:
        "rgba(1, 32, 105, 0.94)",

      shadowOffset: {
        width: 0,
        height: 4,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.18
          : 0,

      shadowRadius:
        9,

      elevation:
        4,
    },

    createButtonPressed: {
      opacity:
        0.88,

      transform: [
        {
          scale:
            0.95,
        },
      ],
    },

    /* ---------------------------------------------------------------------- */
    /* Main List                                                              */
    /* ---------------------------------------------------------------------- */

    list: {
      paddingHorizontal:
        18,

      paddingBottom:
        132,
    },

    listEmpty: {
      flexGrow: 1,
    },

    scopeTabRow: {
      flexDirection:
        "row",

      marginTop:
        6,

      marginBottom:
        10,

      borderBottomWidth:
        StyleSheet.hairlineWidth,

      borderBottomColor:
        "rgba(1,33,105,0.12)",
    },

    scopeTab: {
      flex: 1,

      alignItems:
        "center",

      paddingTop:
        4,

      paddingBottom:
        10,

      position:
        "relative",
    },

    scopeTabActive: {},

    scopeTabPressed: {
      opacity:
        0.72,
    },

    scopeTabText: {
      ...typography.caption,

      color:
        "#8A94A6",

      fontWeight:
        "600",

      letterSpacing:
        0.35,
    },

    scopeTabTextActive: {
      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    scopeTabCount: {
      ...typography.metadata,

      marginTop:
        2,

      color:
        "#A0A8B8",

      fontWeight:
        "600",
    },

    scopeTabCountActive: {
      color:
        "rgba(1,33,105,0.62)",
    },

    scopeTabIndicator: {
      position:
        "absolute",

      left:
        "18%",

      right:
        "18%",

      bottom:
        0,

      height:
        2.5,

      borderRadius:
        2,

      backgroundColor:
        KEPLER_NAVY,
    },

    statusChipRow: {
      flexDirection:
        "row",

      gap:
        8,

      paddingBottom:
        12,
    },

    statusChip: {
      paddingHorizontal:
        12,

      paddingVertical:
        6,

      borderRadius:
        16,

      backgroundColor:
        "rgba(255,255,255,0.55)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.1)",
    },

    statusChipActive: {
      backgroundColor:
        KEPLER_NAVY,

      borderColor:
        KEPLER_NAVY,
    },

    statusChipPressed: {
      opacity:
        0.8,
    },

    statusChipText: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight:
        "600",
    },

    statusChipTextActive: {
      color:
        "#FFFFFF",
    },

    listToolbar: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      marginBottom:
        12,
    },

    listToolbarMeta: {
      ...typography.caption,

      color:
        "#667085",

      fontWeight:
        "600",

      flexShrink:
        1,

      paddingRight:
        8,
    },

    workspaceModeRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        8,

      marginTop:
        4,

      marginBottom:
        10,
    },

    workspaceModeTab: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        5,

      paddingHorizontal:
        12,

      paddingVertical:
        7,

      borderRadius:
        16,

      backgroundColor:
        "rgba(255,255,255,0.45)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",
    },

    workspaceModeTabActive: {
      backgroundColor:
        "rgba(1,33,105,0.08)",

      borderColor:
        "rgba(1,33,105,0.16)",
    },

    workspaceModeTabPressed: {
      opacity:
        0.8,
    },

    workspaceModeText: {
      ...typography.caption,

      color:
        "#8A94A6",

      fontWeight:
        "600",
    },

    workspaceModeTextActive: {
      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    workspaceModeCount: {
      ...typography.metadata,

      color:
        "#A0A8B8",

      fontWeight:
        "600",
    },

    workspaceModeCountActive: {
      color:
        "rgba(1,33,105,0.62)",
    },

    archiveBadge: {
      marginLeft:
        8,

      flexShrink:
        0,

      paddingHorizontal:
        7,

      paddingVertical:
        3,

      borderRadius:
        999,

      backgroundColor:
        "rgba(102,112,133,0.10)",
    },

    archiveBadgeText: {
      ...typography.metadata,

      color:
        "#667085",

      fontWeight:
        "700",
    },

    sortButton: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        4,

      paddingHorizontal:
        10,

      paddingVertical:
        6,

      borderRadius:
        14,

      backgroundColor:
        "rgba(255,255,255,0.55)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.1)",
    },

    sortButtonPressed: {
      opacity:
        0.8,
    },

    sortButtonText: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    sectionHeader: {
      marginTop:
        14,

      marginBottom:
        14,

      flexDirection:
        "row",

      alignItems:
        "flex-end",

      justifyContent:
        "space-between",
    },

    sectionEyebrow: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",

      letterSpacing:
        1.35,
    },

    sectionTitle: {
      ...typography.sectionTitle,

      marginTop:
        4,

      color:
        "#101828",

      letterSpacing:
        -0.4,
    },

    countBadge: {
      minWidth:
        28,

      height:
        28,

      paddingHorizontal:
        8,

      borderRadius:
        14,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginBottom:
        1,

      backgroundColor:
        "rgba(1,33,105,0.07)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",
    },

    projectCount: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    /* ---------------------------------------------------------------------- */
    /* Invitations                                                            */
    /* ---------------------------------------------------------------------- */

    invitationsBanner: {
      minHeight:
        72,

      marginTop:
        6,

      marginBottom:
        18,

      flexDirection:
        "row",

      alignItems:
        "center",

      paddingHorizontal:
        12,

      paddingVertical:
        10,

      borderRadius:
        18,

      backgroundColor:
        "rgba(255,255,255,0.88)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(227,24,55,0.14)",

      shadowColor:
        "#101828",

      shadowOffset: {
        width: 0,
        height: 3,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.045
          : 0,

      shadowRadius:
        10,

      elevation:
        2,
    },

    invitationIcon: {
      width:
        44,

      height:
        44,

      borderRadius:
        14,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(227,24,55,0.08)",
    },

    invitationContent: {
      flex: 1,

      paddingLeft:
        12,

      paddingRight:
        8,
    },

    invitationsBannerTitle: {
      ...typography.bodyMedium,

      color:
        "#101828",

      fontWeight:
        "600",
    },

    invitationsBannerMeta: {
      ...typography.caption,

      marginTop:
        2,

      color:
        "#667085",
    },

    chevronCircle: {
      width:
        30,

      height:
        30,

      borderRadius:
        15,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1,33,105,0.05)",
    },

    /* ---------------------------------------------------------------------- */
    /* Project Card                                                           */
    /* ---------------------------------------------------------------------- */

    projectCard: {
      minHeight:
        96,

      flexDirection:
        "row",

      alignItems:
        "center",

      paddingHorizontal:
        12,

      paddingVertical:
        12,

      // borderRadius:
      //   20,

      backgroundColor:
        "rgba(255, 255, 255, 0.42)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.07)",

      // shadowColor:
      //   "#101828",

      shadowOffset: {
        width: 0,
        height: 3,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.045
          : 0,

      shadowRadius:
        10,

      elevation:
        2,
    },

    projectCardPressed: {
      opacity:
        0.9,

      transform: [
        {
          scale:
            0.995,
        },
      ],
    },

    cardGap: {
      height:
        10,
    },

    /* ---------------------------------------------------------------------- */
    /* Avatar                                                                 */
    /* ---------------------------------------------------------------------- */

    projectAvatar: {
      width:
        54,

      height:
        54,

      borderRadius:
        17,

      overflow:
        "hidden",

      backgroundColor:
        "#F2F4F7",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",
    },

    projectAvatarImage: {
      width:
        "100%",

      height:
        "100%",
    },

    projectAvatarFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(1,33,105,0.06)",
    },

    /* ---------------------------------------------------------------------- */
    /* Project Info                                                           */
    /* ---------------------------------------------------------------------- */

    projectRowContent: {
      flex: 1,

      minWidth:
        0,

      paddingLeft:
        13,

      paddingRight:
        8,
    },

    projectPrimaryRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      minWidth:
        0,
    },

    projectName: {
      ...typography.bodyLarge,

      flexShrink:
        1,

      color:
        "#101828",

      fontWeight:
        "600",
    },

    projectLocation: {
      ...typography.body,

      marginTop:
        3,

      color:
        "#667085",
    },

    projectMetaRow: {
      marginTop:
        7,

      minWidth:
        0,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        8,

      flexWrap:
        "nowrap",
    },

    statusInline: {
      flexDirection:
        "row",

      alignItems:
        "center",

      flexShrink:
        1,
    },

    statusDot: {
      width:
        6,

      height:
        6,

      marginRight:
        5,

      borderRadius:
        999,

      backgroundColor:
        "rgba(1, 32, 105, 0.94)",
    },

    projectMetaText: {
      ...typography.caption,

      color:
        "#98A2B3",

      textTransform:
        "capitalize",
    },

    taskMeta: {
      ...typography.caption,

      color:
        "#98A2B3",

      flexShrink:
        1,
    },

    deltaBadge: {
      paddingHorizontal:
        7,

      paddingVertical:
        3,

      borderRadius:
        999,

      backgroundColor:
        "",
    },

    deltaBadgeText: {
      ...typography.metadata,

      color:
        "rgba(1, 32, 105, 0.94)",

      fontWeight:
        "700",
    },

    metaDivider: {
      width:
        3,

      height:
        3,

      borderRadius:
        999,

      backgroundColor:
        "rgba(1, 32, 105, 0.87)",
    },

    /* ---------------------------------------------------------------------- */
    /* Right Side                                                             */
    /* ---------------------------------------------------------------------- */

    projectRight: {
      width:
        56,

      alignSelf:
        "stretch",

      alignItems:
        "flex-end",

      justifyContent:
        "center",
    },

    progressValue: {
      ...typography.button,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    progressLabel: {
      ...typography.metadata,

      marginTop:
        1,

      color:
        "rgba(1, 32, 105, 0.87)",
    },

    rowChevron: {
      marginTop:
        5,
    },

    /* ---------------------------------------------------------------------- */
    /* Shared Projects                                                        */
    /* ---------------------------------------------------------------------- */

    sharedSection: {
      marginTop:
        34,

      gap:
        10,
    },

    sharedCard: {
      backgroundColor:
        "rgba(255,255,255,0.82)",
    },

    assignedBadge: {
      marginLeft:
        8,

      flexShrink:
        0,

      paddingHorizontal:
        7,

      paddingVertical:
        3,

      borderRadius:
        999,

      backgroundColor:
        "rgba(1,33,105,0.07)",
    },

    assignedBadgeText: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    sharedChevron: {
      width:
        36,

      height:
        36,

      alignItems:
        "flex-end",

      justifyContent:
        "center",
    },

    /* ---------------------------------------------------------------------- */
    /* Discovery                                                              */
    /* ---------------------------------------------------------------------- */

    discoveryStatus: {
      paddingVertical:
        12,
    },

    discoveryMeta: {
      ...typography.body,

      color:
        "rgba(1, 32, 105, 0.87)",
    },

    discoveryErrorRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap:
        12,

      paddingVertical:
        14,

      paddingHorizontal:
        14,

      borderRadius:
        16,

      backgroundColor:
        "rgba(255,255,255,0.72)",
    },

    discoveryErrorText: {
      ...typography.caption,

      flex: 1,

      color:
        "rgba(1, 32, 105, 0.87)",
    },

    retryText: {
      ...typography.button,

      color:
        KEPLER_NAVY,

      fontWeight:
        "600",
    },

    /* ---------------------------------------------------------------------- */
    /* Empty State                                                            */
    /* ---------------------------------------------------------------------- */

    emptyState: {
      marginTop:
        20,

      paddingVertical:
        34,

      paddingHorizontal:
        24,

      alignItems:
        "center",

      borderRadius:
        20,

      backgroundColor:
        "rgba(255,255,255,0.76)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.06)",

      shadowColor:
        "#101828",

      shadowOffset: {
        width: 0,
        height: 3,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.035
          : 0,

      shadowRadius:
        8,

      elevation:
        1,
    },

    emptyIcon: {
      width:
        48,

      height:
        48,

      borderRadius:
        15,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginBottom:
        12,

      backgroundColor:
        "rgba(1,33,105,0.07)",
    },

    emptyTitle: {
      ...typography.bodyLarge,

      color:
        "rgba(1, 32, 105, 0.94)",

      fontWeight:
        "600",
    },

    emptyText: {
      ...typography.body,

      marginTop:
        5,

      maxWidth:
        280,

      textAlign:
        "center",

      color:
        "rgba(1, 32, 105, 0.87)",
    },

    rowPressed: {
      opacity:
        0.88,

      transform: [
        {
          scale:
            0.995,
        },
      ],
    },
  });