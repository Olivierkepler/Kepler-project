import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  useFocusEffect,
} from "@react-navigation/native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../../auth/AuthProvider";

import PlanItemCard from "./PlanItemCard";
import OrganizeWorkModal from "./OrganizeWorkModal";

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

import {
  getWorkPackageAssignmentsForProject,
} from "../../store/workPackageAssignments";

import {
  getWorkPackagesForProject,
} from "../../store/workPackages";

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
  buildFilteredPlanWorkPackageGroups,
  PLAN_LIST_FILTERS,
  type PlanListFilter,
} from "../../utils/domain/planWorkPackageGroups";

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

const ORGANIZE_BUTTON_BACKGROUND =
  require("../../../assets/bgbutton1.png");

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

function formatPlanAssigneeLine(
  assignee: {
    nameLabel: string;
    roleLabel: string;
    hasAssignee: boolean;
  },
): string {
  if (!assignee.hasAssignee) {
    return "No assignee · Unassigned";
  }

  const nameLabel =
    looksLikeInternalUserIdLabel(
      assignee.nameLabel,
    )
      ? "Assigned member"
      : assignee.nameLabel.trim() ||
        "Assigned member";

  if (!assignee.roleLabel.trim()) {
    return nameLabel;
  }

  return `${nameLabel} · ${assignee.roleLabel}`;
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

  const [
    listFilter,
    setListFilter,
  ] = useState<PlanListFilter>(
    "all",
  );

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
  const accordionDefaultedFilterRef =
    useRef<PlanListFilter | null>(
      null,
    );

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

        setWorkPackages(
          packageItems,
        );

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

  const workPackageGroups =
    useMemo(
      () =>
        buildFilteredPlanWorkPackageGroups(
          {
            planItems:
              sortedPlanItems,

            workPackages,

            assignments,

            members,

            projectId,

            measurements,

            filter:
              listFilter,

            emailByUserId,

            profileByUserId,
          },
        ),
      [
        assignments,
        emailByUserId,
        profileByUserId,
        listFilter,
        measurements,
        members,
        projectId,
        sortedPlanItems,
        workPackages,
      ],
    );

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
      accordionDefaultedFilterRef
        .current !==
      listFilter
    ) {
      setExpandedGroupKey(
        unassignedKey,
      );

      accordionDefaultedFilterRef.current =
        listFilter;

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
    listFilter,
    workPackageGroups,
  ]);

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

        setWorkPackages(
          packageItems,
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
            accessibilityLabel={`${sortedPlanItems.length} planned, ${measuredCount} measured, ${pendingCount} pending, ${baselineProgressPercent} percent verified`}
          >
            <View
              style={
                styles.summaryPrimary
              }
            >
              <Text
                style={
                  styles.summaryMetric
                }
              >
                {
                  sortedPlanItems.length
                }{" "}
                planned
              </Text>

              <Text
                style={
                  styles.summarySep
                }
              >
                ·
              </Text>

              <Text
                style={
                  styles.summaryMetric
                }
              >
                {measuredCount} measured
              </Text>

              <Text
                style={
                  styles.summarySep
                }
              >
                ·
              </Text>

              <Text
                style={
                  styles.summaryMetric
                }
              >
                {pendingCount} pending
              </Text>
            </View>

            <Text
              style={
                styles.summaryVerified
              }
            >
              {
                baselineProgressPercent
              }
              % verified
            </Text>
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
              setOrganizeOpen(
                true,
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Organize work"
          >
            <ImageBackground
              source={
                ORGANIZE_BUTTON_BACKGROUND
              }
              style={
                styles.organizeButtonBackground
              }
              resizeMode="cover"
            >
              <View
                style={
                  styles.organizeButtonContent
                }
              >
                <Ionicons
                  name="people-outline"
                  size={17}
                  color={
                    KEPLER_NAVY
                  }
                />

                <Text
                  style={
                    styles.organizeButtonText
                  }
                >
                  Organize work
                </Text>
              </View>
            </ImageBackground>
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
            {/* Filters */}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.filterRow
              }
              accessibilityRole="tablist"
            >
              {PLAN_LIST_FILTERS.map(
                (
                  filter,
                ) => {
                  const selected =
                    listFilter ===
                    filter.id;

                  return (
                    <Pressable
                      key={
                        filter.id
                      }
                      onPress={() => {
                        accordionUserControlledRef.current =
                          false;

                        accordionDefaultedFilterRef.current =
                          null;

                        setListFilter(
                          filter.id,
                        );
                      }}
                      style={[
                        styles.filterChip,

                        selected &&
                          styles.filterChipSelected,
                      ]}
                      accessibilityRole="tab"
                      accessibilityLabel={
                        filter.label
                      }
                      accessibilityState={{
                        selected,
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,

                          selected &&
                            styles.filterChipTextSelected,
                        ]}
                      >
                        {
                          filter.label
                        }
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>

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
                  {listFilter ===
                  "all"
                    ? "No plan items yet."
                    : "No plan items match this filter."}
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

                  const itemCountLabel =
                    `${group.items.length} ${
                      group.items.length ===
                      1
                        ? "item"
                        : "items"
                    }`;

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

                      <Pressable
                        onPress={() =>
                          toggleGroupExpanded(
                            group.key,
                          )
                        }
                        style={
                          styles.packageHeader
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${group.title}, ${itemCountLabel}, ${formatPlanAssigneeLine(group.assignee)}`}
                        accessibilityState={{
                          expanded,
                        }}
                      >
                        <View
                          style={
                            styles.packageHeaderText
                          }
                        >
                          <View
                            style={
                              styles.packageTitleRow
                            }
                          >
                            <Text
                              style={
                                styles.packageTitle
                              }
                              numberOfLines={
                                2
                              }
                            >
                              {
                                group.title
                              }
                            </Text>

                            <Text
                              style={
                                styles.packageCount
                              }
                            >
                              {
                                itemCountLabel
                              }
                            </Text>
                          </View>

                          <Text
                            style={
                              styles.packageAssignee
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {formatPlanAssigneeLine(
                              group.assignee,
                            )}
                          </Text>

                          <Text
                            style={
                              styles.packageSummary
                            }
                          >
                            {
                              group.measuredCount
                            }{" "}
                            measured ·{" "}
                            {
                              group.pendingCount
                            }{" "}
                            pending
                          </Text>
                        </View>

                        <Ionicons
                          name={
                            expanded
                              ? "chevron-down"
                              : "chevron-forward"
                          }
                          size={18}
                          color={
                            TEXT_MUTED
                          }
                        />
                      </Pressable>

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
                                  false
                                }
                                onPress={() =>
                                  onOpenPlanItem(
                                    item.id,
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
            sortedPlanItems
          }
          onClose={() =>
            setOrganizeOpen(
              false,
            )
          }
          onUpdated={() => {
            void reloadAssignmentContext();
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

    summaryVerified: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight: "700",

      marginLeft: "auto",
    },

    /* ---------------------------------------------------------------------- */
    /* Organize Work                                                          */
    /* ---------------------------------------------------------------------- */

    organizationRow: {
      marginTop: 12,
    },

    organizeButton: {
      width: "100%",

      minHeight: 48,

      backgroundColor:
        "transparent",

      borderWidth: 0,

      borderRadius: 0,

      overflow: "hidden",
    },

    organizeButtonBackground: {
      width: "100%",

      minHeight: 48,

      justifyContent:
        "center",
    },

    organizeButtonContent: {
      minHeight: 48,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "center",

      gap: 7,

      paddingHorizontal: 14,
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

    /* ---------------------------------------------------------------------- */
    /* Filters                                                                */
    /* ---------------------------------------------------------------------- */

    filterRow: {
      paddingHorizontal: 2,

      paddingRight: 36,

      paddingBottom: 8,

      gap: 8,

      flexDirection: "row",

      alignItems: "center",
    },

    filterChip: {
      minHeight: 32,

      paddingHorizontal: 10,

      borderRadius: 999,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.10)",

      backgroundColor:
        "rgba(255,255,255,0.45)",

      alignItems: "center",

      justifyContent:
        "center",
    },

    filterChipSelected: {
      borderColor:
        KEPLER_NAVY,

      backgroundColor:
        KEPLER_NAVY,
    },

    filterChipText: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight: "600",
    },

    filterChipTextSelected: {
      color: "#FFFFFF",
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
      paddingHorizontal: 4,

      paddingTop: 10,

      paddingBottom: 8,

      flexDirection: "row",

      alignItems:
        "flex-start",

      gap: 8,

      backgroundColor:
        "rgba(1,33,105,0.012)",
    },

    packageHeaderText: {
      flex: 1,

      minWidth: 0,
    },

    packageTitleRow: {
      flexDirection: "row",

      alignItems:
        "flex-start",

      justifyContent:
        "space-between",

      gap: 10,
    },

    packageTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      flex: 1,

      minWidth: 0,

      fontWeight: "700",
    },

    packageCount: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      flexShrink: 0,

      fontWeight: "600",
    },

    packageAssignee: {
      ...typography.caption,

      color: "#344054",

      marginTop: 3,
    },

    packageSummary: {
      ...typography.caption,

      color:
        TEXT_MUTED,

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