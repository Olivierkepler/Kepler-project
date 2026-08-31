import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import ProjectPlan from "../components/project/ProjectPlan";
import type { RootStackParamList } from "../navigation/types";
import { typography } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectPlan">;

/**
 * Standalone Project Plan route wrapper.
 * Deep links / prior navigation continue to use this screen.
 */
export default function ProjectPlanScreen({ route, navigation }: Props) {
  const { projectId } = route.params;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={21} color="#111827" />
        </Pressable>
        <Text style={styles.topBarTitle}>Plan</Text>
        <View style={styles.topBarPlaceholder} />
      </View>

      <ProjectPlan
        projectId={projectId}
        onAddPlanItem={() =>
          navigation.navigate("PlanAddMethod", { projectId })
        }
        onOpenPlanItem={(planItemId) =>
          navigation.navigate("PlanItemDetail", {
            projectId,
            planItemId,
          })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: "#111827",
  },
  topBarPlaceholder: {
    width: 42,
  },
});
