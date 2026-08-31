import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { listMessageableMembers } from "../../services/api/conversations";
import type { ChatParticipantPresentation } from "../../types/chat";
import { colors, typography } from "../../theme/colors";
import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../../utils/domain/memberDisplay";
import { formatProjectMemberRoleLabel } from "../../utils/domain/memberRoleLabels";

export type SharePlanItemDestination =
  | { kind: "project_chat" }
  | {
      kind: "direct";
      projectMemberId: string;
      titleHint: string;
      subtitleHint: string;
    };

type Props = {
  visible: boolean;
  remoteProjectId: string | null;
  projectName: string;
  planItemLabel: string;
  onClose: () => void;
  onSelect: (destination: SharePlanItemDestination) => void;
};

export default function SharePlanItemSheet({
  visible,
  remoteProjectId,
  projectName,
  planItemLabel,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<ChatParticipantPresentation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !remoteProjectId) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const items = await listMessageableMembers(remoteProjectId);
        if (active) {
          setMembers(items);
        }
      } catch (err) {
        if (active) {
          setMembers([]);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load message destinations.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [remoteProjectId, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.safe,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.topSpacer} />
          <Text style={styles.topTitle}>Share Plan Item</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel share"
            hitSlop={8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle} numberOfLines={2}>
          {planItemLabel}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Project Chat</Text>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && styles.rowPressed,
              !remoteProjectId && styles.rowDisabled,
            ]}
            disabled={!remoteProjectId}
            onPress={() => onSelect({ kind: "project_chat" })}
            accessibilityRole="button"
            accessibilityLabel={`Share to Project Chat for ${projectName}`}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowPrimary}>Project Chat</Text>
              <Text style={styles.rowSecondary} numberOfLines={1}>
                {projectName}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
          </Pressable>

          <Text style={styles.sectionTitle}>Direct message</Text>

          {loading ? (
            <ActivityIndicator color={colors.brand.navy} style={styles.loader} />
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!loading && !error && members.length === 0 ? (
            <Text style={styles.emptyText}>
              No other active members to message.
            </Text>
          ) : null}

          {members.map((member) => {
            const label = formatMemberDisplayLabel({
              displayName: member.displayName,
              email: member.email,
              userId: member.userId,
              role: member.role,
            });
            const roleLabel = formatProjectMemberRoleLabel(member.role);

            return (
              <Pressable
                key={member.projectMemberId}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() =>
                  onSelect({
                    kind: "direct",
                    projectMemberId: member.projectMemberId,
                    titleHint: label,
                    subtitleHint: roleLabel,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Share to ${label}`}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {memberDisplayInitial(label)}
                  </Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={styles.rowSecondary}>{roleLabel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topSpacer: {
    width: 56,
  },
  topTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  cancelText: {
    ...typography.body,
    color: colors.brand.navy,
    width: 56,
    textAlign: "right",
  },
  subtitle: {
    ...typography.caption,
    color: colors.text.secondary,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.brand.navy,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowPressed: {
    backgroundColor: "#F8FAFC",
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowCopy: {
    flex: 1,
    marginRight: 8,
  },
  rowPrimary: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  rowSecondary: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F8FD",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    ...typography.bodyMedium,
    color: colors.brand.blue,
  },
  loader: {
    marginVertical: 16,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: 8,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
});
