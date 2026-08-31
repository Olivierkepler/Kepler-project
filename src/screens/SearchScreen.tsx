import React, { useCallback, useEffect, useMemo, useRef } from "react";

import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthProvider";
import FeedAvatar from "../components/home/feed/FeedAvatar";
import useBuildSigmaSearch from "../hooks/useBuildSigmaSearch";
import type { RootStackParamList } from "../navigation/types";
import { getLocalProjectIdForRemote } from "../store/projectCloudMappings";
import { typography } from "../theme/colors";
import type {
  FeedPostSearchResult,
  PersonSearchResult,
  ProjectSearchResult,
} from "../types/search";
import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../utils/domain/memberDisplay";

const KEPLER_NAVY = "#012169";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

type ListRow =
  | { kind: "section"; id: string; title: string }
  | { kind: "project"; id: string; project: ProjectSearchResult }
  | { kind: "person"; id: string; person: PersonSearchResult }
  | { kind: "post"; id: string; post: FeedPostSearchResult };

function formatCompactRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function projectStatusLabel(status: ProjectSearchResult["status"]): string {
  switch (status) {
    case "active":
      return "Active project";
    case "planning":
      return "Planning";
    case "completed":
      return "Completed";
    case "on-hold":
      return "On hold";
    default:
      return "Project";
  }
}

