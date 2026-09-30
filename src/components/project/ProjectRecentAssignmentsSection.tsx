import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import { getRemoteProjectActivity } from "../../services/api/activity";
import { listTeams } from "../../services/api/teams";
import { getRemoteWorkPackagesForProject } from "../../services/api/workPackages";
import type { RootStackParamList } from "../../navigation/types";
import type { ProjectMember } from "../../types/projectMember";
import type { UserPresentationRecord } from "../../utils/domain/memberDisplay";
import { formatMemberDisplayLabel } from "../../utils/domain/memberDisplay";
import { projectRecentAssignments, type RecentAssignment } from "../../utils/domain/recentAssignments";
import { colors, typography } from "../../theme/colors";

type Props = {
  remoteProjectId: string | null;
  navigationProjectId: string;
  isShared: boolean;
  members: ProjectMember[];
  profileByUserId: ReadonlyMap<string, UserPresentationRecord>;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProjectRecentAssignmentsSection({
  remoteProjectId,
  navigationProjectId,
  isShared,
  members,
  profileByUserId,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<RecentAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const memberNames = useMemo(() => {
    const result = new Map<string, string>();
    for (const member of members) {
      const profile = profileByUserId.get(member.userId);
      result.set(member.id, formatMemberDisplayLabel({
        displayName: profile?.displayName,
        email: profile?.email,
        role: member.role,
        userId: member.userId,
      }));
    }
    return result;
  }, [members, profileByUserId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!remoteProjectId) {
      setRows([]);
      setError(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [page, packagesResult, teamsResult] = await Promise.all([
          getRemoteProjectActivity(remoteProjectId, { limit: 50 }),
          getRemoteWorkPackagesForProject(remoteProjectId).then((items) => ({ items })).catch(() => ({ items: [] })),
          listTeams(remoteProjectId).then((items) => ({ items })).catch(() => ({ items: [] })),
        ]);
        if (!active) return;
        const workPackageNames = new Map(packagesResult.items.map((item) => [item.id, item.name] as const));
        const teamNames = new Map(teamsResult.items.map((team) => [team.id, team.name] as const));
        setRows(projectRecentAssignments({
          events: page.items,
          workPackageNames,
          memberNames,
          teamNames,
          limit: 3,
        }));
      } catch (err) {
        if (!active) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Assignment activity could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [memberNames, remoteProjectId, retryKey]));

  const openActivity = () => navigation.navigate("ProjectActivity", {
    projectId: navigationProjectId,
    source: isShared ? "shared" : "local",
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent Assignments</Text>
        <Pressable onPress={openActivity} style={styles.viewAll} accessibilityRole="button" accessibilityLabel="View all project activity">
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand.navy} />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={styles.loader} color={colors.brand.navy} /> : null}
      {error ? (
        <View style={styles.messageRow}>
          <Text style={styles.message}>{error}</Text>
          <Pressable onPress={() => setRetryKey((value) => value + 1)} style={styles.retry} accessibilityRole="button" accessibilityLabel="Retry recent assignments">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {!remoteProjectId ? <Text style={styles.message}>Assignment history is unavailable for this local project.</Text> : null}
      {!loading && !error && remoteProjectId && rows.length === 0 ? <Text style={styles.message}>No recent assignments.</Text> : null}

      {!error ? rows.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={styles.iconBox}>
            <Ionicons name={item.targetType === "team" ? "people-outline" : "person-outline"} size={17} color={colors.brand.navy} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.workPackage} numberOfLines={1}>{item.workPackageName}</Text>
            <Text style={styles.target} numberOfLines={1}>Assigned to {item.targetName}</Text>
          </View>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24 },
  header: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  title: { ...typography.sectionTitle, color: colors.text.primary, fontSize: 16 },
  viewAll: { minHeight: 40, flexDirection: "row", alignItems: "center", paddingLeft: 10, gap: 3 },
  viewAllText: { ...typography.caption, color: colors.brand.navy, fontWeight: "600" },
  loader: { marginVertical: 16 },
  message: { ...typography.caption, color: colors.text.muted, flex: 1, paddingVertical: 7 },
  messageRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  retry: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  retryText: { ...typography.caption, color: colors.brand.navy, fontWeight: "600" },
  row: { minHeight: 59, flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  iconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(1, 33, 105, 0.06)", alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, minWidth: 0 },
  workPackage: { ...typography.bodyMedium, color: colors.text.primary },
  target: { ...typography.caption, color: colors.text.muted, marginTop: 2 },
  date: { ...typography.caption, color: colors.text.muted, marginLeft: 4 },
});
