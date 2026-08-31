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
} from "../../../theme/colors";

import type {
  HomeFeedIntelligenceUpdate,
  HomeFeedProjectActivityUpdate,
} from "../../../types/homeFeed";

import { formatFeedRelativeTime } from "../../../utils/home/feedFormatters";

import { formatSignedValue } from "../../../utils/home/homeFormatters";

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

type IntelligenceProps = {
  item: HomeFeedIntelligenceUpdate;
  onDeltaPress: (
    deltaId: string,
  ) => void;
  onProjectPress?: (
    projectId: string,
  ) => void;
};

export function HomeIntelligencePost({
  item,
  onDeltaPress,
}: IntelligenceProps) {
  const percentLabel =
    item.percentDifference ==
    null
      ? null
      : `${item.percentDifference > 0 ? "+" : ""}${item.percentDifference.toFixed(1)}%`;

  return (
    <View style={styles.post}>
      <View style={styles.eyebrowRow}>
        <Ionicons
          name="sparkles"
          size={14}
          color={KEPLER_NAVY}
        />
        <Text style={styles.eyebrow}>
          BUILDSIGMA INTELLIGENCE
        </Text>
        <Text style={styles.time}>
          {formatFeedRelativeTime(
            item.createdAt,
          )}
        </Text>
      </View>

      <Text style={styles.title}>
        Potential variance detected
      </Text>

      <Text style={styles.subject}>
        {item.planItemLabel}
      </Text>

      <Text style={styles.project}>
        {item.projectName}
      </Text>

      <View style={styles.metrics}>
        <Metric
          label="Planned"
          value={`${item.plannedValue.toFixed(0)} ${item.unit}`}
        />
        <Metric
          label="Field"
          value={`${item.actualValue.toFixed(0)} ${item.unit}`}
        />
        <Metric
          label="Difference"
          value={formatSignedValue(
            item.difference,
            item.unit,
          )}
          emphasis
        />
      </View>

      {percentLabel ? (
        <Text style={styles.percent}>
          {percentLabel} variance
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() =>
            onDeltaPress(item.deltaId)
          }
          accessibilityRole="button"
          accessibilityLabel="Review delta"
          style={({ pressed }) => [
            styles.reviewLink,
            pressed &&
              styles.reviewButtonPressed,
          ]}
        >
          <Text style={styles.reviewText}>
            Review Delta
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={KEPLER_NAVY}
          />
        </Pressable>
      </View>
    </View>
  );
}

type ActivityProps = {
  item: HomeFeedProjectActivityUpdate;
  onProjectPress?: (
    projectId: string,
  ) => void;
};

export function HomeProjectActivityPost({
  item,
  onProjectPress,
}: ActivityProps) {
  return (
    <View style={styles.post}>
      <View style={styles.activityHeader}>
        <View style={styles.activityIcon}>
          <Ionicons
            name="pulse-outline"
            size={16}
            color={KEPLER_NAVY}
          />
        </View>

        <View style={styles.activityCopy}>
          <Text style={styles.activityLabel}>
            {item.activityLabel}
          </Text>
          <Text
            style={styles.project}
            numberOfLines={1}
          >
            {item.projectName}
          </Text>
        </View>

        <Text style={styles.time}>
          {formatFeedRelativeTime(
            item.createdAt,
          )}
        </Text>
      </View>

      <Text style={styles.body}>
        {item.text}
      </Text>

      {onProjectPress ? (
        <Pressable
          onPress={() =>
            onProjectPress(
              item.projectId,
            )
          }
          accessibilityRole="button"
          accessibilityLabel="Open project"
          style={({ pressed }) => [
            styles.projectLink,
            pressed && styles.reviewButtonPressed,
          ]}
        >
          <Text style={styles.projectLinkText}>
            View project
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={KEPLER_NAVY}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>
        {label}
      </Text>
      <Text
        style={[
          styles.metricValue,
          emphasis &&
            styles.metricValueEmphasis,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingLeft: 14,
    backgroundColor:
      "rgba(255,255,255,0.8)",
    borderRadius: 17,
    borderWidth:
      StyleSheet.hairlineWidth,
    borderColor:
      "rgba(15,23,42,0.07)",
    borderLeftWidth: 3,
    borderLeftColor: KEPLER_RED,
  },

  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 7,
  },

  eyebrow: {
    ...typography.metadata,
    flex: 1,
    color: KEPLER_NAVY,
    fontSize: 10,
    letterSpacing: 0.85,
    fontWeight: "600",
  },

  time: {
    ...typography.caption,
    color: "#98A2B3",
    fontSize: 11,
  },

  title: {
    ...typography.bodyMedium,
    color: "#667085",
    fontWeight: "500",
    fontSize: 13,
  },

  subject: {
    ...typography.bodyMedium,
    color: "#101828",
    marginTop: 3,
    fontWeight: "600",
    fontSize: 15,
  },

  project: {
    ...typography.caption,
    color: KEPLER_NAVY,
    marginTop: 2,
    fontWeight: "600",
    fontSize: 12,
    opacity: 0.9,
  },

  metrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 11,
  },

  metric: {
    flex: 1,
    minWidth: 0,
  },

  metricLabel: {
    ...typography.metadata,
    color: "#667085",
    fontSize: 10,
  },

  metricValue: {
    ...typography.caption,
    color: "#101828",
    marginTop: 2,
    fontWeight: "600",
    fontSize: 12.5,
  },

  metricValueEmphasis: {
    color: colors.delta,
  },

  percent: {
    ...typography.caption,
    color: colors.delta,
    marginTop: 6,
    fontWeight: "600",
    fontSize: 12,
  },

  actions: {
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor:
      "rgba(15,23,42,0.06)",
  },

  reviewLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    minHeight: 36,
  },

  reviewButtonPressed: {
    opacity: 0.68,
  },

  reviewText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontWeight: "600",
    fontSize: 13,
  },

  activityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },

  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(1,33,105,0.07)",
  },

  activityCopy: {
    flex: 1,
    minWidth: 0,
  },

  activityLabel: {
    ...typography.caption,
    color: "#667085",
    fontWeight: "600",
  },

  body: {
    ...typography.body,
    color: "#101828",
    lineHeight: 22,
  },

  projectLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 10,
    minHeight: 32,
  },

  projectLinkText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontWeight: "600",
  },
});
