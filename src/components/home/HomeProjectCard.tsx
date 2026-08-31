import React from "react";

import {
  Pressable,
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

import {
  clampProgress,
  formatSignedCurrency,
} from "../../utils/home/homeFormatters";

type Props = {
  snapshot: ProjectSnapshot;

  onPress: () => void;
};

export default function HomeProjectCard({
  snapshot,
  onPress,
}: Props) {
  const progress =
    clampProgress(snapshot.progress);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,

        pressed &&
          styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${snapshot.name}`}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text
            style={styles.name}
            numberOfLines={1}
          >
            {snapshot.name}
          </Text>

          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={14}
              color={colors.text.primary}
            />

            <Text
              style={styles.location}
              numberOfLines={1}
            >
              {snapshot.location}
            </Text>
          </View>
        </View>

        <View style={styles.chevron}>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={colors.text.primary}
          />
        </View>
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>
          Project progress
        </Text>

        <Text style={styles.progressValue}>
          {snapshot.progress}%
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
            },
          ]}
        />
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>
            OPEN DELTAS
          </Text>

          <Text style={styles.metricValue}>
            {snapshot.openCount}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View
          style={[
            styles.metric,
            styles.metricRight,
          ]}
        >
          <Text style={styles.metricLabel}>
            COST IMPACT
          </Text>

          <Text
            style={styles.metricValue}
            numberOfLines={1}
          >
            {formatSignedCurrency(
              snapshot.totalCostImpact,
            )}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,

    padding: 18,

    borderRadius: 22,

    backgroundColor:
      "rgba(255,255,255,0.90)",

    shadowColor:
      colors.shadow.soft,

    shadowOffset: {
      width: 0,
      height: 7,
    },

    shadowOpacity: 0.82,
    shadowRadius: 18,

    elevation: 3,
  },

  cardPressed: {
    opacity: 0.82,

    transform: [
      {
        scale: 0.985,
      },
    ],
  },

  header: {
    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent: "space-between",
  },

  heading: {
    flex: 1,

    paddingRight: 12,
  },

  name: {
    ...typography.bodyLarge,

    color: colors.text.primary,
  },

  locationRow: {
    marginTop: 5,

    flexDirection: "row",

    alignItems: "center",

    gap: 4,
  },

  location: {
    ...typography.caption,

    flexShrink: 1,

    color: colors.text.primary,
  },

  chevron: {
    width: 34,
    height: 34,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#F8FAFC",
  },

  progressHeader: {
    marginTop: 20,
    marginBottom: 7,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",
  },

  progressLabel: {
    ...typography.caption,

    color: colors.text.primary,
  },

  progressValue: {
    ...typography.bodyMedium,

    color: colors.text.primary,
  },

  progressTrack: {
    height: 7,

    borderRadius: 999,

    overflow: "hidden",

    backgroundColor: "#EEF2F6",
  },

  progressFill: {
    height: "100%",

    borderRadius: 999,

    backgroundColor:
      colors.brand.blue,
  },

  metricRow: {
    marginTop: 19,

    flexDirection: "row",
    alignItems: "center",
  },

  metric: {
    flex: 1,
  },

  metricRight: {
    alignItems: "flex-end",
  },

  metricDivider: {
    width:
      StyleSheet.hairlineWidth,

    height: 34,

    marginHorizontal: 18,

    backgroundColor: "#EAECF0",
  },

  metricLabel: {
    ...typography.metadata,

    color: colors.text.primary,
  },

  metricValue: {
    ...typography.bodyLarge,

    marginTop: 4,

    color: colors.text.primary,
  },
});
