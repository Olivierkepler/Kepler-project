import React from "react";

import {
  StyleSheet,
  View,
} from "react-native";

import { colors } from "../../theme/colors";

import OverviewTile from "./OverviewTile";
import SectionHeader from "./SectionHeader";

type Props = {
  activeProjectCount: number;

  openDeltaCount: number;

  reviewedCount: number;

  measurementCount: number;

  onProjectsPress: () => void;

  onDeltasPress: () => void;
};

export default function HomeOverviewGrid({
  activeProjectCount,
  openDeltaCount,
  reviewedCount,
  measurementCount,
  onProjectsPress,
  onDeltasPress,
}: Props) {
  return (
    <>
      <SectionHeader title="OVERVIEW" />

      <View style={styles.grid}>
        <OverviewTile
          icon="business-outline"
          label="ACTIVE PROJECTS"
          value={activeProjectCount}
          subtitle="Current jobs"
          onPress={onProjectsPress}
        />

        <OverviewTile
          icon="git-compare-outline"
          label="OPEN DELTAS"
          value={openDeltaCount}
          subtitle="Needs attention"
          iconColor={colors.delta}
          iconBackground="#FFF8EB"
          onPress={onDeltasPress}
        />

        <OverviewTile
          icon="checkmark-done-outline"
          label="REVIEWED"
          value={reviewedCount}
          subtitle="Human reviewed"
          iconColor={colors.success}
          iconBackground="#ECFDF3"
        />

        <OverviewTile
          icon="resize-outline"
          label="MEASUREMENTS"
          value={measurementCount}
          subtitle="Field records"
          iconColor={colors.brand.cyan}
          iconBackground="#ECFDFF"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",

    justifyContent: "space-between",

    rowGap: 12,
  },
});