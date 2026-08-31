import React from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  typography,
} from "../../../theme/colors";

import type { HomeFeedFilter } from "../../../types/homeFeed";

const KEPLER_NAVY = "#012169";

type Props = {
  value: HomeFeedFilter;
  onChange: (
    filter: HomeFeedFilter,
  ) => void;
};

const FILTERS: {
  key: HomeFeedFilter;
  label: string;
}[] = [
  { key: "all", label: "All" },
  {
    key: "my_projects",
    label: "My Projects",
  },
];

export default function HomeFeedFilters({
  value,
  onChange,
}: Props) {
  return (
    <View style={styles.container}>
      {FILTERS.map((filter) => {
        const active =
          value === filter.key;

        return (
          <Pressable
            key={filter.key}
            onPress={() =>
              onChange(filter.key)
            }
            accessibilityRole="button"
            accessibilityLabel={`Filter feed: ${filter.label}`}
            accessibilityState={{
              selected: active,
            }}
            style={({ pressed }) => [
              styles.chip,
              active &&
                styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                active &&
                  styles.chipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth:
      StyleSheet.hairlineWidth,
    borderColor:
      "rgba(1,33,105,0.12)",
    backgroundColor:
      "rgba(255,255,255,0.62)",
  },

  chipActive: {
    backgroundColor:
      "rgba(1,33,105,0.08)",
    borderColor:
      "rgba(1,33,105,0.28)",
  },

  chipText: {
    ...typography.caption,
    color: "#667085",
    fontWeight: "600",
    fontSize: 13,
  },

  chipTextActive: {
    color: KEPLER_NAVY,
  },

  pressed: {
    opacity: 0.7,
  },
});
