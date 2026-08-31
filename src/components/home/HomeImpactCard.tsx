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

import {
  formatSignedCurrency,
  formatSignedDays,
  formatSignedHours,
} from "../../utils/home/homeFormatters";

import SectionHeader from "./SectionHeader";

type Props = {
  totalCostImpact: number;

  totalScheduleImpactDays: number;

  totalLaborImpactHours: number;
};

export default function HomeImpactCard({
  totalCostImpact,
  totalScheduleImpactDays,
  totalLaborImpactHours,
}: Props) {
  return (
    <>
      <SectionHeader
        title="IMPACT SUMMARY"
      />

      <View style={styles.card}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              CURRENT DELTA IMPACT
            </Text>

            <Text style={styles.title}>
              Operational variance
            </Text>
          </View>

          <View style={styles.icon}>
            <Ionicons
              name="analytics-outline"
              size={21}
              color={colors.delta}
            />
          </View>
        </View>

        <View style={styles.divider} />

        <MetricRow
          icon="cash-outline"
          label="COST"
          value={formatSignedCurrency(
            totalCostImpact,
          )}
        />

        <MetricRow
          icon="calendar-outline"
          label="SCHEDULE"
          value={formatSignedDays(
            totalScheduleImpactDays,
          )}
        />

        <MetricRow
          icon="people-outline"
          label="LABOR"
          value={formatSignedHours(
            totalLaborImpactHours,
          )}
        />
      </View>
    </>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabelRow}>
        <Ionicons
          name={icon}
          size={17}
          color={colors.text.primary}
        />

        <Text style={styles.metricLabel}>
          {label}
        </Text>
      </View>

      <Text style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  eyebrow: {
    ...typography.caption,

    color: colors.text.primary,
  },

  title: {
    ...typography.sectionTitle,

    marginTop: 4,

    color: colors.text.primary,
  },

  icon: {
    width: 42,
    height: 42,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#FFF8EB",
  },

  divider: {
    height:
      StyleSheet.hairlineWidth,

    marginTop: 17,
    marginBottom: 5,

    backgroundColor: "#EAECF0",
  },

  metric: {
    minHeight: 45,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",

    gap: 9,
  },

  metricLabel: {
    ...typography.caption,

    color: colors.text.primary,
  },

  metricValue: {
    ...typography.bodyLarge,

    color: colors.text.primary,
  },
});
