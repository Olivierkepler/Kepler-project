import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";
import AssignmentProgressActions from "../components/project/AssignmentProgressActions";
import type { RootStackParamList } from "../navigation/types";
import { getPendingRemoteMeasurements } from "../services/api/measurements";
import {
  getRemoteWorkPackageAssignmentsForProject,
  updateRemoteWorkPackageAssignment,
  type RemoteWorkPackageAssignment,
} from "../services/api/workPackageAssignments";
import {
  getRemoteWorkPackage,
  type RemoteWorkPackage,
} from "../services/api/workPackages";
import { getProjectMembersForProject } from "../store/projectMembers";
import { colors, typography } from "../theme/colors";
import type { ProjectMember } from "../types/projectMember";
import type { WorkPackageAssignmentStatus } from "../types/workPackageAssignment";
import {
  formatAssignmentStatusPresentation,
  formatWorkPackageStatusPresentation,
} from "../utils/domain/statusPresentation";
import { formatMemberDisplayLabel } from "../utils/domain/memberDisplay";

type Props = NativeStackScreenProps<RootStackParamList, "WorkProgressDetail">;

function memberLabel(
  projectMemberId: string,
  members: ProjectMember[],
): string {
  const member = members.find((item) => item.id === projectMemberId);
  return formatMemberDisplayLabel({ role: member?.role });
}

