import React, {
    useCallback,
    useMemo,
    useState,
  } from "react";
  
  import {
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
  } from "react-native";
  
  import { SafeAreaView } from "react-native-safe-area-context";
  
  import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
  
  import {
    CompositeScreenProps,
    useFocusEffect,
  } from "@react-navigation/native";
  
  import type { NativeStackScreenProps } from "@react-navigation/native-stack";
  
  import { useAuth } from "../auth/AuthProvider";
  
  import type {
    MainTabParamList,
    RootStackParamList,
  } from "../navigation/types";
  
  import {
    getDeltas,
    getDeltasForProject,
  } from "../store/deltas";
  
  import { getPendingDeltaReviewsForUser } from "../store/deltaReviewSyncState";
  
  import { getPlanItems } from "../store/planItems";
  
  import {
    getProjectById,
    getProjects,
  } from "../store/projects";
  
  import type {
    Delta,
    DeltaStatus,
  } from "../types/delta";
  
  import type { PlanItem } from "../types/plan";
  
  import type { Project } from "../types/project";
  
  import {colors, typography} from "../theme/colors";
  
  type DeltasTabProps = CompositeScreenProps<
    BottomTabScreenProps<
      MainTabParamList,
      "Deltas"
    >,
    NativeStackScreenProps<RootStackParamList>
  >;
  
  type ProjectDeltasProps =
    NativeStackScreenProps<
      RootStackParamList,
      "ProjectDeltas"
    >;
  
  type Props =
    | DeltasTabProps
    | ProjectDeltasProps;
  
  function isProjectDeltasProps(
    props: Props,
  ): props is ProjectDeltasProps {
    return props.route.name === "ProjectDeltas";
  }
  
  function formatSignedValue(
    value: number,
    unit: string,
  ): string {
    const sign = value > 0 ? "+" : "";
  
    return `${sign}${value.toFixed(2)} ${unit}`;
  }
  
  function formatSignedPercent(
    value: number | null,
  ): string {
    if (value === null) {
      return "—";
    }
  
    const sign = value > 0 ? "+" : "";
  
    return `${sign}${value.toFixed(1)}%`;
  }
  
  function formatSignedCurrency(
    value: number,
  ): string {
    if (value === 0) {
      return "$0.00";
    }
  
    const sign = value > 0 ? "+" : "-";
  
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  }
  
  function formatSignedDays(
    value: number,
  ): string {
    const absolute = Math.abs(value).toFixed(2);
  
    const unitLabel =
      Math.abs(value) === 1 ? "day" : "days";
  
    if (value === 0) {
      return `0.00 ${unitLabel}`;
    }
  
    const sign = value > 0 ? "+" : "-";
  
    return `${sign}${absolute} ${unitLabel}`;
  }
  
  function formatSignedHours(
    value: number,
  ): string {
    if (value === 0) {
      return "0.00 hr";
    }
  
    const sign = value > 0 ? "+" : "-";
  
    return `${sign}${Math.abs(value).toFixed(2)} hr`;
  }
  
  async function loadSortedDeltas(
    ownerUid: string,
    projectId: string | undefined,
  ): Promise<Delta[]> {
    const items =
      projectId === undefined
        ? await getDeltas(ownerUid)
        : await getDeltasForProject(
            ownerUid,
            projectId,
          );
  
    return items.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  
  export default function DeltasScreen(
    props: Props,
  ) {
    const { user } = useAuth();
  
    const projectId = isProjectDeltasProps(
      props,
    )
      ? props.route.params.projectId
      : undefined;
  
    const [project, setProject] = useState<
      Project | null | undefined
    >(
      projectId === undefined
        ? null
        : undefined,
    );
  
    const [deltas, setDeltas] = useState<
      Delta[]
    >([]);
  
    const [pendingKeys, setPendingKeys] =
      useState<Set<string>>(new Set());
  
    const [projectsById, setProjectsById] =
      useState<Map<string, Project>>(
        () => new Map(),
      );
  
    const [
      planItemsById,
      setPlanItemsById,
    ] = useState<Map<string, PlanItem>>(
      () => new Map(),
    );
  
    const initialStatus =
      isProjectDeltasProps(props)
        ? props.route.params.initialStatus
        : undefined;
  
    const [statusFilter, setStatusFilter] =
      useState<"all" | DeltaStatus>(
        initialStatus ?? "all",
      );
  
    useFocusEffect(
      useCallback(() => {
        if (!user?.uid) {
          setProject(null);
          setDeltas([]);
          setPendingKeys(new Set());
          setProjectsById(new Map());
          setPlanItemsById(new Map());
  
          return;
        }
  
        const ownerUid = user.uid;
  
        let active = true;
  
        async function load() {
          const [
            items,
            allProjects,
            allPlanItems,
            scopedProject,
          ] = await Promise.all([
            loadSortedDeltas(
              ownerUid,
              projectId,
            ),
  
            getProjects(ownerUid),
  
            getPlanItems(ownerUid),
  
            projectId === undefined
              ? Promise.resolve(undefined)
              : getProjectById(
                  ownerUid,
                  projectId,
                ),
          ]);
  
          if (
            projectId !== undefined &&
            !scopedProject
          ) {
            if (active) {
              setProject(null);
              setDeltas([]);
              setPendingKeys(new Set());
            }
  
            return;
          }
  
          const pending =
            await getPendingDeltaReviewsForUser(
              ownerUid,
            );
  
          const nextPending = new Set(
            pending.map(
              (entry) =>
                `${entry.localProjectId}:${entry.localDeltaId}`,
            ),
          );
  
          if (active) {
            setProject(
              scopedProject ?? null,
            );
  
            setDeltas(items);
  
            setPendingKeys(nextPending);
  
            setProjectsById(
              new Map(
                allProjects.map((entry) => [
                  entry.id,
                  entry,
                ]),
              ),
            );
  
            setPlanItemsById(
              new Map(
                allPlanItems.map((entry) => [
                  entry.id,
                  entry,
                ]),
              ),
            );
          }
        }
  
        void load();
  
        return () => {
          active = false;
        };
      }, [projectId, user?.uid]),
    );
  
    const statusCounts = useMemo(() => {
      let open = 0;
      let accepted = 0;
      let rejected = 0;
      let resolved = 0;
  
      for (const item of deltas) {
        if (item.status === "open") {
          open += 1;
        } else if (
          item.status === "accepted"
        ) {
          accepted += 1;
        } else if (
          item.status === "rejected"
        ) {
          rejected += 1;
        } else if (
          item.status === "resolved"
        ) {
          resolved += 1;
        }
      }
  
      return {
        all: deltas.length,
        open,
        accepted,
        rejected,
        resolved,
      };
    }, [deltas]);
  
    const filteredDeltas = useMemo(() => {
      if (statusFilter === "all") {
        return deltas;
      }
  
      return deltas.filter(
        (item) =>
          item.status === statusFilter,
      );
    }, [deltas, statusFilter]);
  
    const openDeltaDetail = (
      deltaId: string,
    ) => {
      if (isProjectDeltasProps(props)) {
        props.navigation.navigate(
          "DeltaDetail",
          {
            deltaId,
          },
        );
  
        return;
      }
  
      props.navigation.navigate(
        "DeltaDetail",
        {
          deltaId,
        },
      );
    };
  
    /*
     * PROJECT LOADING STATE
     */
  
    if (
      projectId !== undefined &&
      project === undefined
    ) {
      return (
        <SafeAreaView
          style={styles.safeArea}
          edges={["top"]}
        >
          <View style={styles.container} />
        </SafeAreaView>
      );
    }
  
    /*
     * PROJECT NOT FOUND
     */
  
    if (
      projectId !== undefined &&
      !project
    ) {
      return (
        <SafeAreaView
          style={styles.safeArea}
          edges={["top"]}
        >
          <View style={styles.container}>
            <View style={styles.topBar}>
              <Pressable
                style={({ pressed }) => [
                  styles.backButton,
                  pressed &&
                    styles.backButtonPressed,
                ]}
                onPress={() =>
                  props.navigation.goBack()
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text
                  style={
                    styles.backButtonText
                  }
                >
                  ←
                </Text>
              </Pressable>
            </View>
  
            <Text style={styles.title}>
              Project not found.
            </Text>
          </View>
        </SafeAreaView>
      );
    }
  
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={["top"]}
      >
        <View style={styles.container}>
          {/* =====================================
              BACK
          ===================================== */}
  
          {isProjectDeltasProps(props) ? (
            <View style={styles.topBar}>
              <Pressable
                style={({ pressed }) => [
                  styles.backButton,
                  pressed &&
                    styles.backButtonPressed,
                ]}
                onPress={() =>
                  props.navigation.goBack()
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text
                  style={
                    styles.backButtonText
                  }
                >
                  ←
                </Text>
              </Pressable>
            </View>
          ) : null}
  
          {/* =====================================
              HEADER
          ===================================== */}
  
          <Text style={styles.eyebrow}>
            PLAN VS REALITY
          </Text>
  
          <Text style={styles.title}>
            {projectId === undefined
              ? "Deltas"
              : "Project Deltas"}
          </Text>
  
          {project ? (
            <Text
              style={
                styles.projectContextName
              }
            >
              {project.name}
            </Text>
          ) : null}
  
          <Text style={styles.subtitle}>
            Field measurements that differ
            from planned quantities.
          </Text>
  
          {/* =====================================
              FILTERS
          ===================================== */}
  
          {deltas.length > 0 ? (
            <View style={styles.filterSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={
                  false
                }
                style={styles.filterScroll}
                contentContainerStyle={
                  styles.filterRow
                }
              >
                {(
                  [
                    [
                      "all",
                      `All ${statusCounts.all}`,
                    ],
                    [
                      "open",
                      `Open ${statusCounts.open}`,
                    ],
                    [
                      "accepted",
                      `Accepted ${statusCounts.accepted}`,
                    ],
                    [
                      "rejected",
                      `Rejected ${statusCounts.rejected}`,
                    ],
                    [
                      "resolved",
                      `Resolved ${statusCounts.resolved}`,
                    ],
                  ] as const
                ).map(([value, label]) => {
                  const active =
                    statusFilter === value;
  
                  return (
                    <Pressable
                      key={value}
                      style={({ pressed }) => [
                        styles.filterPill,
  
                        active &&
                          styles.filterPillActive,
  
                        pressed &&
                          styles.filterPillPressed,
                      ]}
                      onPress={() =>
                        setStatusFilter(value)
                      }
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.filterPillText,
  
                          active &&
                            styles.filterPillTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
  
          {/* =====================================
              EMPTY / LIST
          ===================================== */}
  
          {deltas.length === 0 ? (
            <Text style={styles.emptyState}>
              {projectId === undefined
                ? "No plan-vs-reality differences recorded yet."
                : "No plan-vs-reality differences recorded for this project yet."}
            </Text>
          ) : filteredDeltas.length ===
            0 ? (
            <Text style={styles.emptyState}>
              No deltas match this
              disposition filter.
            </Text>
          ) : (
            <FlatList
              data={filteredDeltas}
              keyExtractor={(item) =>
                item.id
              }
              showsVerticalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.list
              }
              renderItem={({ item }) => {
                const itemProject =
                  projectsById.get(
                    item.projectId,
                  );
  
                const planItem =
                  planItemsById.get(
                    item.planItemId,
                  );
  
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.card,
  
                      pressed &&
                        styles.cardPressed,
                    ]}
                    onPress={() =>
                      openDeltaDetail(
                        item.id,
                      )
                    }
                  >
                    <Text
                      style={
                        styles.projectName
                      }
                    >
                      {itemProject?.name ??
                        "Unknown project"}
                    </Text>
  
                    <Text
                      style={
                        styles.planItemLabel
                      }
                    >
                      {planItem?.label ??
                        "Unknown plan item"}
                    </Text>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        PLANNED
                      </Text>
  
                      <Text
                        style={styles.metricValue}
                      >
                        {item.plannedValue.toFixed(
                          2,
                        )}{" "}
                        {item.unit}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        FIELD
                      </Text>
  
                      <Text
                        style={styles.metricValue}
                      >
                        {item.actualValue.toFixed(
                          2,
                        )}{" "}
                        {item.unit}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        DIFFERENCE
                      </Text>
  
                      <Text
                        style={
                          styles.metricHighlight
                        }
                      >
                        {formatSignedValue(
                          item.difference,
                          item.unit,
                        )}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        PERCENT
                      </Text>
  
                      <Text
                        style={
                          styles.metricHighlight
                        }
                      >
                        {formatSignedPercent(
                          item.percentDifference,
                        )}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        UNIT COST
                      </Text>
  
                      <Text
                        style={styles.metricValue}
                      >
                        $
                        {item.unitCost.toFixed(
                          2,
                        )}{" "}
                        / {item.unit}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        COST IMPACT
                      </Text>
  
                      <Text
                        style={
                          styles.metricHighlight
                        }
                      >
                        {formatSignedCurrency(
                          item.costImpact,
                        )}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        PRODUCTION RATE
                      </Text>
  
                      <Text
                        style={styles.metricValue}
                      >
                        {item.productionRatePerDay.toFixed(
                          2,
                        )}{" "}
                        {item.unit}/day
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        SCHEDULE IMPACT
                      </Text>
  
                      <Text
                        style={
                          styles.metricHighlight
                        }
                      >
                        {formatSignedDays(
                          item.scheduleImpactDays,
                        )}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        LABOR RATE
                      </Text>
  
                      <Text
                        style={styles.metricValue}
                      >
                        {item.laborHoursPerUnit.toFixed(
                          2,
                        )}{" "}
                        hr / {item.unit}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        LABOR IMPACT
                      </Text>
  
                      <Text
                        style={
                          styles.metricHighlight
                        }
                      >
                        {formatSignedHours(
                          item.laborImpactHours,
                        )}
                      </Text>
                    </View>
  
                    <View
                      style={styles.metricRow}
                    >
                      <Text
                        style={styles.metricLabel}
                      >
                        DISPOSITION
                      </Text>
  
                      <Text
                        style={[
                          styles.statusValue,
  
                          item.status ===
                            "rejected" &&
                            styles.statusRejected,
  
                          item.status ===
                            "open" &&
                            styles.statusOpen,
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
  
                    {pendingKeys.has(
                      `${item.projectId}:${item.id}`,
                    ) ? (
                      <Text
                        style={
                          styles.pendingSyncText
                        }
                      >
                        Cloud sync pending
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }
  
  const styles = StyleSheet.create({
    /*
     * SCREEN
     */
  
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
  
    container: {
      flex: 1,
  
      paddingHorizontal: 20,
      paddingTop: 20,
  
      backgroundColor: colors.background,
    },
  
    /*
     * BACK
     */
  
    topBar: {
      marginBottom: 12,
    },
  
    backButton: {
      width: 42,
      height: 42,
  
      borderRadius: 13,
  
      backgroundColor: colors.surface,
  
      alignItems: "center",
      justifyContent: "center",
  
      shadowColor: "#F0F2F5",
  
      shadowOffset: {
        width: 0,
        height: 5,
      },
  
      shadowOpacity: 0.95,
      shadowRadius: 12,
  
      elevation: 2,
    },
  
    backButtonPressed: {
      opacity: 0.72,
  
      transform: [
        {
          scale: 0.95,
        },
      ],
    },
  
    backButtonText: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    },
  
    /*
     * HEADER
     */
  
    eyebrow: {
    ...typography.caption,
    color: colors.text.primary,
    },
  
    title: {
    ...typography.display,
    marginTop: 12,
  
      color: colors.text.primary,
    },
  
    projectContextName: {
    ...typography.bodyLarge,
    marginTop: 8,
  
      color: colors.text.primary,
    },
  
    subtitle: {
    ...typography.body,
    marginTop: 10,
      marginBottom: 16,
  
      color: colors.text.secondary,
    },
  
    /*
     * FILTER SECTION
     *
     * IMPORTANT:
     * The fixed height + flexGrow: 0 prevents
     * the horizontal ScrollView from stretching
     * the pills vertically.
     */
  
    filterSection: {
      height: 54,
  
      marginBottom: 10,
  
      justifyContent: "center",
    },
  
    filterScroll: {
      flexGrow: 0,
      flexShrink: 0,
  
      maxHeight: 48,
    },
  
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
  
      gap: 8,
  
      paddingHorizontal: 1,
      paddingVertical: 4,
    },
  
    /*
     * FILTER PILLS
     */
  
    filterPill: {
      flexGrow: 0,
      flexShrink: 0,
  
      height: 40,
  
      paddingHorizontal: 16,
  
      alignItems: "center",
      justifyContent: "center",
  
      borderRadius: 20,
  
      backgroundColor: colors.surface,
  
      shadowColor: "#F0F2F5",
  
      shadowOffset: {
        width: 0,
        height: 3,
      },
  
      shadowOpacity: 0.88,
      shadowRadius: 8,
  
      elevation: 2,
    },
  
    filterPillActive: {
      backgroundColor:
        "rgba(30,143,224,0.10)",
  
      shadowColor: "#DCECF8",
  
      shadowOpacity: 0.8,
    },
  
    filterPillPressed: {
      opacity: 0.74,
  
      transform: [
        {
          scale: 0.96,
        },
      ],
    },
  
    filterPillText: {
    ...typography.caption,
    color: colors.text.secondary,
    },
  
    filterPillTextActive: {
    ...typography.button,
    color: colors.brand.blue,
    },
  
    /*
     * EMPTY STATE
     */
  
    emptyState: {
    ...typography.caption,
    marginTop: 6,
  
      color: colors.text.secondary,
    },
  
    /*
     * LIST
     */
  
    list: {
      paddingTop: 2,
  
      // Extra room for floating tab bar.
      paddingBottom: 140,
    },
  
    /*
     * DELTA CARD
     */
  
    card: {
      padding: 17,
  
      marginBottom: 16,
  
      borderRadius: 20,
  
      backgroundColor: colors.surface,
  
      /*
       * Very subtle depth.
       * Close to white, as requested.
       */
  
      shadowColor:
        colors.shadow?.soft ?? "#F1F3F5",
  
      shadowOffset: {
        width: 0,
        height: 6,
      },
  
      shadowOpacity: 0.9,
  
      shadowRadius: 16,
  
      elevation: 3,
    },
  
    cardPressed: {
      opacity: 0.86,
  
      transform: [
        {
          scale: 0.986,
        },
      ],
    },
  
    /*
     * CARD HEADER
     */
  
    projectName: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    },
  
    planItemLabel: {
    ...typography.bodyMedium,
    marginTop: 6,
      marginBottom: 16,
  
      color: colors.text.primary,
    },
  
    /*
     * METRIC ROWS
     */
  
    metricRow: {
      minHeight: 25,
  
      flexDirection: "row",
  
      alignItems: "center",
      justifyContent: "space-between",
  
      gap: 18,
    },
  
    metricLabel: {
    ...typography.caption,
    flexShrink: 1,
  
      color: colors.text.secondary,
    },
  
    metricValue: {
    ...typography.button,
    flexShrink: 0,
  
      color: colors.text.primary,
      textAlign: "right",
    },
  
    /*
     * DELTA / VARIANCE
     */
  
    metricHighlight: {
    ...typography.button,
    flexShrink: 0,
  
      color: colors.delta,
      textAlign: "right",
    },
  
    /*
     * STATUS
     */
  
    statusValue: {
    ...typography.caption,
    flexShrink: 0,
  
      color: colors.success,
      textAlign: "right",
    },
  
    statusRejected: {
      color: colors.danger,
    },
  
    statusOpen: {
      color: colors.delta,
    },
  
    /*
     * SYNC
     */
  
    pendingSyncText: {
    ...typography.caption,
    marginTop: 8,
  
      color: colors.text.secondary,
    },
  });