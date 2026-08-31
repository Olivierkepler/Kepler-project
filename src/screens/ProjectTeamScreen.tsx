import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import ProjectTeamContent from "../components/project/ProjectTeamContent";
import type { RootStackParamList } from "../navigation/types";
import { colors, typography } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectTeam">;

/**
 * Standalone Project Team route wrapper.
 * Deep links / notifications continue to use this screen.
 */
export default function ProjectTeamScreen({ route, navigation }: Props) {
  const projectId = route.params.projectId;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>Team</Text>
        <View style={styles.topBarPlaceholder} />
      </View>

      <ProjectTeamContent
        projectId={projectId}
        onInviteMember={() =>
          navigation.navigate("InviteProjectMember", { projectId })
        }
        onOpenMember={(projectMemberId) =>
          navigation.navigate("ProjectTeamMember", {
            projectId,
            projectMemberId,
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
    marginBottom: 18,
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
