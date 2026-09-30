import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  createProjectProgressSnapshot,
  getProjectProgress,
  upsertProjectProgressBaseline,
} from "../../services/api/projectProgress";
import type { ProjectProgressSeries } from "../../types/projectProgress";
import { colors, typography } from "../../theme/colors";
import { localCalendarDate } from "../../utils/domain/projectProgressSummary";

type Props = {
  remoteProjectId: string | null | undefined;
  mappingError: boolean;
  visible: boolean;
  onClose: () => void;
};

const EMPTY_SERIES: ProjectProgressSeries = { baseline: [], actual: [] };

function validDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Unknown date";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export default function ProjectProgressManagementModal({
  remoteProjectId,
  mappingError,
  visible,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [series, setSeries] = useState<ProjectProgressSeries>(EMPTY_SERIES);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(localCalendarDate());
  const [plannedPercent, setPlannedPercent] = useState("");
  const [actualPercent, setActualPercent] = useState("");
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [actualError, setActualError] = useState<string | null>(null);
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [savingActual, setSavingActual] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!remoteProjectId) return;
    setLoadError(null);
    setLoading(true);
    try {
      setSeries(await getProjectProgress(remoteProjectId));
    } catch (error) {
      setLoadError(errorMessage(error, "Unable to load project progress."));
    } finally {
      setLoading(false);
    }
  }, [remoteProjectId]);

  useEffect(() => {
    if (visible && remoteProjectId) {
      setEffectiveDate(localCalendarDate());
      void load();
    }
  }, [visible, remoteProjectId, load]);

  const recentBaseline = useMemo(
    () => [...series.baseline].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).slice(0, 4),
    [series.baseline],
  );
  const recentActual = useMemo(
    () => [...series.actual].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)).slice(0, 4),
    [series.actual],
  );

  const saveBaseline = async () => {
    const percent = parsePercent(plannedPercent);
    if (!validDateOnly(effectiveDate)) {
      setBaselineError("Enter a valid date as YYYY-MM-DD.");
      return;
    }
    if (percent === null) {
      setBaselineError("Enter a planned percentage from 0 to 100.");
      return;
    }

    setBaselineError(null);
    setSavingBaseline(true);
    try {
      if (!remoteProjectId) return;
      await upsertProjectProgressBaseline(remoteProjectId, {
        effectiveDate: effectiveDate.trim(),
        plannedPercent: percent,
      });
      setPlannedPercent("");
      setRefreshing(true);
      await load();
    } catch (error) {
      setBaselineError(errorMessage(error, "Unable to save the baseline point."));
    } finally {
      setSavingBaseline(false);
      setRefreshing(false);
    }
  };

  const recordActual = async () => {
    const percent = parsePercent(actualPercent);
    if (percent === null) {
      setActualError("Enter actual progress from 0 to 100.");
      return;
    }

    setActualError(null);
    setSavingActual(true);
    try {
      if (!remoteProjectId) return;
      await createProjectProgressSnapshot(remoteProjectId, {
        capturedAt: new Date().toISOString(),
        actualPercent: percent,
      });
      setActualPercent("");
      setRefreshing(true);
      await load();
    } catch (error) {
      setActualError(errorMessage(error, "Unable to record actual progress."));
    } finally {
      setSavingActual(false);
      setRefreshing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior="padding"
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Project progress</Text>
            <Text style={styles.subtitle}>Maintain planned and actual records</Text>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close project progress"
          >
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {mappingError ? (
            <View style={styles.section}>
              <Text style={styles.muted}>Unable to check this project’s cloud connection. Close and try again.</Text>
            </View>
          ) : remoteProjectId === undefined ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand.navy} />
              <Text style={styles.muted}>Checking project cloud connection…</Text>
            </View>
          ) : remoteProjectId === null ? (
            <View style={styles.section}>
              <Text style={styles.muted}>Project progress is not available until this project is connected to cloud.</Text>
            </View>
          ) : (
            <>
          {loading && series.baseline.length === 0 && series.actual.length === 0 ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand.navy} />
              <Text style={styles.muted}>Loading progress records…</Text>
            </View>
          ) : null}

          {loadError ? (
            <View style={styles.errorNotice}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable onPress={() => void load()} accessibilityRole="button">
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Planned baseline</Text>
            <Text style={styles.helper}>Set or update the planned percentage for a calendar date.</Text>
            <Text style={styles.fieldLabel}>Effective date</Text>
            <TextInput
              value={effectiveDate}
              onChangeText={setEffectiveDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              style={styles.input}
              accessibilityLabel="Baseline effective date"
            />
            <Text style={styles.fieldLabel}>Planned progress (%)</Text>
            <View style={styles.inputWithSuffix}>
              <TextInput
                value={plannedPercent}
                onChangeText={setPlannedPercent}
                placeholder="e.g. 40"
                keyboardType="decimal-pad"
                style={styles.percentInput}
                accessibilityLabel="Planned progress percentage"
              />
              <Text style={styles.suffix}>%</Text>
            </View>
            {baselineError ? <Text style={styles.errorText}>{baselineError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, savingBaseline ? styles.disabled : null]}
              onPress={() => void saveBaseline()}
              disabled={savingBaseline}
              accessibilityRole="button"
            >
              {savingBaseline ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save baseline point</Text>}
            </Pressable>
            <Text style={styles.listHeading}>Recent baseline</Text>
            {recentBaseline.length ? recentBaseline.map((point) => (
              <View key={point.id} style={styles.recordRow}>
                <Text style={styles.recordDate}>{formatDateOnly(point.effectiveDate)}</Text>
                <Text style={styles.recordValue}>{point.plannedPercent}%</Text>
              </View>
            )) : <Text style={styles.emptyText}>No baseline points recorded.</Text>}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actual progress</Text>
            <Text style={styles.helper}>Record the observed project progress now.</Text>
            <Text style={styles.fieldLabel}>Actual progress (%)</Text>
            <View style={styles.inputWithSuffix}>
              <TextInput
                value={actualPercent}
                onChangeText={setActualPercent}
                placeholder="e.g. 32"
                keyboardType="decimal-pad"
                style={styles.percentInput}
                accessibilityLabel="Actual progress percentage"
              />
              <Text style={styles.suffix}>%</Text>
            </View>
            {actualError ? <Text style={styles.errorText}>{actualError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, savingActual ? styles.disabled : null]}
              onPress={() => void recordActual()}
              disabled={savingActual}
              accessibilityRole="button"
            >
              {savingActual ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Record snapshot</Text>}
            </Pressable>
            <Text style={styles.listHeading}>Recent actual</Text>
            {recentActual.length ? recentActual.map((snapshot) => (
              <View key={snapshot.id} style={styles.recordRow}>
                <Text style={styles.recordDate}>{formatTimestamp(snapshot.capturedAt)}</Text>
                <Text style={styles.recordValue}>{snapshot.actualPercent}%</Text>
              </View>
            )) : <Text style={styles.emptyText}>No actual snapshots recorded.</Text>}
          </View>

          {refreshing ? <Text style={styles.refreshing}>Refreshing records…</Text> : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: { flex: 1 },
  title: { ...typography.sectionTitle, color: colors.text.primary },
  subtitle: { ...typography.caption, color: colors.text.secondary, marginTop: 2 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
  },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  section: {
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  sectionTitle: { ...typography.bodyMedium, color: colors.text.primary },
  helper: { ...typography.caption, color: colors.text.secondary, marginTop: 3, marginBottom: 12 },
  fieldLabel: { ...typography.caption, color: colors.text.secondary, marginBottom: 5, marginTop: 8 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.text.primary,
    ...typography.body,
  },
  inputWithSuffix: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  percentInput: { flex: 1, paddingVertical: 9, color: colors.text.primary, ...typography.body },
  suffix: { ...typography.bodyMedium, color: colors.text.muted },
  primaryButton: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand.navy,
    paddingHorizontal: 14,
  },
  primaryButtonText: { ...typography.button, color: "#FFFFFF" },
  disabled: { opacity: 0.65 },
  listHeading: { ...typography.caption, color: colors.text.muted, marginTop: 18, marginBottom: 4 },
  recordRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recordDate: { ...typography.caption, color: colors.text.secondary },
  recordValue: { ...typography.bodyMedium, color: colors.text.primary },
  emptyText: { ...typography.caption, color: colors.text.muted, paddingVertical: 7 },
  errorNotice: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEF3F2",
    borderWidth: 1,
    borderColor: "#FECDCA",
  },
  errorText: { ...typography.caption, color: colors.danger, marginTop: 5 },
  retryText: { ...typography.button, color: colors.brand.navy, marginTop: 8 },
  muted: { ...typography.caption, color: colors.text.secondary },
  refreshing: { ...typography.caption, color: colors.text.muted, textAlign: "center" },
});
