import React from "react";

import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  colors,
  typography,
} from "../../theme/colors";

import type { ProjectSnapshot } from "../../utils/domain/summarizeProjects";

import HomeProjectCard from "./HomeProjectCard";
import SectionHeader from "./SectionHeader";

type Props = {
  snapshots: ProjectSnapshot[];

  onSeeAll: () => void;

  onProjectPress: (
    projectId: string,
  ) => void;
};

export default function HomeProjectsSection({
  snapshots,
  onSeeAll,
  onProjectPress,
}: Props) {
  return (
    <>
      <SectionHeader
        title="ACTIVE PROJECTS"
        actionLabel="See all"
        onPress={onSeeAll}
      />

      {snapshots.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="business-outline"
              size={22}
              color={colors.brand.blue}
            />
          </View>

          <Text style={styles.emptyTitle}>
            No active projects
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            Active project progress will
            appear here.
          </Text>
        </View>
      ) : (
        snapshots.map((snapshot) => (
          <HomeProjectCard
            key={snapshot.projectId}
            snapshot={snapshot}
            onPress={() =>
              onProjectPress(
                snapshot.projectId,
              )
            }
          />
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    paddingVertical: 28,
    paddingHorizontal: 20,

    alignItems: "center",

    borderRadius: 22,

    backgroundColor:
      "rgba(255,255,255,0.90)",

    shadowColor:
      colors.shadow.soft,

    shadowOffset: {
      width: 0,
      height: 6,
    },

    shadowOpacity: 0.82,
    shadowRadius: 16,

    elevation: 3,
  },

  emptyIcon: {
    width: 46,
    height: 46,

    borderRadius: 16,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#F1F8FD",
  },

  emptyTitle: {
    ...typography.bodyMedium,

    marginTop: 13,

    color: colors.text.primary,
  },

  emptyDescription: {
    ...typography.caption,

    marginTop: 5,

    maxWidth: 250,

    color: colors.text.primary,

    textAlign: "center",
  },
});
