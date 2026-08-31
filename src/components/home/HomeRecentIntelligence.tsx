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

import type { Delta } from "../../types/delta";
import type { PlanItem } from "../../types/plan";
import type { Project } from "../../types/project";

import HomeIntelligenceCard from "./HomeIntelligenceCard";
import SectionHeader from "./SectionHeader";

type Props = {
  recentDeltas: Delta[];

  projectsById:
    Map<string, Project>;

  planItemsById:
    Map<string, PlanItem>;

  onSeeAll: () => void;

  onDeltaPress: (
    deltaId: string,
  ) => void;
};

function getStatusAccent(
  status: Delta["status"],
): string {
  switch (status) {
    case "resolved":
    case "accepted":
      return colors.success;

    case "rejected":
      return colors.danger;

    case "open":
    default:
      return colors.delta;
  }
}

function getStatusBackground(
  status: Delta["status"],
): string {
  switch (status) {
    case "resolved":
    case "accepted":
      return "#ECFDF3";

    case "rejected":
      return "#FFF1F0";

    case "open":
    default:
      return "#FFF8EB";
  }
}

export default function HomeRecentIntelligence({
  recentDeltas,
  projectsById,
  planItemsById,
  onSeeAll,
  onDeltaPress,
}: Props) {
  return (
    <>
      <SectionHeader
        title="RECENT INTELLIGENCE"
        actionLabel={
          recentDeltas.length > 0
            ? "See all"
            : undefined
        }
        onPress={
          recentDeltas.length > 0
            ? onSeeAll
            : undefined
        }
      />

      {recentDeltas.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="sparkles-outline"
              size={22}
              color={colors.brand.blue}
            />
          </View>

          <Text style={styles.emptyTitle}>
            No field intelligence yet
          </Text>

          <Text
            style={
              styles.emptyDescription
            }
          >
            New plan-vs-reality records
            will appear here.
          </Text>
        </View>
      ) : (
        recentDeltas.map((delta) => {
          const project =
            projectsById.get(
              delta.projectId,
            );

          const planItem =
            planItemsById.get(
              delta.planItemId,
            );

          return (
            <HomeIntelligenceCard
              key={delta.id}
              delta={delta}
              projectName={
                project?.name ??
                "Unknown project"
              }
              planItemLabel={
                planItem?.label ??
                "Unknown plan item"
              }
              statusAccent={
                getStatusAccent(
                  delta.status,
                )
              }
              statusBackground={
                getStatusBackground(
                  delta.status,
                )
              }
              onPress={() =>
                onDeltaPress(
                  delta.id,
                )
              }
            />
          );
        })
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
