import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import ProjectTeamMemberContent from "../components/project/ProjectTeamMemberContent";
import type { RootStackParamList } from "../navigation/types";
import { colors, typography } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectTeamMember">;

export default function ProjectTeamMemberScreen({ route, navigation }: Props) {
  const { projectId, projectMemberId } = route.params;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back to team"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>Team</Text>
        <View style={styles.topBarPlaceholder} />
      </View>

      <ProjectTeamMemberContent
        projectId={projectId}
        projectMemberId={projectMemberId}
        onOpenPlanItem={(planItemId) =>
          navigation.navigate("PlanItemDetail", {
            projectId,
            planItemId,
          })
        }
        onOpenConversation={(params) =>
          navigation.navigate("ProjectChat", params)
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
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  topBarPlaceholder: {
    width: 42,
  },
});
