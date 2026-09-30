import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { useAuth } from "../../auth/AuthProvider";
import { getRemoteWorkPackageAssignmentsForProject } from "../../services/api/workPackageAssignments";
import { getRemoteWorkPackagesForProject } from "../../services/api/workPackages";
import { getRemoteDeltasForProject } from "../../services/api/deltas";
import { getRemoteMeasurementsForProject } from "../../services/api/measurements";
import { getProjectProgress } from "../../services/api/projectProgress";
import { getPlanItemCloudMappingsForProject } from "../../store/planItemCloudMappings";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getProjectById } from "../../store/projects";
import { getPlanItemsForProject } from "../../store/planItems";
import { colors, typography } from "../../theme/colors";
import type { PlanItem } from "../../types/plan";
import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import type { WorkPackageStatus } from "../../types/workPackage";
import type { ProjectProgressSeries } from "../../types/projectProgress";
import type { RankedProjectVariance } from "../../utils/domain/projectVarianceRanking";
import {
  formatAssignmentStatusPresentation,
  formatWorkPackageStatusPresentation,
} from "../../utils/domain/statusPresentation";
import { summarizeProjectProgress } from "../../utils/domain/projectProgressSummary";
import { rankCurrentProjectVariances } from "../../utils/domain/projectVarianceRanking";
import {
  buildProjectProgressChartData,
  type ProjectProgressChartData,
  type ProjectProgressChartPoint,
} from "../../utils/domain/projectProgressChart";
import OrganizeWorkModal from "./OrganizeWorkModal";

const WORK_PACKAGE_STATUSES: WorkPackageStatus[] = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
];

const WORK_PACKAGE_STATUS_COLORS: Record<WorkPackageStatus, string> = {
  draft: colors.text.muted,
  ready: colors.brand.blue,
  in_progress: colors.brand.navy,
  blocked: colors.delta,
  completed: colors.success,
  cancelled: colors.text.muted,
};

const FLOATING_ACTION_SIZE = 56;
const FLOATING_ACTION_BOTTOM_OFFSET = 22;
const FLOATING_ACTION_CLEARANCE = 16;
const FLOATING_ACTION_RIGHT_OFFSET = 18;
const FLOATING_ACTION_CONTENT_GAP = 12;
const DASHBOARD_HORIZONTAL_INSET = 17;
const CARD_HORIZONTAL_INSET = 17;
const ROW_HORIZONTAL_INSET = 15;
const FAB_CARD_CONTENT_KEEP_CLEAR =
  FLOATING_ACTION_SIZE +
  FLOATING_ACTION_RIGHT_OFFSET +
  FLOATING_ACTION_CONTENT_GAP -
  DASHBOARD_HORIZONTAL_INSET -
  CARD_HORIZONTAL_INSET;
const FAB_ROW_CONTENT_KEEP_CLEAR =
  FLOATING_ACTION_SIZE +
  FLOATING_ACTION_RIGHT_OFFSET +
  FLOATING_ACTION_CONTENT_GAP -
  DASHBOARD_HORIZONTAL_INSET -
  ROW_HORIZONTAL_INSET;
const FAB_SECTION_HEADER_KEEP_CLEAR =
  FLOATING_ACTION_SIZE +
  FLOATING_ACTION_RIGHT_OFFSET +
  FLOATING_ACTION_CONTENT_GAP -
  DASHBOARD_HORIZONTAL_INSET;

