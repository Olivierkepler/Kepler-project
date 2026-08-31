import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import WorkProgressContent from "../components/project/WorkProgressContent";
import type { RootStackParamList } from "../navigation/types";
import { colors, typography } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "WorkProgress">;

/**
 * Standalone Work Progress route wrapper.
 * Deep links / notifications continue to use this screen.
 */
export default function WorkProgressScreen({ route, navigation }: Props) {
  const { projectId } = route.params;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Work Progress</Text>
        <View style={styles.headerSpacer} />
      </View>

      <WorkProgressContent
        projectId={projectId}
        onOpenWorkPackage={({ remoteProjectId, workPackageId }) =>
          navigation.navigate("WorkProgressDetail", {
            projectId,
            remoteProjectId,
            workPackageId,
          })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  title: {
    ...typography.sectionTitle,
    flex: 1,
    textAlign: "center",
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 40,
  },
});
