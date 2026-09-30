import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { listTeamMembers, listTeams } from "../../services/api/teams";
import { listTeamWorkPackageAssignments } from "../../services/api/teamWorkPackageAssignments";
import { getRemoteWorkPackagesForProject } from "../../services/api/workPackages";
import { deriveTeamAssignedItemCounts } from "../../utils/domain/teamAssignedWork";
import { colors, typography } from "../../theme/colors";
import type { Team } from "../../types/team";
import TeamDetailModal from "./TeamDetailModal";
import TeamEditorModal from "./TeamEditorModal";

type Props = {
  projectId: string | null;
  canManage: boolean;
};

type TeamRowData = { team: Team; memberCount: number; assignedItemCount?: number };
function rowAssignedLabel(count: number | undefined): string {
  return count === undefined ? "" : ` · ${count} assigned ${count === 1 ? "item" : "items"}`;
}

export default function ProjectTeamsSection({ projectId, canManage }: Props) {
  const [rows, setRows] = useState<TeamRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!projectId) {
      setRows([]);
      setError("Teams are available after this project connects to cloud.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const teams = (await listTeams(projectId)).filter((team) => team.status === "active");
      const membershipsByTeam = await Promise.all(teams.map(async (team) => ({ team, memberships: (await listTeamMembers(projectId, team.id)).filter((item) => item.status === "active") })));
      let assignedItemCounts: Map<string, { memberCount: number; assignedItemCount: number }> | undefined;
      if (canManage && teams.length > 0) {
        try {
          const [assignments, workPackages] = await Promise.all([listTeamWorkPackageAssignments(projectId), getRemoteWorkPackagesForProject(projectId)]);
          assignedItemCounts = deriveTeamAssignedItemCounts({ teamIds: teams.map((team) => team.id), memberships: membershipsByTeam.flatMap((item) => item.memberships), assignments, workPackages });
        } catch { assignedItemCounts = undefined; }
      }
      const counts = membershipsByTeam.map(({ team, memberships }) => ({ team, memberCount: new Set(memberships.map((item) => item.projectMemberId)).size, ...(assignedItemCounts ? { assignedItemCount: assignedItemCounts.get(team.id)?.assignedItemCount ?? 0 } : {}) }));
      if (isCurrent()) setRows(counts);
    } catch (err) {
      if (isCurrent()) {
        setRows([]);
        setError(err instanceof Error ? err.message : "Teams could not be loaded.");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load, retryKey]);

  const refresh = () => setRetryKey((value) => value + 1);
  const handleCreated = (team: Team) => {
    setCreateVisible(false);
    setRows((current) => [{ team, memberCount: 0 }, ...current.filter((row) => row.team.id !== team.id)]);
    refresh();
  };
  const handleUpdated = (team: Team) => {
    setSelectedTeam(team);
    setRows((current) => current.map((row) => row.team.id === team.id ? { ...row, team } : row));
  };
  const handleArchived = () => {
    setSelectedTeam(null);
    refresh();
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>Teams</Text>
        <View style={styles.headerActions}>
          <Text style={styles.count}>{rows.length} {rows.length === 1 ? "team" : "teams"}</Text>
          {canManage && projectId ? (
            <Pressable onPress={() => setCreateVisible(true)} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Add Team">
              <Ionicons name="add" size={17} color={colors.brand.navy} />
              <Text style={styles.addText}>Add Team</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? <ActivityIndicator style={styles.loader} color={colors.brand.navy} /> : null}
      {error ? (
        <View style={styles.messageRow}>
          <Text style={styles.messageText}>{error}</Text>
          {projectId ? <Pressable onPress={refresh} style={styles.retryButton} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></Pressable> : null}
        </View>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.messageText}>{canManage ? "No teams yet. Create teams to organize project members into crews or work groups." : "No teams available."}</Text>
        </View>
      ) : null}
      {!error ? rows.map(({ team, memberCount, assignedItemCount }) => (
        <View key={team.id}>
          <Pressable onPress={() => setSelectedTeam(team)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} accessibilityRole="button" accessibilityLabel={`${team.name}, ${memberCount} ${memberCount === 1 ? "member" : "members"}${assignedItemCount === undefined ? "" : `, ${assignedItemCount} assigned items`}`}>
            <View style={styles.teamIcon}><Ionicons name="people-outline" size={21} color={colors.brand.navy} /></View>
            <View style={styles.rowContent}>
              <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
              <Text style={styles.memberCount}>{memberCount} {memberCount === 1 ? "member" : "members"}{rowAssignedLabel(assignedItemCount)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
          </Pressable>
          <View style={styles.separator} />
        </View>
      )) : null}

      {projectId ? (
        <>
          <TeamEditorModal visible={createVisible} projectId={projectId} onClose={() => setCreateVisible(false)} onSaved={handleCreated} />
          <TeamDetailModal visible={!!selectedTeam} projectId={projectId} team={selectedTeam} canManage={canManage} onClose={() => setSelectedTeam(null)} onTeamUpdated={handleUpdated} onArchived={handleArchived} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 26 },
  sectionHeader: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { ...typography.sectionTitle, color: colors.text.primary, fontSize: 16 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  count: { ...typography.caption, color: colors.text.muted },
  addButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, borderRadius: 9, backgroundColor: "rgba(1, 33, 105, 0.06)" },
  addText: { ...typography.caption, color: colors.brand.navy, fontWeight: "600" },
  loader: { marginVertical: 22 },
  messageRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  messageText: { ...typography.body, color: colors.text.muted, flex: 1 },
  retryButton: { minHeight: 40, minWidth: 54, alignItems: "center", justifyContent: "center" },
  retryText: { ...typography.bodyMedium, color: colors.brand.navy },
  emptyState: { paddingVertical: 8, gap: 10 },
  row: { minHeight: 66, flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingRight: 3 },
  rowPressed: { backgroundColor: colors.shadow.soft },
  teamIcon: { width: 42, height: 42, borderRadius: 12, marginRight: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(1, 33, 105, 0.08)" },
  rowContent: { flex: 1, minWidth: 0, paddingRight: 10 },
  teamName: { ...typography.bodyMedium, color: colors.text.primary },
  memberCount: { ...typography.caption, color: colors.text.muted, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 54 },
});
