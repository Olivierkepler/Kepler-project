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

import type { Delta } from "../../types/delta";

import { formatSignedValue } from "../../utils/home/homeFormatters";

type Props = {
  delta: Delta;

  projectName: string;

  planItemLabel: string;

  statusAccent: string;

  statusBackground: string;

  onPress: () => void;
};

export default function HomeIntelligenceCard({
  delta,
  projectName,
  planItemLabel,
  statusAccent,
  statusBackground,
  onPress,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,

        pressed &&
          styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text
            style={styles.project}
            numberOfLines={1}
          >
            {projectName}
          </Text>

          <Text
            style={styles.label}
            numberOfLines={2}
          >
            {planItemLabel}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                statusBackground,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  statusAccent,
              },
            ]}
          />

          <Text
            style={
              styles.statusBadgeText
            }
          >
            {delta.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View>
          <Text
            style={
              styles.differenceLabel
            }
          >
            FIELD DIFFERENCE
          </Text>

          <Text
            style={
              styles.difference
            }
          >
            {formatSignedValue(
              delta.difference,
              delta.unit,
            )}
          </Text>
        </View>

        <View style={styles.arrow}>
          <Ionicons
            name="arrow-forward"
            size={17}
            color={colors.brand.blue}
          />
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

  project: {
    ...typography.bodyMedium,

    color: colors.text.primary,
  },

  label: {
    ...typography.bodyLarge,

    marginTop: 5,

    color: colors.text.primary,
  },

  statusBadge: {
    minHeight: 28,

    paddingHorizontal: 10,

    borderRadius: 999,

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    gap: 6,
  },

  statusDot: {
    width: 6,
    height: 6,

    borderRadius: 3,
  },

  statusBadgeText: {
    ...typography.metadata,

    color: colors.text.primary,
  },

  footer: {
    marginTop: 19,
    paddingTop: 16,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    borderTopWidth:
      StyleSheet.hairlineWidth,

    borderTopColor: "#EAECF0",
  },

  differenceLabel: {
    ...typography.metadata,

    color: colors.text.primary,
  },

  difference: {
    ...typography.sectionTitle,

    marginTop: 4,

    color: colors.text.primary,
  },

  arrow: {
    width: 38,
    height: 38,

    borderRadius: 13,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#F1F8FD",
  },
});
