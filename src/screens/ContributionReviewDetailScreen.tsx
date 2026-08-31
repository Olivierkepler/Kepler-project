import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import {
  getRemoteEvidenceForProject,
  getRemoteEvidenceReadUrl,
  type RemoteEvidence,
} from "../services/api/evidence";
import {
  getPendingRemoteMeasurements,
  getRemoteMeasurementsForProject,
  reviewRemoteMeasurement,
  type RemoteMeasurement,
} from "../services/api/measurements";
import { getRemotePlanItemsForProject } from "../services/api/planItems";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { getProjectMembersForProject } from "../store/projectMembers";
import { colors, typography } from "../theme/colors";
import {
  effectiveMeasurementReviewStatus,
  measurementReviewStatusColor,
} from "../utils/measurementReview";
import { formatSubmissionReviewStatusLabel } from "../utils/domain/statusPresentation";
import { formatMemberDisplayLabel } from "../utils/domain/memberDisplay";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "ContributionReviewDetail"
>;

const REVIEW_NOTE_MAX = 2000;

function formatSubmittedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ContributionReviewDetailScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { projectId, remoteProjectId, measurementId } = route.params;

  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<"network" | "unavailable" | null>(null);
  const [measurement, setMeasurement] = useState<RemoteMeasurement | null>(
    null,
  );
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const [workPackageName, setWorkPackageName] = useState<string | null>(null);
  const [submitterLabel, setSubmitterLabel] = useState("Project member");
  const [evidence, setEvidence] = useState<RemoteEvidence[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  const isPending = useMemo(
    () =>
      measurement
        ? effectiveMeasurementReviewStatus(measurement.reviewStatus) ===
          "pending"
        : false,
    [measurement],
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setLoading(false);
        setError("unavailable");
        return;
      }

      let active = true;

      async function load() {
        setLoading(true);
        setError(null);

        try {
          const ownerUid = user!.uid;
          const [allMeasurements, planItems, workPackages, members, evidenceItems] =
            await Promise.all([
              getRemoteMeasurementsForProject(remoteProjectId),
              getRemotePlanItemsForProject(remoteProjectId),
              getRemoteWorkPackagesForProject(remoteProjectId),
              getProjectMembersForProject(ownerUid, projectId),
              getRemoteEvidenceForProject(remoteProjectId),
            ]);

          if (!active) {
            return;
          }

          const found =
            allMeasurements.find((item) => item.id === measurementId) ?? null;

          if (!found) {
            setError("unavailable");
            setMeasurement(null);
            return;
          }

          const plan = planItems.find((item) => item.id === found.planItemId);
          const wp = found.submittedWorkPackageId
            ? workPackages.find(
                (item) => item.id === found.submittedWorkPackageId,
              )
            : undefined;
          const member = found.capturedByProjectMemberId
            ? members.find((item) => item.id === found.capturedByProjectMemberId)
            : undefined;

          const linkedEvidence = evidenceItems.filter(
            (item) =>
              item.localMeasurementId === found.localMeasurementId,
          );

          setMeasurement(found);
          setPlanLabel(plan?.label ?? null);
          setWorkPackageName(wp?.name ?? null);
          setSubmitterLabel(
            formatMemberDisplayLabel({
              role: member?.role,
            }),
          );
          setEvidence(linkedEvidence);

          const urls = new Map<string, string>();
          await Promise.all(
            linkedEvidence
              .filter((item) => item.type === "photo" && item.objectPath)
              .map(async (item) => {
                try {
                  const signed = await getRemoteEvidenceReadUrl(
                    remoteProjectId,
                    item.id,
                  );
                  urls.set(item.id, signed.readUrl);
                } catch {
                  // Indication without thumbnail is acceptable.
                }
              }),
          );

          if (active) {
            setPhotoUrls(urls);
          }
        } catch {
          if (active) {
            setError("network");
            setMeasurement(null);
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
    }, [user?.uid, projectId, remoteProjectId, measurementId, retryToken]),
  );

  const runReview = async (status: "accepted" | "rejected", note?: string) => {
    if (!measurement || mutating) {
      return;
    }

    setMutating(true);

    try {
      const updated = await reviewRemoteMeasurement(
        remoteProjectId,
        measurement.id,
        {
          status,
          ...(note !== undefined ? { note } : {}),
        },
      );
      setMeasurement(updated);
      setRejectVisible(false);
      setRejectNote("");

      let nextPending: RemoteMeasurement | null = null;
      try {
        const pending = await getPendingRemoteMeasurements(remoteProjectId);
        nextPending =
          pending.find((item) => item.id !== measurement.id) ?? null;
      } catch {
        // Queue refresh optional; mutation already succeeded.
      }

      const buttons: Array<{
        text: string;
        onPress?: () => void;
        style?: "cancel" | "default" | "destructive";
      }> = [
        {
          text: "Back to Needs Review",
          onPress: () => navigation.goBack(),
        },
      ];

      if (nextPending) {
        buttons.unshift({
          text: "Review next",
          onPress: () => {
            navigation.replace("ContributionReviewDetail", {
              projectId,
              remoteProjectId,
              measurementId: nextPending!.id,
            });
          },
        });
      }

      Alert.alert(
        status === "accepted" ? "Accepted" : "Rejected",
        status === "accepted"
          ? "This contribution was accepted."
          : "This contribution was rejected.",
        buttons,
      );
    } catch (reviewError) {
      const message =
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to submit review.";
      Alert.alert("Review failed", message);
    } finally {
      setMutating(false);
    }
  };

  const onAccept = () => {
    if (!isPending || mutating) {
      return;
    }

    Alert.alert(
      "Accept contribution?",
      "This marks the measurement as accepted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: () => {
            void runReview("accepted");
          },
        },
      ],
    );
  };

  const onConfirmReject = () => {
    if (!isPending || mutating) {
      return;
    }

    const trimmed = rejectNote.trim();
    void runReview(
      "rejected",
      trimmed.length > 0 ? trimmed.slice(0, REVIEW_NOTE_MAX) : undefined,
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.blue} />
          <Text style={styles.stateText}>Loading contribution…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !measurement) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.title}>Contribution</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.stateText}>
            {error === "network"
              ? "Unable to load this contribution."
              : "Contribution not found."}
          </Text>
          {error === "network" ? (
            <Pressable
              style={styles.retryButton}
              onPress={() => setRetryToken((value) => value + 1)}
              accessibilityRole="button"
              accessibilityLabel="Retry loading contribution"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = measurementReviewStatusColor(measurement.reviewStatus);
  const photoEvidence = evidence.filter((item) => item.type === "photo");
  const noteEvidence = evidence.filter((item) => item.type === "note");

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Contribution</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[styles.statusChip, { color: statusColor }]}
          accessibilityRole="text"
        >
          {formatSubmissionReviewStatusLabel(measurement.reviewStatus)}
        </Text>

        <Text style={styles.measurementLabel}>{measurement.label}</Text>
        <Text style={styles.valueLine}>
          {measurement.value.toFixed(2)} {measurement.unit}
        </Text>

        <Text style={styles.sectionLabel}>PLAN ITEM</Text>
        <Text style={styles.bodyText}>{planLabel ?? "Unavailable"}</Text>

        {workPackageName ? (
          <>
            <Text style={styles.sectionLabel}>WORK PACKAGE</Text>
            <Text style={styles.bodyText}>{workPackageName}</Text>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>SUBMITTED BY</Text>
        <Text style={styles.bodyText}>{submitterLabel}</Text>

        <Text style={styles.sectionLabel}>SUBMITTED</Text>
        <Text style={styles.bodyText}>
          {formatSubmittedAt(measurement.createdAt)}
        </Text>

        <Text style={styles.sectionLabel}>EVIDENCE</Text>
        {evidence.length === 0 ? (
          <Text style={styles.bodyText}>No supporting evidence.</Text>
        ) : (
          <View style={styles.evidenceBlock}>
            <Text style={styles.bodyText}>
              {photoEvidence.length} photo
              {photoEvidence.length === 1 ? "" : "s"}
              {noteEvidence.length > 0
                ? ` · ${noteEvidence.length} note${noteEvidence.length === 1 ? "" : "s"}`
                : ""}
            </Text>
            <View style={styles.photoRow}>
              {photoEvidence.map((item) => {
                const url = photoUrls.get(item.id);
                return (
                  <View key={item.id} style={styles.photoThumb}>
                    {url ? (
                      <Image
                        source={{ uri: url }}
                        style={styles.photoImage}
                        accessibilityLabel="Evidence photo"
                      />
                    ) : (
                      <Text style={styles.photoFallback}>Photo</Text>
                    )}
                  </View>
                );
              })}
            </View>
            {noteEvidence.map((item) => (
              <Text key={item.id} style={styles.noteText}>
                {item.note.trim() || "Note"}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      {isPending ? (
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.rejectButton,
              mutating ? styles.buttonDisabled : null,
            ]}
            onPress={() => {
              if (mutating) {
                return;
              }
              setRejectNote("");
              setRejectVisible(true);
            }}
            disabled={mutating}
            accessibilityRole="button"
            accessibilityLabel="Reject contribution"
            accessibilityState={{ disabled: mutating }}
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </Pressable>
          <Pressable
            style={[
              styles.acceptButton,
              mutating ? styles.buttonDisabled : null,
            ]}
            onPress={onAccept}
            disabled={mutating}
            accessibilityRole="button"
            accessibilityLabel="Accept contribution"
            accessibilityState={{ disabled: mutating }}
          >
            {mutating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.acceptButtonText}>Accept</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={rejectVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!mutating) {
            setRejectVisible(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject contribution</Text>
            <Text style={styles.modalHint}>
              Optional note for the contributor (max {REVIEW_NOTE_MAX}{" "}
              characters).
            </Text>
            <TextInput
              style={styles.noteInput}
              value={rejectNote}
              onChangeText={(value) =>
                setRejectNote(value.slice(0, REVIEW_NOTE_MAX))
              }
              placeholder="Owner feedback"
              placeholderTextColor={colors.text.muted}
              multiline
              maxLength={REVIEW_NOTE_MAX}
              editable={!mutating}
              accessibilityLabel="Rejection note"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setRejectVisible(false)}
                disabled={mutating}
                accessibilityRole="button"
                accessibilityLabel="Cancel rejection"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirm,
                  mutating ? styles.buttonDisabled : null,
                ]}
                onPress={onConfirmReject}
                disabled={mutating}
                accessibilityRole="button"
                accessibilityLabel="Confirm rejection"
                accessibilityState={{ disabled: mutating }}
              >
                {mutating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Reject</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  title: {
    ...typography.sectionTitle,
    flex: 1,
    textAlign: "center",
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 40,
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
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 4,
  },
  statusChip: {
    ...typography.caption,
    marginBottom: 8,
  },
  measurementLabel: {
    ...typography.title,
    color: colors.text.primary,
  },
  valueLine: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    marginBottom: 16,
  },
  sectionLabel: {
    ...typography.caption,
    marginTop: 14,
    color: colors.text.muted,
  },
  bodyText: {
    ...typography.bodyLarge,
    marginTop: 4,
    color: colors.text.secondary,
  },
  evidenceBlock: {
    marginTop: 6,
    gap: 8,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.shadow.soft,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    ...typography.caption,
    color: colors.text.muted,
  },
  noteText: {
    ...typography.body,
    color: colors.text.secondary,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rejectButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButtonText: {
    ...typography.button,
    color: colors.danger,
  },
  acceptButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 10,
  },
  modalTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  modalHint: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  noteInput: {
    ...typography.bodyLarge,
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: "top",
    color: colors.text.primary,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    ...typography.button,
    color: colors.text.secondary,
  },
  modalConfirm: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    ...typography.button,
    color: "#FFFFFF",
  },
});
