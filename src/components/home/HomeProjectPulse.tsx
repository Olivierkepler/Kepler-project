import React from "react";

import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  typography,
} from "../../theme/colors";

const KEPLER_NAVY = "#012169";

type Metric = {
  key: string;
  value: number;
  label: string;
};

type Props = {
  activeProjectCount: number;
  openDeltaCount: number;
  reviewedCount: number;
  measurementCount: number;
};

export default function HomeProjectPulse({
  activeProjectCount,
  openDeltaCount,
  reviewedCount,
  measurementCount,
}: Props) {
  const metrics: Metric[] = [
    {
      key: "active",
      value: activeProjectCount,
      label: "Active",
    },
    {
      key: "deltas",
      value: openDeltaCount,
      label: "Deltas",
    },
    {
      key: "reviewed",
      value: reviewedCount,
      label: "Reviewed",
    },
    {
      key: "field",
      value: measurementCount,
      label: "Field",
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>
        PROJECT PULSE
      </Text>

      <View style={styles.row}>
        {metrics.map((metric, index) => (
          <React.Fragment key={metric.key}>
            {index > 0 ? (
              <View style={styles.separator} />
            ) : null}

            <View style={styles.metric}>
              <Text style={styles.value}>
                {metric.value}
              </Text>
              <Text style={styles.label}>
                {metric.label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>


    </View>
  );








}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },

  eyebrow: {
    ...typography.metadata,
    color: KEPLER_NAVY,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "600",
    opacity: 0.82,
    marginBottom: 4,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor:
      "rgba(255,255,255,0.78)",
    borderWidth:
      StyleSheet.hairlineWidth,
    borderColor:
      "rgba(15,23,42,0.07)",
  },

  metric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },

  separator: {
    width:
      StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor:
      "rgba(15,23,42,0.07)",
    marginVertical: 4,
  },

  value: {
    ...typography.bodyMedium,
    color: "#101828",
    fontWeight: "700",
    fontSize: 15,
  },

  label: {
    ...typography.caption,
    color: "#667085",
    fontSize: 10.5,
    marginTop: 1,
  },
});
