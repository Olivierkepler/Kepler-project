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

type OperationalStatus = {
  text: string;

  accent: string;

  background: string;

  icon:
    | "alert-circle-outline"
    | "checkmark-circle-outline";
};

type Props = {
  activeProjectCount: number;

  openDeltaCount: number;

  operationalStatus:
    OperationalStatus;
};

export default function HomeHeroCard({
  activeProjectCount,
  openDeltaCount,
  operationalStatus,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.icon}>
          <Ionicons
            name="pulse-outline"
            size={22}
            color={colors.brand.blue}
          />
        </View>

        <View
          style={[
            styles.liveBadge,
            {
              backgroundColor:
                operationalStatus.background,
            },
          ]}
        >
          <Ionicons
            name={
              operationalStatus.icon
            }
            size={14}
            color={
              operationalStatus.accent
            }
          />

          <Text style={styles.liveText}>
            LIVE
          </Text>
        </View>
      </View>

      <Text style={styles.eyebrow}>
        FIELD OPERATIONS
      </Text>

      <Text style={styles.title}>
        Project intelligence at a glance.
      </Text>

      <Text style={styles.description}>
        Reconcile jobsite reality against
        planned work and surface the
        conditions that need attention.
      </Text>

      <View style={styles.statusRow}>
        <Ionicons
          name={operationalStatus.icon}
          size={17}
          color={
            operationalStatus.accent
          }
        />

        <Text style={styles.statusText}>
          {operationalStatus.text}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {activeProjectCount}
          </Text>

          <Text style={styles.statLabel}>
            ACTIVE PROJECTS
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {openDeltaCount}
          </Text>

          <Text style={styles.statLabel}>
            OPEN DELTAS
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 24,

    padding: 20,

    borderRadius: 26,

    backgroundColor:
      "rgba(255,255,255,0.92)",

    shadowColor:
      colors.shadow.soft,

    shadowOffset: {
      width: 0,
      height: 8,
    },

    shadowOpacity: 0.88,
    shadowRadius: 22,

    elevation: 4,
  },

  topRow: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",
  },

  icon: {
    width: 44,
    height: 44,

    borderRadius: 15,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#F1F8FD",
  },

  liveBadge: {
    minHeight: 30,

    paddingHorizontal: 11,

    borderRadius: 999,

    flexDirection: "row",
    alignItems: "center",

    gap: 5,
  },

  liveText: {
    ...typography.caption,

    color: colors.text.primary,
  },

  eyebrow: {
    ...typography.caption,

    marginTop: 22,

    color: colors.text.primary,
  },

  title: {
    ...typography.display,

    marginTop: 7,

    maxWidth: 310,

    color: colors.text.primary,
  },

  description: {
    ...typography.body,

    marginTop: 10,

    maxWidth: 325,

    color: colors.text.primary,
  },

  statusRow: {
    marginTop: 18,

    flexDirection: "row",
    alignItems: "center",

    gap: 7,
  },

  statusText: {
    ...typography.bodyMedium,

    flex: 1,

    color: colors.text.primary,
  },

  statsRow: {
    marginTop: 22,
    paddingTop: 18,

    flexDirection: "row",
    alignItems: "center",

    borderTopWidth:
      StyleSheet.hairlineWidth,

    borderTopColor: "#EAECF0",
  },

  stat: {
    flex: 1,
  },

  statValue: {
    ...typography.display,

    color: colors.text.primary,
  },

  statLabel: {
    ...typography.caption,

    marginTop: 3,

    color: colors.text.primary,
  },

  divider: {
    width:
      StyleSheet.hairlineWidth,

    height: 42,

    marginHorizontal: 20,

    backgroundColor: "#EAECF0",
  },
});
