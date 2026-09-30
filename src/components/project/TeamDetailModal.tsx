import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { addTeamMember, deleteTeam, listTeamMembers, removeTeamMember, updateTeam } from "../../services/api/teams";
import { getRemoteProjectMembers, type RemoteProjectMember } from "../../services/api/projects";
import { fetchMemberPresentationContext } from "../../utils/domain/memberPresentationContext";
import { formatMemberDisplayLabel, type UserPresentationRecord } from "../../utils/domain/memberDisplay";
import { formatProjectMemberRoleLabel } from "../../utils/domain/memberRoleLabels";
import { colors, typography } from "../../theme/colors";
import type { Team } from "../../types/team";
import type { TeamMembership } from "../../types/teamMembership";
import UserAvatar from "../user/UserAvatar";

type Props = {
  visible: boolean;
  projectId: string;
  team: Team | null;
  canManage: boolean;
  onClose: () => void;
  onTeamUpdated: (team: Team) => void;
  onArchived: () => void;
};

type ViewMode = "members" | "add" | "rename";

export default function TeamDetailModal({ visible, projectId, team, canManage, onClose, onTeamUpdated, onArchived }: Props) {
  const [view, setView] = useState<ViewMode>("members");
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [projectMembers, setProjectMembers] = useState<RemoteProjectMember[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserPresentationRecord>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState(team?.name ?? "");

  const loadMembers = useCallback(async (active: () => boolean = () => true) => {
    if (!team) return;
    setLoading(true);
    setError(null);
    setMembersError(null);
    try {
      const [teamMemberships, remoteMemberResult] = await Promise.all([
        listTeamMembers(projectId, team.id),
        canManage
          ? getRemoteProjectMembers(projectId).then(
              (items) => ({ items, error: null as string | null }),
              (err: unknown) => ({
                items: [] as RemoteProjectMember[],
                error: err instanceof Error ? err.message : "Project members could not be loaded.",
              }),
            )
          : Promise.resolve({ items: [] as RemoteProjectMember[], error: null as string | null }),
      ]);
      if (!active()) return;
      const remoteMembers = remoteMemberResult.items;
      setMemberships(teamMemberships);
      setProjectMembers(remoteMembers);
      setMembersError(remoteMemberResult.error);
      const context = await fetchMemberPresentationContext({
        members: remoteMembers,
        projectId,
        projectMemberIds: teamMemberships.map((item) => item.projectMemberId),
      });
      if (active()) setProfiles(new Map(context.profileByUserId ?? []));
      if (canManage && !remoteMemberResult.error && remoteMembers.length === 0) {
        setMembersError("Project members could not be loaded for management.");
      }
    } catch (err) {
      if (active()) setError(err instanceof Error ? err.message : "Team members could not be loaded.");
    } finally {
      if (active()) setLoading(false);
    }
  }, [canManage, projectId, team]);

  useEffect(() => {
    if (!visible || !team) return;
    let active = true;
    setView("members");
    setName(team.name);
    setSelectedIds(new Set());
    void loadMembers(() => active);
    return () => { active = false; };
  }, [loadMembers, team?.id, visible]);

  const memberById = useMemo(() => new Map(projectMembers.map((member) => [member.id, member])), [projectMembers]);
  const activeMembershipIds = useMemo(() => new Set(memberships.map((item) => item.projectMemberId)), [memberships]);
  const eligibleMembers = useMemo(
    () => projectMembers.filter((member) => member.status === "active" && !activeMembershipIds.has(member.id)),
    [activeMembershipIds, projectMembers],
  );

  const presentation = (projectMemberId: string) => {
    const member = memberById.get(projectMemberId);
    const profile = member ? profiles.get(member.userId) : undefined;
    const label = member
      ? formatMemberDisplayLabel({ displayName: profile?.displayName, email: profile?.email, role: member.role })
      : profile?.displayName?.trim() || profile?.email?.trim() || "Project member";
    return {
      member,
      profile,
      label,
      role: member ? formatProjectMemberRoleLabel(member.role) : "Project member",
    };
  };

  const toggleMember = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddMembers = async () => {
    if (!team || selectedIds.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      for (const id of selectedIds) await addTeamMember(projectId, team.id, id);
      setSelectedIds(new Set());
      setView("members");
      await loadMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Team members could not be added.";
      await loadMembers();
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (projectMemberId: string) => {
    if (!team || !canManage) return;
    const target = presentation(projectMemberId);
    Alert.alert(
      "Remove from Team?",
      `Remove ${target.label} from ${team.name}? This will not remove them from the project.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setRemovingId(projectMemberId);
            setError(null);
            void removeTeamMember(projectId, team.id, projectMemberId)
              .then(() => loadMembers())
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Team member could not be removed."))
              .finally(() => setRemovingId(null));
          },
        },
      ],
    );
  };

  const handleRename = async () => {
    if (!team || !name.trim() || name.trim().length > 120 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTeam(projectId, team.id, { name: name.trim() });
      onTeamUpdated(updated);
      setView("members");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Team could not be renamed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = () => {
    if (!team || !canManage || saving) return;
    Alert.alert(
      `Archive ${team.name}?`,
      "Members will remain project members. Existing project work will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive Team",
          style: "destructive",
          onPress: () => {
            setSaving(true);
            setError(null);
            void deleteTeam(projectId, team.id)
              .then(onArchived)
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Team could not be archived."))
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  if (!team) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          {view === "members" ? (
            <Pressable onPress={onClose} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Close Team">
              <Ionicons name="chevron-down" size={22} color={colors.text.secondary} />
            </Pressable>
          ) : (
            <Pressable onPress={() => { setView("members"); setError(null); }} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={21} color={colors.brand.navy} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={1}>{view === "add" ? "Add Members" : view === "rename" ? "Edit Team" : team.name}</Text>
          {view === "members" && canManage ? (
            <Pressable onPress={() => { setName(team.name); setView("rename"); setError(null); }} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Rename Team">
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ) : <View style={styles.headerSide} />}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {view === "members" ? (
            <>
              <Text style={styles.countText}>{memberships.length} {memberships.length === 1 ? "member" : "members"}</Text>
              <Text style={styles.sectionLabel}>TEAM MEMBERS</Text>
              {loading ? <ActivityIndicator style={styles.loader} color={colors.brand.navy} /> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {memberships.map((membership) => {
                const row = presentation(membership.projectMemberId);
                return (
                  <View key={membership.id} style={styles.memberRow}>
                    <UserAvatar imageUrl={row.profile?.avatarUrl} size={42} style={styles.avatar} accessibilityLabel={`${row.label} avatar`} />
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName} numberOfLines={1}>{row.label}</Text>
                      <Text style={styles.memberRole} numberOfLines={1}>{row.role}</Text>
                    </View>
                    {canManage ? (
                      <Pressable
                        onPress={() => confirmRemove(membership.projectMemberId)}
                        disabled={removingId === membership.projectMemberId}
                        style={styles.iconButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${row.label} from Team`}
                      >
                        {removingId === membership.projectMemberId ? <ActivityIndicator size="small" color={colors.text.muted} /> : <Ionicons name="ellipsis-horizontal" size={20} color={colors.text.secondary} />}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
              {!loading && memberships.length === 0 ? <Text style={styles.emptyText}>No members in this Team yet.</Text> : null}
              {canManage ? (
                <Pressable onPress={() => { setView("add"); setError(null); setMembersError(null); setSelectedIds(new Set()); }} style={styles.secondaryButton} accessibilityRole="button">
                  <Ionicons name="person-add-outline" size={18} color={colors.brand.navy} />
                  <Text style={styles.secondaryButtonText}>Add Member</Text>
                </Pressable>
              ) : null}
              {canManage ? (
                <Pressable onPress={confirmArchive} disabled={saving} style={styles.archiveButton} accessibilityRole="button">
                  <Ionicons name="archive-outline" size={18} color={colors.danger} />
                  <Text style={styles.archiveText}>Archive Team</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {view === "add" ? (
            <>
              <Text style={styles.helperText}>Choose active project members to add to {team.name}.</Text>
              {loading ? <ActivityIndicator style={styles.loader} color={colors.brand.navy} /> : null}
              {membersError ? <Text style={styles.error}>{membersError}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {eligibleMembers.map((member) => {
                const profile = profiles.get(member.userId);
                const label = formatMemberDisplayLabel({ displayName: profile?.displayName, email: profile?.email, role: member.role });
                const selected = selectedIds.has(member.id);
                return (
                  <Pressable key={member.id} onPress={() => toggleMember(member.id)} style={styles.selectRow} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
                    <UserAvatar imageUrl={profile?.avatarUrl} size={40} style={styles.avatar} />
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName} numberOfLines={1}>{label}</Text>
                      <Text style={styles.memberRole}>{formatProjectMemberRoleLabel(member.role)}</Text>
                    </View>
                    <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.brand.navy : colors.text.muted} />
                  </Pressable>
                );
              })}
              {!loading && !membersError && eligibleMembers.length === 0 ? <Text style={styles.emptyText}>All active project members are already in this Team.</Text> : null}
              <Pressable onPress={() => void handleAddMembers()} disabled={saving || selectedIds.size === 0 || !!membersError} style={[styles.primaryButton, (saving || selectedIds.size === 0 || !!membersError) && styles.disabledButton]} accessibilityRole="button" accessibilityState={{ disabled: saving || selectedIds.size === 0 || !!membersError, busy: saving }}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{selectedIds.size > 0 ? `Add ${selectedIds.size} ${selectedIds.size === 1 ? "Member" : "Members"}` : "Add Members"}</Text>}
              </Pressable>
            </>
          ) : null}

          {view === "rename" ? (
            <>
              <Text style={styles.sectionLabel}>TEAM NAME</Text>
              <TextInput value={name} onChangeText={setName} autoFocus maxLength={121} returnKeyType="done" onSubmitEditing={() => void handleRename()} style={styles.input} accessibilityLabel="Team name" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable onPress={() => void handleRename()} disabled={saving || !name.trim() || name.trim().length > 120} style={[styles.primaryButton, (saving || !name.trim() || name.trim().length > 120) && styles.disabledButton]} accessibilityRole="button" accessibilityState={{ disabled: saving || !name.trim() || name.trim().length > 120, busy: saving }}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save Changes</Text>}
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerSide: { width: 66, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
  title: { ...typography.bodyMedium, color: colors.text.primary, flex: 1, textAlign: "center", paddingHorizontal: 4 },
  backText: { ...typography.caption, color: colors.brand.navy },
  editText: { ...typography.bodyMedium, color: colors.brand.navy, marginLeft: "auto" },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 36 },
  countText: { ...typography.bodyMedium, color: colors.text.primary, marginBottom: 26 },
  sectionLabel: { ...typography.metadata, color: colors.text.muted, letterSpacing: 0.6, marginBottom: 10 },
  loader: { marginVertical: 22 },
  error: { ...typography.caption, color: colors.danger, marginVertical: 10 },
  memberRow: { minHeight: 64, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: { marginRight: 12, flexShrink: 0 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { ...typography.bodyMedium, color: colors.text.primary },
  memberRole: { ...typography.caption, color: colors.text.muted, marginTop: 2 },
  iconButton: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  secondaryButton: { minHeight: 46, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, marginTop: 18, borderRadius: 10, backgroundColor: "rgba(1, 33, 105, 0.07)" },
  secondaryButtonText: { ...typography.bodyMedium, color: colors.brand.navy },
  archiveButton: { minHeight: 46, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 22 },
  archiveText: { ...typography.bodyMedium, color: colors.danger },
  emptyText: { ...typography.body, color: colors.text.muted, marginVertical: 8 },
  helperText: { ...typography.body, color: colors.text.secondary, marginBottom: 16 },
  selectRow: { minHeight: 64, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  primaryButton: { minHeight: 48, marginTop: 24, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand.navy },
  primaryButtonText: { ...typography.bodyMedium, color: "#FFFFFF" },
  disabledButton: { opacity: 0.48 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 13, color: colors.text.primary, ...typography.body },
});
