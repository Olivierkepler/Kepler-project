import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import {
  acceptInvitation,
  declineInvitation,
  getMyInvitations,
  type RemoteProjectInvitation,
} from "../services/api/invitations";
import { getMyDiscoveredProjects } from "../services/api/projects";
import { colors, typography } from "../theme/colors";
import type { ProjectMemberRole } from "../types/projectMember";
import { formatProjectMemberRoleLabel } from "../utils/domain/memberRoleLabels";

type Props = NativeStackScreenProps<RootStackParamList, "Invitations">;

function invitationTitle(item: RemoteProjectInvitation): string {
  // Backend invitation DTO has no project name — do not invent one.
  return "Project invitation";
}

export default function InvitationsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<RemoteProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const load = useCallback(async () => {
    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      setError("Sign in to view invitations.");
      return;
    }

    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      const invitations = await getMyInvitations();
      setItems(invitations.filter((item) => item.status === "pending"));
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error
          ? err.message
          : "Invitations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, retryToken]),
  );

  const resolveMembershipRole = async (
    remoteProjectId: string,
    fallbackRole: ProjectMemberRole,
  ): Promise<ProjectMemberRole> => {
    try {
      const discovered = await getMyDiscoveredProjects();
      const match = discovered.find((item) => item.id === remoteProjectId);
      if (match?.membership?.role) {
        return match.membership.role;
      }
    } catch {
      // Fall through to invitation/member role.
    }
    return fallbackRole;
  };

  const handleAccept = async (item: RemoteProjectInvitation) => {
    if (actionId) {
      return;
    }

    setActionId(item.id);
    setActionError(null);

    try {
      const result = await acceptInvitation(item.id);
      const role = await resolveMembershipRole(
        result.member.projectId,
        result.member.role,
      );

      setItems((prev) => prev.filter((entry) => entry.id !== item.id));

      navigation.replace("Project", {
        projectId: result.member.projectId,
        source: "shared",
        membershipRole: role,
      });
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Invitation could not be accepted.",
      );
    } finally {
      setActionId(null);
    }
  };

  const handleDecline = async (item: RemoteProjectInvitation) => {
    if (actionId) {
      return;
    }

    setActionId(item.id);
    setActionError(null);

    try {
      await declineInvitation(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Invitation could not be declined.",
      );
    } finally {
      setActionId(null);
    }
  };

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
        <Text style={styles.title}>Invitations</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.blue} />
          <Text style={styles.stateText}>Loading invitations…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => setRetryToken((value) => value + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {actionError ? (
            <Text style={styles.actionError}>{actionError}</Text>
          ) : null}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              items.length === 0 ? styles.emptyContainer : styles.listContent
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No pending invitations</Text>
            }
            renderItem={({ item }) => {
              const busy = actionId === item.id;
              return (
                <View style={styles.card}>
                  <Text style={styles.cardEyebrow}>INVITATION</Text>
                  <Text style={styles.cardTitle}>{invitationTitle(item)}</Text>
                  <Text style={styles.cardMeta}>
                    Role · {formatProjectMemberRoleLabel(item.role)}
                  </Text>
                  <Text style={styles.cardMeta}>Status · Pending</Text>
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.declineButton, busy && styles.disabled]}
                      onPress={() => {
                        void handleDecline(item);
                      }}
                      disabled={!!actionId}
                      accessibilityRole="button"
                      accessibilityLabel="Decline invitation"
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.text.primary} />
                      ) : (
                        <Text style={styles.declineText}>Decline</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.acceptButton, busy && styles.disabled]}
                      onPress={() => {
                        void handleAccept(item);
                      }}
                      disabled={!!actionId}
                      accessibilityRole="button"
                      accessibilityLabel="Accept invitation"
                    >
                      {busy ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.acceptText}>Accept</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        </>
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 42,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  stateText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    ...typography.button,
    color: colors.text.primary,
  },
  actionError: {
    ...typography.caption,
    color: colors.danger,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardEyebrow: {
    ...typography.caption,
    color: colors.text.muted,
    marginBottom: 6,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 6,
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  declineButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  declineText: {
    ...typography.button,
    color: colors.text.primary,
  },
  acceptButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand.blue,
  },
  acceptText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.7,
  },
});