export default function WorkProgressDetailScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { projectId, remoteProjectId, workPackageId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"network" | "unavailable" | null>(null);
  const [workPackage, setWorkPackage] = useState<RemoteWorkPackage | null>(
    null,
  );
  const [assignments, setAssignments] = useState<RemoteWorkPackageAssignment[]>(
    [],
  );
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const reload = useCallback(async () => {
    if (!user?.uid) {
      setError("unavailable");
      setWorkPackage(null);
      setAssignments([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [wp, allAssignments, localMembers, pending] = await Promise.all([
        getRemoteWorkPackage(remoteProjectId, workPackageId),
        getRemoteWorkPackageAssignmentsForProject(remoteProjectId),
        getProjectMembersForProject(user.uid, projectId),
        getPendingRemoteMeasurements(remoteProjectId).catch(() => []),
      ]);

      const packageAssignments = allAssignments.filter(
        (assignment) =>
          assignment.workPackageId === workPackageId &&
          assignment.status !== "cancelled",
      );

      setWorkPackage(wp);
      setAssignments(packageAssignments);
      setMembers(localMembers);
      setPendingReviewCount(pending.length);
    } catch (loadError) {
      setWorkPackage(null);
      setAssignments([]);
      if (
        loadError instanceof Error &&
        loadError.message === "Work package not found."
      ) {
        setError("unavailable");
      } else {
        setError("network");
      }
    } finally {
      setLoading(false);
    }
  }, [user?.uid, projectId, remoteProjectId, workPackageId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        if (!active) {
          return;
        }
        await reload();
      })();
      return () => {
        active = false;
      };
    }, [reload, retryToken]),
  );

  const runTransition = async (
    assignmentId: string,
    nextStatus: WorkPackageAssignmentStatus,
    note?: string,
  ) => {
    if (mutatingId) {
      return;
    }

    setMutatingId(assignmentId);

    try {
      await updateRemoteWorkPackageAssignment(remoteProjectId, assignmentId, {
        status: nextStatus,
        ...(note !== undefined ? { note } : {}),
      });
      await reload();
    } catch (progressError) {
      Alert.alert(
        "Unable to update progress",
        progressError instanceof Error
          ? progressError.message
          : "Unable to update assignment progress.",
      );
    } finally {
      setMutatingId(null);
    }
  };

  const confirmComplete = (assignment: RemoteWorkPackageAssignment) => {
    const warning =
      pendingReviewCount > 0
        ? `${pendingReviewCount} field submission${pendingReviewCount === 1 ? "" : "s"} on this project ${pendingReviewCount === 1 ? "is" : "are"} still awaiting review.\n\nYou can complete this assignment now, or review those submissions first.`
        : "This marks the assignment as owner-verified complete.";

    const buttons: Array<{
      text: string;
      style?: "cancel" | "default" | "destructive";
      onPress?: () => void;
    }> = [
      { text: "Cancel", style: "cancel" },
      {
        text: pendingReviewCount > 0 ? "Complete anyway" : "Complete",
        onPress: () => {
          void runTransition(assignment.id, "completed");
        },
      },
    ];

    if (pendingReviewCount > 0) {
      buttons.splice(1, 0, {
        text: "Review submissions",
        onPress: () => {
          navigation.navigate("ContributionReview", { projectId });
        },
      });
    }

    Alert.alert("Complete assignment?", warning, buttons);
  };

  const confirmReopen = (assignment: RemoteWorkPackageAssignment) => {
    Alert.alert(
      "Reopen assignment?",
      "This reverses owner-verified completion and returns the assignment to in progress.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reopen",
          onPress: () => {
            void runTransition(assignment.id, "in_progress");
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.blue} />
          <Text style={styles.stateText}>Loading assignments…</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.title} numberOfLines={1}>
          {workPackage?.name ?? "Work Progress"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {error || !workPackage ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>
            {error === "network"
              ? "Unable to load this work package."
              : "Work package not found."}
          </Text>
          {error === "network" ? (
            <Pressable
              style={styles.retryButton}
              onPress={() => setRetryToken((value) => value + 1)}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>WORK PACKAGE</Text>
          <Text style={styles.bodyText}>
            {formatWorkPackageStatusPresentation(workPackage.status)}
          </Text>
          <Text style={styles.hint}>
            Completing an assignment does not complete the work package.
          </Text>

          {pendingReviewCount > 0 ? (
            <Pressable
              style={styles.reviewLink}
              onPress={() =>
                navigation.navigate("ContributionReview", { projectId })
              }
              accessibilityRole="button"
              accessibilityLabel="Review field submissions"
            >
              <Text style={styles.reviewLinkTitle}>Needs Review</Text>
              <Text style={styles.reviewLinkMeta}>
                {pendingReviewCount} field submission
                {pendingReviewCount === 1 ? "" : "s"} pending · Review
                submissions →
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionLabel}>ASSIGNMENTS</Text>
          {assignments.length === 0 ? (
            <Text style={styles.bodyText}>No active assignments.</Text>
          ) : (
            assignments.map((assignment) => (
              <View key={assignment.id} style={styles.assignmentCard}>
                <Text style={styles.memberLabel}>
                  {memberLabel(assignment.projectMemberId, members)}
                </Text>
                <Text style={styles.statusMeta}>
                  {formatAssignmentStatusPresentation(assignment.status)}
                </Text>
                <AssignmentProgressActions
                  status={assignment.status}
                  mode="owner"
                  mutating={mutatingId === assignment.id}
                  onOwnerCompleteRequest={() => confirmComplete(assignment)}
                  onTransition={(nextStatus, note) => {
                    if (
                      assignment.status === "completed" &&
                      nextStatus === "in_progress"
                    ) {
                      confirmReopen(assignment);
                      return;
                    }
                    void runTransition(assignment.id, nextStatus, note);
                  }}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}
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
    paddingBottom: 40,
    gap: 6,
  },
  sectionLabel: {
    ...typography.caption,
    marginTop: 16,
    color: colors.text.muted,
  },
  bodyText: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
  },
  hint: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 4,
  },
  reviewLink: {
    marginTop: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#F9D7D2",
    backgroundColor: "#FFF8F6",
    borderRadius: 12,
    padding: 14,
  },
  reviewLinkTitle: {
    ...typography.caption,
    color: colors.danger,
  },
  reviewLinkMeta: {
    ...typography.caption,
    marginTop: 6,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  assignmentCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.surface,
  },
  memberLabel: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  statusMeta: {
    ...typography.caption,
    marginTop: 2,
    color: colors.text.secondary,
  },
});