function formatWorkPackageStatusLabel(status: WorkPackageStatus): string {
  return formatWorkPackageStatusPresentation(status, { prefixed: false });
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export type WorkProgressContentProps = {
  projectId: string;
  onOpenWorkPackage?: (args: {
    remoteProjectId: string;
    workPackageId: string;
  }) => void;
};

type WorkPackageProgressRow = {
  id: string;
  name: string;
  workPackageStatus: WorkPackageStatus;
  assignmentCount: number;
  statusCounts: Partial<Record<WorkPackageAssignmentStatus, number>>;
};

type ProjectVarianceRow = {
  variance: RankedProjectVariance;
  label: string;
  workPackageName?: string;
};

function formatVariancePercent(value: number): string {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value < 0 ? "-" : value > 0 ? "+" : ""}${formatted}%`;
}

function formatVarianceQuantity(difference: number, unit: string): string {
  if (difference === 0) return "On plan";
  const quantity = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(Math.abs(difference));
  return `${quantity}${unit ? ` ${unit}` : ""} ${difference < 0 ? "below" : "above"} plan`;
}

function formatDeltaDisposition(status: RankedProjectVariance["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function LargestVariancesCard({
  rows,
  loading,
  unavailable,
}: {
  rows: ProjectVarianceRow[];
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <View style={styles.varianceCard}>
      <View style={[styles.sectionHeader, styles.cardSectionHeader]}>
        <Text style={styles.statusTitle}>Largest variances</Text>
        {!loading && !unavailable ? (
          <Text style={styles.packageCount}>
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <Text style={styles.varianceStateText}>Loading variance data…</Text>
      ) : unavailable ? (
        <Text style={styles.varianceStateText}>Variance data unavailable.</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.varianceStateText}>No recorded variances yet.</Text>
      ) : (
        <View style={styles.varianceRows}>
          {rows.map(({ variance, label, workPackageName }) => (
            <View key={variance.planItemId} style={styles.varianceRow}>
              <View style={styles.varianceRowTop}>
                <Text style={styles.varianceItemName} numberOfLines={2}>
                  {label}
                </Text>
                <Text style={styles.variancePercent}>
                  {formatVariancePercent(variance.percentDifference)}
                </Text>
              </View>
              <Text style={styles.varianceQuantity}>
                {formatVarianceQuantity(variance.difference, variance.unit)}
              </Text>
              <Text style={styles.varianceDisposition}>
                {workPackageName ? `${workPackageName} · ` : ""}
                {formatDeltaDisposition(variance.status)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

type ProjectProgressSummary = ReturnType<typeof summarizeProjectProgress>;

function ProjectProgressCard({
  series,
  summary,
  loading,
  unavailable,
}: {
  series: ProjectProgressSeries | null;
  summary: ProjectProgressSummary | null;
  loading: boolean;
  unavailable: boolean;
}) {
  const [chartWidth, setChartWidth] = useState(0);
  const hasNoRecords =
    !!series && series.baseline.length === 0 && series.actual.length === 0;
  const variance = summary?.variancePercent ?? null;
  const varianceColor =
    variance === null || variance === 0
      ? colors.text.secondary
      : variance < 0
        ? colors.delta
        : colors.success;
  const varianceLabel =
    variance === null
      ? "No comparison yet"
      : variance < 0
        ? "Behind plan"
        : variance > 0
          ? "Ahead of plan"
          : "On plan";
  const varianceValue =
    variance === null
      ? "—"
      : `${variance > 0 ? "+" : ""}${formatPercent(variance)}`;

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressCardHeader}>
        <Text style={styles.progressCardTitle}>Project progress</Text>
        {!hasNoRecords && !unavailable ? (
          <Text style={styles.progressCurrentLabel}>Current</Text>
        ) : null}
      </View>

      {unavailable ? (
        <Text style={styles.progressEmptyText}>Progress data unavailable.</Text>
      ) : loading ? (
        <Text style={styles.progressEmptyText}>Loading progress data…</Text>
      ) : hasNoRecords || !series ? (
        <>
          <Text style={styles.progressEmptyText}>No progress data yet.</Text>
          <Text style={styles.progressHint}>
            Add planned baseline and actual progress from the Project tab.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.progressMetrics}>
            <View style={styles.progressMetric}>
              <Text style={styles.progressMetricLabel}>ACTUAL</Text>
              <Text style={styles.progressMetricValue}>
                {summary?.currentActualPercent == null
                  ? "—"
                  : formatPercent(summary.currentActualPercent)}
              </Text>
              {summary?.currentActualPercent == null ? (
                <Text style={styles.progressMetricHint}>No actual snapshot</Text>
              ) : null}
            </View>
            <View style={styles.progressMetricDivider} />
            <View style={styles.progressMetric}>
              <Text style={styles.progressMetricLabel}>PLANNED</Text>
              <Text style={styles.progressMetricValue}>
                {summary?.currentPlannedPercent == null
                  ? "—"
                  : formatPercent(summary.currentPlannedPercent)}
              </Text>
              {summary?.currentPlannedPercent == null ? (
                <Text style={styles.progressMetricHint}>No baseline yet</Text>
              ) : null}
            </View>
            <View style={styles.progressMetricDivider} />
            <View style={styles.progressMetric}>
              <Text style={styles.progressMetricLabel}>VARIANCE</Text>
              <Text style={[styles.progressMetricValue, { color: varianceColor }]}>
                {varianceValue}
              </Text>
              <Text style={[styles.progressMetricHint, { color: varianceColor }]}>
                {varianceLabel}
              </Text>
            </View>
          </View>
          <ProgressSeriesChart
            data={buildProjectProgressChartData(series)}
            width={chartWidth}
            onLayout={setChartWidth}
          />
        </>
      )}
    </View>
  );
}

const CHART_HEIGHT = 205;
const CHART_MARGIN = { left: 35, right: 5, top: 8, bottom: 28 };
const CHART_Y_TICKS = [100, 75, 50, 25, 0] as const;

function chartX(
  pointX: number,
  data: ProjectProgressChartData,
  plotWidth: number,
): number {
  if (data.minX === null || data.maxX === null) return CHART_MARGIN.left;
  return (
    CHART_MARGIN.left +
    ((pointX - data.minX) / (data.maxX - data.minX)) * plotWidth
  );
}

function chartY(percent: number, plotHeight: number): number {
  return CHART_MARGIN.top + ((100 - percent) / 100) * plotHeight;
}

function seriesPath(
  points: ProjectProgressChartPoint[],
  data: ProjectProgressChartData,
  plotWidth: number,
  plotHeight: number,
): string | null {
  if (points.length < 2) return null;
  return points
    .map((point, index) => {
      const x = chartX(point.x, data, plotWidth);
      const y = chartY(point.percent, plotHeight);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function ProgressSeriesChart({
  data,
  width,
  onLayout,
}: {
  data: ProjectProgressChartData;
  width: number;
  onLayout: (width: number) => void;
}) {
  const plotWidth = Math.max(1, width - CHART_MARGIN.left - CHART_MARGIN.right);
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const plannedPath = seriesPath(data.baseline, data, plotWidth, plotHeight);
  const actualPath = seriesPath(data.actual, data, plotWidth, plotHeight);

  return (
    <View style={styles.chartBlock}>
      <View
        style={styles.chartFrame}
        onLayout={(event) => onLayout(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Svg
            width={width}
            height={CHART_HEIGHT}
            accessibilityRole="image"
            accessibilityLabel="Planned and actual project progress over time, from 0 to 100 percent"
          >
            {CHART_Y_TICKS.map((tick) => {
              const y = chartY(tick, plotHeight);
              return (
                <React.Fragment key={tick}>
                  <Line
                    x1={CHART_MARGIN.left}
                    y1={y}
                    x2={CHART_MARGIN.left + plotWidth}
                    y2={y}
                    stroke={tick === 0 ? colors.border : colors.shadow.soft}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={CHART_MARGIN.left - 7}
                    y={y + 3.5}
                    fill={colors.text.muted}
                    fontSize={9}
                    textAnchor="end"
                    fontFamily="Poppins_400Regular"
                  >
                    {tick}%
                  </SvgText>
                </React.Fragment>
              );
            })}

            {plannedPath ? (
              <Path
                d={plannedPath}
                fill="none"
                stroke={colors.brand.blue}
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {actualPath ? (
              <Path
                d={actualPath}
                fill="none"
                stroke={colors.brand.navy}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {data.baseline.map((point) => (
              <Circle
                key={`planned-${point.id}`}
                cx={chartX(point.x, data, plotWidth)}
                cy={chartY(point.percent, plotHeight)}
                r={3.5}
                fill={colors.brand.blue}
                stroke={colors.surface}
                strokeWidth={1}
              />
            ))}
            {data.actual.map((point) => (
              <Circle
                key={`actual-${point.id}`}
                cx={chartX(point.x, data, plotWidth)}
                cy={chartY(point.percent, plotHeight)}
                r={4}
                fill={colors.brand.navy}
                stroke={colors.surface}
                strokeWidth={1}
              />
            ))}

            {data.ticks.map((tick) => (
              <SvgText
                key={tick.date}
                x={chartX(tick.x, data, plotWidth)}
                y={CHART_HEIGHT - 5}
                fill={colors.text.muted}
                fontSize={9}
                textAnchor="middle"
                fontFamily="Poppins_400Regular"
              >
                {tick.label}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>

      <View style={styles.chartLegend}>
        <View style={styles.chartLegendEntry}>
          <View style={styles.actualLegendDot} />
          <Text style={styles.chartLegendText}>Actual</Text>
        </View>
        <View style={styles.chartLegendEntry}>
          <View style={styles.plannedLegendLine} />
          <Text style={styles.chartLegendText}>Planned</Text>
        </View>
      </View>
    </View>
  );
}

function summarizeStatuses(
  counts: Partial<Record<WorkPackageAssignmentStatus, number>>,
): string {
  const parts: string[] = [];
  const order: WorkPackageAssignmentStatus[] = [
    "ready_for_review",
    "in_progress",
    "accepted",
    "assigned",
    "completed",
  ];
  for (const status of order) {
    const count = counts[status] ?? 0;
    if (count > 0) {
      parts.push(
        `${count} ${formatAssignmentStatusPresentation(status, {
          prefixed: false,
        })}`,
      );
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "No active assignments";
}

/**
 * Reusable Work Progress body (Phase UI extraction).
 * Standalone chrome (SafeArea / back / screen title) stays in WorkProgressScreen.
 */
export default function WorkProgressContent({
  projectId,
  onOpenWorkPackage,
}: WorkProgressContentProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"network" | "unavailable" | null>(null);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [rows, setRows] = useState<WorkPackageProgressRow[]>([]);
  const [progressSeries, setProgressSeries] =
    useState<ProjectProgressSeries | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressUnavailable, setProgressUnavailable] = useState(false);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [varianceRows, setVarianceRows] = useState<ProjectVarianceRow[]>([]);
  const [varianceLoading, setVarianceLoading] = useState(true);
  const [varianceUnavailable, setVarianceUnavailable] = useState(false);
  const [canCreateWorkPackages, setCanCreateWorkPackages] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setLoading(false);
        setError("unavailable");
        setRows([]);
        setCanCreateWorkPackages(false);
        setProgressSeries(null);
        setProgressLoading(false);
        setProgressUnavailable(true);
        return;
      }

      let active = true;
      setProgressSeries(null);
      setProgressLoading(true);
      setProgressUnavailable(false);
      setVarianceRows([]);
      setVarianceLoading(true);
      setVarianceUnavailable(false);

      async function load() {
        setLoading(true);
        setError(null);

        try {
          const ownerUid = user!.uid;
          const project = await getProjectById(ownerUid, projectId);
          if (!project) {
            if (active) {
              setError("unavailable");
              setRows([]);
              setCanCreateWorkPackages(false);
              setProgressLoading(false);
            }
            return;
          }

          const mapped = await getRemoteProjectId(ownerUid, projectId);
          if (!mapped) {
            if (active) {
              setError("unavailable");
              setRows([]);
              setProgressLoading(false);
            }
            return;
          }

          if (!active) return;
          void getProjectProgress(mapped)
            .then((series) => {
              if (active) {
                setProgressSeries(series);
                setProgressUnavailable(false);
              }
            })
            .catch(() => {
              if (active) {
                setProgressSeries(null);
                setProgressUnavailable(true);
              }
            })
            .finally(() => {
              if (active) setProgressLoading(false);
            });

          const workPackagesPromise = getRemoteWorkPackagesForProject(mapped);
          const localPlanItemsPromise = getPlanItemsForProject(
            ownerUid,
            projectId,
          );
          const planItemMappingsPromise = getPlanItemCloudMappingsForProject(
            ownerUid,
            projectId,
          );

          void Promise.all([
            getRemoteMeasurementsForProject(mapped),
            getRemoteDeltasForProject(mapped),
            planItemMappingsPromise,
            localPlanItemsPromise,
            workPackagesPromise,
          ])
            .then(([measurements, deltas, mappings, localItems, packages]) => {
              if (!active) return;
              const ranked = rankCurrentProjectVariances(measurements, deltas);
              const localItemById = new Map(
                localItems.map((item) => [item.id, item]),
              );
              const localIdByRemoteId = new Map(
                mappings.map((mapping) => [
                  mapping.remotePlanItemId,
                  mapping.localPlanItemId,
                ]),
              );
              const resolvedRows = ranked.flatMap((variance) => {
                const localId = localIdByRemoteId.get(variance.planItemId);
                const item = localId ? localItemById.get(localId) : undefined;
                if (!item?.label?.trim()) return [];
                const associatedPackages = packages.filter((workPackage) =>
                  workPackage.planItemIds.includes(variance.planItemId),
                );
                return [{
                  variance,
                  label: item.label,
                  ...(associatedPackages.length === 1
                    ? { workPackageName: associatedPackages[0].name }
                    : {}),
                }];
              });
              setVarianceRows(resolvedRows.slice(0, 3));
              setVarianceUnavailable(false);
            })
            .catch(() => {
              if (active) {
                setVarianceRows([]);
                setVarianceUnavailable(true);
              }
            })
            .finally(() => {
              if (active) setVarianceLoading(false);
            });

          const [workPackages, assignments, localPlanItems] = await Promise.all([
            workPackagesPromise,
            getRemoteWorkPackageAssignmentsForProject(mapped),
            localPlanItemsPromise.catch(() => []),
          ]);

          if (!active) {
            return;
          }

          const nextRows: WorkPackageProgressRow[] = workPackages.map((wp) => {
            const packageAssignments = assignments.filter(
              (assignment) =>
                assignment.workPackageId === wp.id &&
                assignment.status !== "cancelled",
            );
            const statusCounts: Partial<
              Record<WorkPackageAssignmentStatus, number>
            > = {};
            for (const assignment of packageAssignments) {
              statusCounts[assignment.status] =
                (statusCounts[assignment.status] ?? 0) + 1;
            }
            return {
              id: wp.id,
              name: wp.name,
              workPackageStatus: wp.status,
              assignmentCount: packageAssignments.length,
              statusCounts,
            };
          });

          setRemoteProjectId(mapped);
          setRows(nextRows);
          setPlanItems(localPlanItems);
          // Local owner-scoped project resolution matches the existing
          // owner-only work-package creation flow.
          setCanCreateWorkPackages(true);
        } catch {
          if (active) {
            setError("network");
            setRows([]);
            setCanCreateWorkPackages(false);
            setProgressLoading(false);
            setProgressUnavailable(true);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void load();
      return () => {
        active = false;
      };
    }, [user?.uid, projectId, retryToken]),
  );

  const readyCount = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + (row.statusCounts.ready_for_review ?? 0),
        0,
      ),
    [rows],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<WorkPackageStatus, number> = {
      draft: 0,
      ready: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of rows) counts[row.workPackageStatus] += 1;
    return counts;
  }, [rows]);

  const progressSummary = useMemo(
    () => progressSeries
      ? summarizeProjectProgress(progressSeries)
      : null,
    [progressSeries],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand.blue} />
        <Text style={styles.stateText}>Loading work progress…</Text>
      </View>
    );
  }

  if (error === "unavailable" || error === "network") {
    return (
      <View style={styles.container}>
        {error === "network" ? (
          <View style={styles.centered}>
            <Text style={styles.stateText}>Unable to load work progress.</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => setRetryToken((value) => value + 1)}
              accessibilityRole="button"
              accessibilityLabel="Retry loading work progress"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.centered}>
            <Text style={styles.stateText}>
              Cloud work progress is not available for this project yet.
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {readyCount > 0 ? (
        <View style={styles.reviewBanner}>
          <Ionicons name="time-outline" size={17} color={colors.delta} />
          <Text style={styles.reviewBannerText}>
            {readyCount} assignment{readyCount === 1 ? "" : "s"} ready for review
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom:
              FLOATING_ACTION_SIZE +
              FLOATING_ACTION_BOTTOM_OFFSET +
              FLOATING_ACTION_CLEARANCE +
              insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ProjectProgressCard
          series={progressSeries}
          summary={progressSummary}
          loading={progressLoading}
          unavailable={progressUnavailable}
        />

        <View style={styles.statusCard}>
          <View style={[styles.sectionHeader, styles.cardSectionHeader]}>
            <Text style={styles.statusTitle}>Work package status</Text>
            <Text style={styles.packageCount}>
              {rows.length} {rows.length === 1 ? "package" : "packages"}
            </Text>
          </View>
          {rows.length > 0 ? (
            <>
              <View
                style={styles.statusBar}
                accessibilityLabel={WORK_PACKAGE_STATUSES.map(
                  (status) => `${formatWorkPackageStatusLabel(status)} ${statusCounts[status]}`,
                ).join(", ")}
              >
                {WORK_PACKAGE_STATUSES.map((status) =>
                  statusCounts[status] > 0 ? (
                    <View
                      key={status}
                      style={{
                        flex: statusCounts[status],
                        backgroundColor: WORK_PACKAGE_STATUS_COLORS[status],
                      }}
                    />
                  ) : null,
                )}
              </View>
              <View style={styles.legendGrid}>
                {WORK_PACKAGE_STATUSES.filter((status) => statusCounts[status] > 0).map(
                  (status) => (
                    <View key={status} style={styles.legendItem}>
                      <View style={styles.legendLabelRow}>
                        <View
                          style={[
                            styles.legendDot,
                            { backgroundColor: WORK_PACKAGE_STATUS_COLORS[status] },
                          ]}
                        />
                        <Text style={styles.legendText}>
                          {formatWorkPackageStatusLabel(status)}
                        </Text>
                      </View>
                      <Text style={styles.legendCount}>
                        {statusCounts[status]} {statusCounts[status] === 1 ? "package" : "packages"}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </>
          ) : (
            <Text style={styles.emptySummary}>No work packages to summarize.</Text>
          )}
        </View>

        <LargestVariancesCard
          rows={varianceRows}
          loading={varianceLoading}
          unavailable={varianceUnavailable}
        />

        <View style={[styles.sectionHeader, styles.sectionHeaderKeepClear]}>
          <Text style={styles.sectionTitle}>Work packages</Text>
          <Text style={styles.sectionCount}>
            {rows.length} {rows.length === 1 ? "package" : "packages"}
          </Text>
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="albums-outline" size={25} color={colors.brand.navy} />
            </View>
            <Text style={styles.emptyTitle}>No work packages yet</Text>
            <Text style={styles.emptyText}>
              Create work packages to organize project execution.
            </Text>
          </View>
        ) : (
          rows.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => {
                if (!remoteProjectId) return;
                onOpenWorkPackage?.({ remoteProjectId, workPackageId: item.id });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open progress for ${item.name}`}
            >
              <View style={styles.cardMain}>
                <Text style={styles.cardName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: `${WORK_PACKAGE_STATUS_COLORS[item.workPackageStatus]}14` },
                  ]}
                >
                  <View
                    style={[
                      styles.statusPillDot,
                      { backgroundColor: WORK_PACKAGE_STATUS_COLORS[item.workPackageStatus] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: WORK_PACKAGE_STATUS_COLORS[item.workPackageStatus] },
                    ]}
                  >
                    {formatWorkPackageStatusLabel(item.workPackageStatus)}
                  </Text>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.assignmentInfo}>
                  <Text style={styles.assignmentCount}>
                    {item.assignmentCount} assignment
                    {item.assignmentCount === 1 ? "" : "s"}
                  </Text>
                  <Text style={styles.summary} numberOfLines={2}>
                    {summarizeStatuses(item.statusCounts)}
                  </Text>
                  {(item.statusCounts.ready_for_review ?? 0) > 0 ? (
                    <Text style={styles.readyText}>Ready for review</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={19} color={colors.text.muted} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {canCreateWorkPackages && user?.uid ? (
        <Pressable
          style={({ pressed }) => [
            styles.floatingAddButton,
            { bottom: FLOATING_ACTION_BOTTOM_OFFSET + insets.bottom },
            pressed && styles.floatingAddButtonPressed,
          ]}
          onPress={() => setOrganizeOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add work package"
          hitSlop={8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {canCreateWorkPackages && user?.uid ? (
        <OrganizeWorkModal
          visible={organizeOpen}
          projectId={projectId}
          ownerUid={user.uid}
          canMutate
          planItems={planItems}
          onClose={() => setOrganizeOpen(false)}
          onUpdated={() => setRetryToken((value) => value + 1)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  reviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#FFF7E8",
  },
  reviewBannerText: {
    ...typography.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  stateText: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.brand.blue,
  },
  retryButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 17,
    paddingTop: 16,
    gap: 11,
  },
  statusCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 17,
    backgroundColor: colors.surface,
    gap: 12,
  },
  varianceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 17,
    backgroundColor: colors.surface,
    gap: 14,
  },
  varianceRows: { gap: 12 },
  varianceRow: {
    paddingTop: 11,
    paddingRight: FAB_CARD_CONTENT_KEEP_CLEAR,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 3,
  },
  varianceRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  varianceItemName: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  variancePercent: {
    ...typography.bodyMedium,
    color: colors.brand.navy,
    fontVariant: ["tabular-nums"],
  },
  varianceQuantity: { ...typography.caption, color: colors.text.secondary },
  varianceDisposition: { ...typography.metadata, color: colors.text.muted },
  varianceStateText: { ...typography.caption, color: colors.text.secondary },
  progressCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 17,
    backgroundColor: colors.surface,
    gap: 13,
  },
  progressCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: FAB_CARD_CONTENT_KEEP_CLEAR,
  },
  progressCardTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    fontSize: 16,
  },
  progressCurrentLabel: {
    ...typography.caption,
    color: colors.text.muted,
  },
  progressMetrics: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingRight: FAB_CARD_CONTENT_KEEP_CLEAR,
  },
  progressMetric: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  progressMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 10,
  },
  progressMetricLabel: {
    ...typography.metadata,
    color: colors.text.muted,
    letterSpacing: 0.45,
  },
  progressMetricValue: {
    ...typography.sectionTitle,
    color: colors.brand.navy,
    fontSize: 20,
    lineHeight: 26,
  },
  progressMetricHint: {
    ...typography.metadata,
    color: colors.text.muted,
  },
  progressEmptyText: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  progressHint: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: -8,
  },
  chartBlock: {
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chartFrame: {
    height: 205,
    width: "100%",
  },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 22,
    paddingTop: 1,
  },
  chartLegendEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  actualLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.navy,
  },
  plannedLegendLine: {
    width: 18,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.brand.blue,
  },
  chartLegendText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardSectionHeader: { paddingRight: FAB_CARD_CONTENT_KEEP_CLEAR },
  sectionHeaderKeepClear: { paddingRight: FAB_SECTION_HEADER_KEEP_CLEAR },
  statusTitle: { ...typography.sectionTitle, color: colors.text.primary, fontSize: 16 },
  packageCount: { ...typography.caption, color: colors.text.muted },
  statusBar: {
    height: 13,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: colors.shadow.soft,
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 10,
    paddingRight: FAB_CARD_CONTENT_KEEP_CLEAR,
  },
  legendItem: {
    width: "48%",
    gap: 2,
  },
  legendLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { ...typography.caption, color: colors.text.secondary, fontSize: 11 },
  legendCount: {
    ...typography.caption,
    color: colors.text.primary,
    fontWeight: "600",
    fontSize: 11,
    paddingLeft: 13,
  },
  emptySummary: { ...typography.caption, color: colors.text.muted },
  sectionTitle: { ...typography.sectionTitle, color: colors.text.primary, fontSize: 17 },
  sectionCount: { ...typography.caption, color: colors.text.muted, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    gap: 7,
  },
  cardPressed: { opacity: 0.92 },
  cardMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 9,
    paddingRight: FAB_ROW_CONTENT_KEEP_CLEAR,
  },
  cardName: {
    ...typography.bodyMedium,
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusPillDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { ...typography.caption, fontSize: 10, fontWeight: "600" },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingRight: FAB_ROW_CONTENT_KEEP_CLEAR,
  },
  assignmentInfo: { flex: 1, gap: 3 },
  assignmentCount: { ...typography.caption, color: colors.text.secondary },
  summary: {
    ...typography.caption,
    color: colors.text.muted,
    fontSize: 11,
  },
  readyText: {
    ...typography.caption,
    color: colors.delta,
    fontWeight: "600",
    fontSize: 11,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 26,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
    marginBottom: 3,
  },
  emptyTitle: { ...typography.bodyMedium, color: colors.text.primary },
  emptyText: { ...typography.caption, color: colors.text.muted, textAlign: "center" },
  floatingAddButton: {
    position: "absolute",
    right: FLOATING_ACTION_RIGHT_OFFSET,
    width: FLOATING_ACTION_SIZE,
    height: FLOATING_ACTION_SIZE,
    borderRadius: FLOATING_ACTION_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand.navy,
    shadowColor: colors.brand.navy,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 7,
    zIndex: 20,
  },
  floatingAddButtonPressed: { opacity: 0.9, transform: [{ scale: 0.95 }] },
});
