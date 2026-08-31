import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import {
  approveRemotePlanImport,
  getRemotePlanImport,
  getRemotePlanImportCandidates,
  type RemotePlanImportCandidate,
} from "../services/api/planImports";
import { setPlanItemCloudMapping } from "../store/planItemCloudMappings";
import { addPlanItemsIfAbsent } from "../store/planItems";
import {
  getPlanImportById,
  updatePlanImport,
} from "../store/planImports";
import { typography } from "../theme/colors";
import type { PlanItem } from "../types/plan";
import type { PlanImport } from "../types/planImport";
import {
  formatCandidateType,
  formatPlannedValue,
} from "../utils/planImportReview";

type Props = NativeStackScreenProps<RootStackParamList, "PlanImportApproval">;

const SCREEN_BACKGROUND = require("../../assets/bgproject.png");

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";
const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";
const CARD_BACKGROUND = "rgba(255,255,255,0.80)";
const BORDER = "rgba(1,33,105,0.08)";

/**
 * Phase 2P.5 — explicit confirmation → backend-authoritative PlanItems.
 * Mobile never creates imported PlanItems on its own.
 */
export default function PlanImportApprovalScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId, importId } = route.params;

  const [planImport, setPlanImport] = useState<PlanImport | null | undefined>(
    undefined,
  );
  const [candidates, setCandidates] = useState<RemotePlanImportCandidate[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [approvedAtLabel, setApprovedAtLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.uid) {
      setPlanImport(null);
      setCandidates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const found = await getPlanImportById(user.uid, importId);
      if (!found || found.projectId !== projectId) {
        setPlanImport(null);
        setCandidates([]);
        return;
      }

      let current = found;

      if (current.remoteProjectId && current.remoteImportId) {
        try {
          const remote = await getRemotePlanImport(
            current.remoteProjectId,
            current.remoteImportId,
          );

          let nextStatus = current.status;
          if (remote.import.status === "approved") {
            nextStatus = "approved";
            if (typeof remote.import.createdPlanItemCount === "number") {
              setSuccessCount(remote.import.createdPlanItemCount);
            } else if (remote.import.createdPlanItemIds) {
              setSuccessCount(remote.import.createdPlanItemIds.length);
            }
            if (remote.import.approvedAt) {
              setApprovedAtLabel(
                new Date(remote.import.approvedAt).toLocaleDateString(),
              );
            }
          } else if (remote.import.status === "ready_for_approval") {
            nextStatus = "ready_for_approval";
          }

          const updated = await updatePlanImport(user.uid, importId, {
            status: nextStatus,
            errorMessage: remote.import.errorMessage ?? null,
          });
          current = updated ?? { ...current, status: nextStatus };

          const remoteProjectId = current.remoteProjectId;
          const remoteImportId = current.remoteImportId;
          if (!remoteProjectId || !remoteImportId) {
            setPlanImport(current);
            return;
          }

          const cand = await getRemotePlanImportCandidates(
            remoteProjectId,
            remoteImportId,
          );
          setCandidates(cand.candidates);
        } catch {
          // Keep local snapshot when remote fetch fails.
        }
      }

      setPlanImport(current);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, importId, projectId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selected = useMemo(
    () => candidates.filter((candidate) => candidate.selected),
    [candidates],
  );

  const reviewedSelected = useMemo(
    () => selected.filter((candidate) => candidate.reviewStatus === "reviewed"),
    [selected],
  );

  const isApproved =
    planImport?.status === "approved" || successCount !== null;

  const handleBackToPlan = () => {
    navigation.navigate("Project", { projectId });
  };

  const handleBackToReview = () => {
    navigation.navigate("PlanImportReview", {
      projectId,
      importId,
      historicalView: isApproved,
    });
  };

  const runApproval = async () => {
    if (
      !user?.uid ||
      !planImport?.remoteProjectId ||
      !planImport.remoteImportId ||
      approving
    ) {
      return;
    }

    setApproving(true);
    try {
      const result = await approveRemotePlanImport(
        planImport.remoteProjectId,
        planImport.remoteImportId,
      );

      await updatePlanImport(user.uid, importId, {
        status: "approved",
        errorMessage: null,
      });

      const localItems: PlanItem[] = result.planItems.map((remote) => ({
        id: remote.localPlanItemId,
        projectId,
        type: remote.type,
        label: remote.label,
        plannedValue: remote.plannedValue,
        unit: remote.unit,
        unitCost: remote.unitCost,
        productionRatePerDay: remote.productionRatePerDay,
        laborHoursPerUnit: remote.laborHoursPerUnit,
        origin: remote.origin ?? "plan_import",
        planImportId: remote.planImportId,
        planImportCandidateId: remote.planImportCandidateId,
      }));

      if (localItems.length > 0) {
        await addPlanItemsIfAbsent(user.uid, localItems);
        for (const remote of result.planItems) {
          await setPlanItemCloudMapping({
            ownerUid: user.uid,
            localProjectId: projectId,
            remoteProjectId: planImport.remoteProjectId,
            localPlanItemId: remote.localPlanItemId,
            remotePlanItemId: remote.id,
          });
        }
      }

      setSuccessCount(result.createdCount);
      if (result.import.approvedAt) {
        setApprovedAtLabel(
          new Date(result.import.approvedAt).toLocaleDateString(),
        );
      }
      setPlanImport((prev) =>
        prev ? { ...prev, status: "approved" } : prev,
      );
    } catch (error) {
      // Ambiguous network: approval may have succeeded. Prefer idempotent
      // replay over telling the user to recreate PlanItems.
      try {
        const replay = await approveRemotePlanImport(
          planImport.remoteProjectId,
          planImport.remoteImportId,
        );
        await updatePlanImport(user.uid, importId, {
          status: "approved",
          errorMessage: null,
        });
        const localItems: PlanItem[] = replay.planItems.map((remote) => ({
          id: remote.localPlanItemId,
          projectId,
          type: remote.type,
          label: remote.label,
          plannedValue: remote.plannedValue,
          unit: remote.unit,
          unitCost: remote.unitCost,
          productionRatePerDay: remote.productionRatePerDay,
          laborHoursPerUnit: remote.laborHoursPerUnit,
          origin: remote.origin ?? "plan_import",
          planImportId: remote.planImportId,
          planImportCandidateId: remote.planImportCandidateId,
        }));
        if (localItems.length > 0) {
          await addPlanItemsIfAbsent(user.uid, localItems);
          for (const remote of replay.planItems) {
            await setPlanItemCloudMapping({
              ownerUid: user.uid,
              localProjectId: projectId,
              remoteProjectId: planImport.remoteProjectId,
              localPlanItemId: remote.localPlanItemId,
              remotePlanItemId: remote.id,
            });
          }
        }
        setSuccessCount(replay.createdCount);
        if (replay.import.approvedAt) {
          setApprovedAtLabel(
            new Date(replay.import.approvedAt).toLocaleDateString(),
          );
        }
        setPlanImport((prev) =>
          prev ? { ...prev, status: "approved" } : prev,
        );
        return;
      } catch {
        await load();
        const latest = await getPlanImportById(user.uid, importId);
        if (latest?.status === "approved") {
          setSuccessCount(selected.length);
          return;
        }
      }

      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unable to create Plan Items from this import.";
      Alert.alert("Approval failed", message);
    } finally {
      setApproving(false);
    }
  };

  const handleApprovePress = () => {
    if (approving || selected.length === 0) {
      return;
    }

    Alert.alert(
      "Add reviewed items to Plan?",
      `${selected.length} reviewed item${selected.length === 1 ? "" : "s"} will become part of the project baseline.\n\nYou can continue managing them from the Plan afterward.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add to Plan",
          onPress: () => {
            void runApproval();
          },
        },
      ],
    );
  };

  if (loading || planImport === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ImageBackground
          source={SCREEN_BACKGROUND}
          style={styles.background}
          resizeMode="cover"
        >
          <View style={styles.centered}>
            <ActivityIndicator color={KEPLER_NAVY} />
            <Text style={styles.loadingText}>Loading confirmation…</Text>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  if (!planImport) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ImageBackground
          source={SCREEN_BACKGROUND}
          style={styles.background}
          resizeMode="cover"
        >
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
              onPress={handleBackToPlan}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />
            </Pressable>
            <Text style={styles.topBarTitle}>Confirm plan</Text>
            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.centeredState}>
            <View style={styles.missingIcon}>
              <Ionicons
                name="folder-open-outline"
                size={24}
                color={KEPLER_NAVY}
              />
            </View>
            <Text style={styles.eyebrow}>IMPORT WORKSPACE</Text>
            <Text style={styles.title}>Import not found</Text>
            <Text style={styles.bodyCentered}>
              This import may have been removed or is unavailable on this
              device.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={handleBackToPlan}
              accessibilityRole="button"
              accessibilityLabel="Back to Plan"
            >
              <Text style={styles.primaryButtonText}>Back to Plan</Text>
            </Pressable>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  if (isApproved) {
    const count = successCount ?? selected.length;
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ImageBackground
          source={SCREEN_BACKGROUND}
          style={styles.background}
          resizeMode="cover"
        >
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
              onPress={handleBackToPlan}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />
            </Pressable>
            <Text style={styles.topBarTitle}>Confirm plan</Text>
            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={28} color={KEPLER_NAVY} />
            </View>

            <Text style={styles.eyebrow}>PLAN CREATED</Text>
            <Text style={styles.title}>Plan created</Text>
            <Text style={styles.bodyCentered}>
              {count} reviewed item{count === 1 ? " was" : "s were"} added
              {approvedAtLabel
                ? ` on ${approvedAtLabel}.`
                : " to the project baseline."}
            </Text>

            <View style={styles.successMetric}>
              <Text style={styles.successMetricValue}>{count}</Text>
              <Text style={styles.successMetricLabel}>PLAN ITEMS</Text>
            </View>

            <Text style={styles.successFootnote}>
              These items are now part of the Plan. Further changes can be
              managed from the Plan.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={handleBackToPlan}
              accessibilityRole="button"
              accessibilityLabel="View Plan"
            >
              <Text style={styles.primaryButtonText}>View Plan</Text>
            </Pressable>

            <Pressable
              style={styles.textSecondaryButton}
              onPress={handleBackToReview}
              accessibilityRole="button"
              accessibilityLabel="View reviewed suggestions"
            >
              <Text style={styles.textSecondaryButtonText}>
                View reviewed suggestions
              </Text>
            </Pressable>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  const unresolvedCount = Math.max(
    selected.length - reviewedSelected.length,
    0,
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ImageBackground
        source={SCREEN_BACKGROUND}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={handleBackToReview}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            disabled={approving}
          >
            <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />
          </Pressable>
          <Text style={styles.topBarTitle}>Confirm plan</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <FlatList
          data={selected}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.introRow}>
                <Text style={styles.eyebrow}>GENERATE PLAN</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>READY TO ADD</Text>
                </View>
              </View>

              <Text style={styles.title}>Ready to create Plan</Text>
              <Text style={styles.body}>
                {selected.length} reviewed item
                {selected.length === 1 ? " is" : "s are"} ready to become part
                of the project baseline.
              </Text>

              <View style={styles.summaryCard}>
                <View pointerEvents="none" style={styles.sectionTopAccent}>
                  <View style={styles.sectionTopAccentBlue} />
                  <View style={styles.sectionTopAccentRed} />
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{selected.length}</Text>
                    <Text style={styles.metricLabel}>PLAN ITEMS</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>
                      {reviewedSelected.length}
                    </Text>
                    <Text style={styles.metricLabel}>REVIEWED</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{unresolvedCount}</Text>
                    <Text style={styles.metricLabel}>UNRESOLVED</Text>
                  </View>
                </View>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionLabel}>ITEMS TO ADD</Text>
                <Text style={styles.sectionCount}>{selected.length}</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const value = formatPlannedValue(item.plannedValue, item.unit);
            const isReviewed = item.reviewStatus === "reviewed";
            return (
              <View style={styles.previewRow}>
                <View style={styles.previewMain}>
                  <Text style={styles.previewLabel} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={styles.previewMeta} numberOfLines={1}>
                    {value ? `${value} · ` : ""}
                    {formatCandidateType(item.type)}
                  </Text>
                </View>
                {isReviewed ? (
                  <Ionicons
                    name="checkmark"
                    size={12}
                    color={TEXT_MUTED}
                    style={styles.reviewedCheck}
                    accessibilityLabel="Reviewed"
                  />
                ) : null}
              </View>
            );
          }}
          ItemSeparatorComponent={() => (
            <View style={styles.itemSeparator} />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No selected suggestions are ready. Return to review to select
              items.
            </Text>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.readyEyebrow}>READY TO CREATE</Text>
              <Text style={styles.footnote}>
                These reviewed items will become part of the project baseline.
              </Text>

              <Pressable
                style={[
                  styles.primaryButton,
                  (approving || selected.length === 0) &&
                    styles.primaryDisabled,
                ]}
                onPress={handleApprovePress}
                disabled={approving || selected.length === 0}
                accessibilityRole="button"
                accessibilityLabel={`Add ${selected.length} items to Plan`}
                accessibilityState={{
                  disabled: approving || selected.length === 0,
                }}
              >
                {approving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {selected.length === 0
                      ? "No items selected"
                      : `Add ${selected.length} item${selected.length === 1 ? "" : "s"} to Plan`}
                  </Text>
                )}
              </Pressable>

              {approving ? (
                <Text style={styles.creating}>Creating Plan...</Text>
              ) : null}

              <Pressable
                style={styles.textSecondaryButton}
                onPress={handleBackToReview}
                disabled={approving}
                accessibilityRole="button"
                accessibilityLabel="Back to review"
              >
                <Text style={styles.textSecondaryButtonText}>
                  Back to review
                </Text>
              </Pressable>
            </View>
          }
        />
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  topBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },
  topBarSpacer: {
    width: 40,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 40,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 28,
  },
  listHeader: {
    marginBottom: 2,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  loadingText: {
    ...typography.body,
    color: TEXT_SECONDARY,
  },
  missingIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,33,105,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    marginBottom: 14,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.18)",
    backgroundColor: "rgba(255,255,255,0.55)",
    marginBottom: 18,
  },
  introRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  eyebrow: {
    ...typography.metadata,
    color: KEPLER_NAVY,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  statusBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(1,33,105,0.08)",
    borderColor: "rgba(1,33,105,0.12)",
    flexShrink: 1,
  },
  statusBadgeText: {
    ...typography.metadata,
    color: KEPLER_NAVY,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    ...typography.title,
    color: TEXT_PRIMARY,
    marginTop: 7,
  },
  body: {
    ...typography.body,
    color: TEXT_SECONDARY,
    marginTop: 9,
    lineHeight: 21,
  },
  bodyCentered: {
    ...typography.body,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  summaryCard: {
    marginTop: 22,
    backgroundColor: CARD_BACKGROUND,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 16,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    minHeight: 108,
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  sectionTopAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    flexDirection: "row",
    zIndex: 2,
  },
  sectionTopAccentBlue: {
    flex: 1,
    backgroundColor: KEPLER_NAVY,
  },
  sectionTopAccentRed: {
    width: 34,
    backgroundColor: KEPLER_RED,
  },
  metricsRow: {
    flexDirection: "row",
  },
  metric: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  metricValue: {
    ...typography.sectionTitle,
    color: TEXT_PRIMARY,
  },
  metricLabel: {
    ...typography.metadata,
    color: TEXT_MUTED,
    letterSpacing: 0.4,
    fontSize: 10,
    opacity: 0.9,
  },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    ...typography.metadata,
    color: TEXT_MUTED,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  sectionCount: {
    ...typography.metadata,
    color: TEXT_MUTED,
    fontWeight: "600",
    opacity: 0.85,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  previewMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewLabel: {
    ...typography.bodyMedium,
    color: TEXT_PRIMARY,
    fontWeight: "600",
  },
  previewMeta: {
    ...typography.caption,
    color: TEXT_SECONDARY,
    fontSize: 13,
  },
  reviewedCheck: {
    marginTop: 2,
    opacity: 0.45,
  },
  itemSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(1,33,105,0.07)",
  },
  empty: {
    ...typography.body,
    color: TEXT_MUTED,
    marginTop: 8,
  },
  footer: {
    marginTop: 26,
    paddingBottom: 8,
  },
  readyEyebrow: {
    ...typography.metadata,
    color: KEPLER_NAVY,
    fontWeight: "700",
    letterSpacing: 1.0,
  },
  footnote: {
    ...typography.body,
    color: TEXT_SECONDARY,
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: 0,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: KEPLER_NAVY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    width: "100%",
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
  },
  creating: {
    ...typography.caption,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: 10,
  },
  textSecondaryButton: {
    marginTop: 20,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textSecondaryButtonText: {
    ...typography.button,
    color: KEPLER_NAVY,
    fontWeight: "700",
  },
  successMetric: {
    marginTop: 22,
    marginBottom: 8,
    alignItems: "center",
    gap: 4,
  },
  successMetricValue: {
    ...typography.title,
    color: TEXT_PRIMARY,
  },
  successMetricLabel: {
    ...typography.metadata,
    color: TEXT_MUTED,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  successFootnote: {
    ...typography.body,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 22,
    maxWidth: 320,
  },
});
