import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors, typography } from "../../theme/colors";
import type { Team } from "../../types/team";
import { createTeam, updateTeam } from "../../services/api/teams";

const MAX_TEAM_NAME_LENGTH = 120;

type Props = {
  visible: boolean;
  projectId: string;
  team?: Team | null;
  onClose: () => void;
  onSaved: (team: Team) => void;
};

export default function TeamEditorModal({
  visible,
  projectId,
  team,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(team?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!team;
  const trimmedName = name.trim();
  const canSave = useMemo(
    () => trimmedName.length > 0 && trimmedName.length <= MAX_TEAM_NAME_LENGTH && !saving,
    [saving, trimmedName],
  );

  useEffect(() => {
    if (visible) {
      setName(team?.name ?? "");
      setSaving(false);
      setError(null);
    }
  }, [team?.id, team?.name, visible]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = team
        ? await updateTeam(projectId, team.id, { name: trimmedName })
        : await createTeam(projectId, { name: trimmedName });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Team could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{isEditing ? "Edit Team" : "Create Team"}</Text>
            <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text.muted} />
            </Pressable>
          </View>
          <Text style={styles.label}>Team name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter a team name"
            placeholderTextColor={colors.text.muted}
            maxLength={MAX_TEAM_NAME_LENGTH + 1}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void handleSave()}
            style={styles.input}
            accessibilityLabel="Team name"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onClose} disabled={saving} style={styles.cancelButton} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={!canSave}
              style={[styles.primaryButton, !canSave && styles.disabledButton]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: saving }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryText}>{isEditing ? "Save" : "Create Team"}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(9, 20, 40, 0.42)" },
  card: { backgroundColor: colors.background, borderRadius: 16, padding: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  title: { ...typography.sectionTitle, color: colors.text.primary, fontSize: 19 },
  label: { ...typography.caption, color: colors.text.secondary, marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 13, color: colors.text.primary, ...typography.body },
  error: { ...typography.caption, color: colors.danger, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 22 },
  cancelButton: { minHeight: 44, minWidth: 76, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  cancelText: { ...typography.bodyMedium, color: colors.text.secondary },
  primaryButton: { minHeight: 44, minWidth: 102, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand.navy },
  primaryText: { ...typography.bodyMedium, color: "#FFFFFF" },
  disabledButton: { opacity: 0.48 },
});