export default function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const {
    query,
    setQuery,
    clearQuery,
    results,
    loading,
    error,
    retry,
    isSearchable,
    hasAnyResults,
  } = useBuildSigmaSearch();

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 180);

    return () => clearTimeout(timer);
  }, []);

  const rows = useMemo((): ListRow[] => {
    const next: ListRow[] = [];

    if (results.projects.length > 0) {
      next.push({ kind: "section", id: "sec-projects", title: "PROJECTS" });
      for (const project of results.projects) {
        next.push({
          kind: "project",
          id: `project-${project.id}`,
          project,
        });
      }
    }

    if (results.people.length > 0) {
      next.push({ kind: "section", id: "sec-people", title: "PEOPLE" });
      for (const person of results.people) {
        next.push({
          kind: "person",
          id: `person-${person.projectMemberId}`,
          person,
        });
      }
    }

    if (results.posts.length > 0) {
      next.push({ kind: "section", id: "sec-posts", title: "UPDATES" });
      for (const post of results.posts) {
        next.push({
          kind: "post",
          id: `post-${post.id}`,
          post,
        });
      }
    }

    return next;
  }, [results]);

  const openProject = useCallback(
    async (remoteProjectId: string) => {
      Keyboard.dismiss();

      if (!user?.uid) {
        navigation.navigate("Project", {
          projectId: remoteProjectId,
          source: "shared",
        });
        return;
      }

      const localProjectId = await getLocalProjectIdForRemote(
        user.uid,
        remoteProjectId,
      );

      if (localProjectId) {
        navigation.navigate("Project", { projectId: localProjectId });
        return;
      }

      navigation.navigate("Project", {
        projectId: remoteProjectId,
        source: "shared",
      });
    },
    [navigation, user?.uid],
  );

  const openPerson = useCallback(
    (person: PersonSearchResult) => {
      void openProject(person.projectId);
    },
    [openProject],
  );

  const openPost = useCallback(
    (post: FeedPostSearchResult) => {
      Keyboard.dismiss();
      navigation.navigate("FeedPostDetail", {
        projectId: post.projectId,
        postId: post.id,
      });
    },
    [navigation],
  );

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === "section") {
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
          </View>
        );
      }

      if (item.kind === "project") {
        return (
          <Pressable
            style={({ pressed }) => [
              styles.resultRow,
              pressed && styles.rowPressed,
            ]}
            onPress={() => {
              void openProject(item.project.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open project ${item.project.name}`}
          >
            <View style={styles.projectIcon}>
              <Ionicons
                name="business-outline"
                size={20}
                color={KEPLER_NAVY}
              />
            </View>
            <View style={styles.resultBody}>
              <Text style={styles.resultPrimary} numberOfLines={2}>
                {item.project.name}
              </Text>
              <Text style={styles.resultSecondary} numberOfLines={1}>
                {projectStatusLabel(item.project.status)}
              </Text>
            </View>
          </Pressable>
        );
      }

      if (item.kind === "person") {
        const initial = memberDisplayInitial(item.person.displayName);
        return (
          <Pressable
            style={({ pressed }) => [
              styles.resultRow,
              pressed && styles.rowPressed,
            ]}
            onPress={() => openPerson(item.person)}
            accessibilityRole="button"
            accessibilityLabel={`${item.person.displayName}, ${item.person.projectName}`}
          >
            <FeedAvatar initial={initial} size={40} />
            <View style={styles.resultBody}>
              <Text style={styles.resultPrimary} numberOfLines={1}>
                {item.person.displayName}
              </Text>
              <Text style={styles.resultSecondary} numberOfLines={1}>
                {item.person.projectName}
              </Text>
            </View>
          </Pressable>
        );
      }

      const authorLabel = formatMemberDisplayLabel({
        displayName: item.post.author.displayName,
        userId: item.post.author.userId,
      });
      const initial = memberDisplayInitial(authorLabel);

      return (
        <Pressable
          style={({ pressed }) => [
            styles.resultRow,
            pressed && styles.rowPressed,
          ]}
          onPress={() => openPost(item.post)}
          accessibilityRole="button"
          accessibilityLabel={`Update by ${authorLabel} in ${item.post.projectName}`}
        >
          <FeedAvatar initial={initial} size={40} />
          <View style={styles.resultBody}>
            <Text style={styles.resultPrimary} numberOfLines={1}>
              {authorLabel}
              <Text style={styles.resultPrimaryMuted}>
                {" · "}
                {item.post.projectName}
              </Text>
            </Text>
            <Text style={styles.postExcerpt} numberOfLines={2}>
              {item.post.textExcerpt}
            </Text>
            <View style={styles.postMetaRow}>
              <Text style={styles.postTime}>
                {formatCompactRelativeTime(item.post.createdAt)}
              </Text>
              {item.post.hasMedia ? (
                <View style={styles.mediaChip}>
                  <Ionicons
                    name="image-outline"
                    size={12}
                    color="#667085"
                  />
                  <Text style={styles.mediaChipText}>Media</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      );
    },
    [openPerson, openPost, openProject],
  );

  const listEmpty = (() => {
    if (!isSearchable) {
      return (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="search-outline"
              size={28}
              color="#5B6B7C"
            />
          </View>
          <Text style={styles.emptyTitle}>Search BuildSigma</Text>
          <Text style={styles.emptyBody}>
            Find project updates, projects,{"\n"}and people you work with.
          </Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={KEPLER_NAVY} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Pressable
            style={styles.retryButton}
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Retry search"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (!hasAnyResults) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.emptyTitle}>
            {`No results for "${query.trim()}"`}
          </Text>
          <Text style={styles.emptyBody}>
            Try another project name, person, or update.
          </Text>
        </View>
      );
    }

    return null;
  })();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />
        </Pressable>

        <View style={styles.searchField}>
          <Ionicons
            name="search-outline"
            size={18}
            color="#5B6B7C"
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search BuildSigma..."
            placeholderTextColor="#667085"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            accessibilityLabel="Search BuildSigma"
          />
          {query.length > 0 ? (
            <Pressable
              style={styles.clearButton}
              onPress={clearQuery}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={6}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color="#98A2B3"
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.listContent,
          rows.length === 0 && styles.listContentEmpty,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        ListEmptyComponent={listEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.08)",
  },

  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  searchField: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(248,250,252,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.10)",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    ...typography.body,
    fontSize: 15,
    color: "#101828",
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },

  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },

  listContent: {
    paddingTop: 4,
  },

  listContentEmpty: {
    flexGrow: 1,
  },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },

  sectionTitle: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: "#667085",
  },

  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.06)",
  },

  rowPressed: {
    backgroundColor: "rgba(1,33,105,0.04)",
  },

  projectIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,33,105,0.07)",
  },

  resultBody: {
    flex: 1,
    minWidth: 0,
  },

  resultPrimary: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    color: "#101828",
  },

  resultPrimaryMuted: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: "400",
    color: "#667085",
  },

  resultSecondary: {
    ...typography.caption,
    fontSize: 13,
    color: "#667085",
    marginTop: 2,
  },

  postExcerpt: {
    ...typography.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: "#344054",
    marginTop: 3,
  },

  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },

  postTime: {
    ...typography.caption,
    fontSize: 12,
    color: "#98A2B3",
  },

  mediaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  mediaChipText: {
    ...typography.caption,
    fontSize: 11.5,
    color: "#667085",
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 48,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,33,105,0.06)",
    marginBottom: 14,
  },

  emptyTitle: {
    ...typography.bodyMedium,
    fontSize: 16,
    color: "#101828",
    textAlign: "center",
  },

  emptyBody: {
    ...typography.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#667085",
    textAlign: "center",
    marginTop: 8,
  },

  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
    gap: 12,
  },

  errorTitle: {
    ...typography.bodyMedium,
    fontSize: 15,
    color: "#101828",
  },

  retryButton: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.18)",
  },

  retryText: {
    ...typography.bodyMedium,
    fontSize: 14,
    color: KEPLER_NAVY,
  },
});
