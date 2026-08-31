import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { typography } from "../../theme/colors";

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  "OnboardingCapture"
>;

export default function OnboardingCaptureScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.progress} accessibilityLabel="Step 2 of 3">
          2 / 3
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          CAPTURE REALITY
        </Text>
        <Text style={styles.body}>
          Record what is actually happening in the field. Measurements
          establish quantity. Photos and notes document conditions.
        </Text>

        <View
          style={styles.visualCard}
          accessibilityLabel="Field capture: eighty two feet measurement, photo evidence, note"
        >
          <Text style={styles.visualEyebrow}>FIELD</Text>
          <View style={styles.chipRow}>
            <View style={[styles.chip, styles.chipPrimary]}>
              <Text style={styles.chipEyebrow}>MEASUREMENT</Text>
              <Text style={styles.chipValue}>82 FT</Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>PHOTO</Text>
              <Text style={styles.chipHint}>Evidence</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>NOTE</Text>
              <Text style={styles.chipHint}>Observation</Text>
            </View>
          </View>
          <Text style={styles.groundingNote}>
            Photos document conditions. They do not establish the recorded
            measurement.
          </Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate("OnboardingReconcile")}
          accessibilityRole="button"
          accessibilityLabel="Next"
        >
          <Text style={styles.primaryButtonText}>Next</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B0F14",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
  },
  progress: {
    color: "#F4A623",
    ...typography.button,
  },
  title: {
    marginTop: 18,
    color: "#FFFFFF",
    ...typography.display,
  },
  body: {
    marginTop: 14,
    color: "#8C98A8",
    ...typography.bodyLarge,
  },
  visualCard: {
    marginTop: 36,
    marginBottom: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E2936",
    backgroundColor: "#0E141C",
    padding: 20,
  },
  visualEyebrow: {
    color: "#F4A623",
    ...typography.caption,
    textAlign: "center",
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  chip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#243041",
    backgroundColor: "#15202B",
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  chipPrimary: {
    borderColor: "#F4A623",
  },
  chipEyebrow: {
    color: "#8C98A8",
    ...typography.metadata,
  },
  chipValue: {
    marginTop: 6,
    color: "#FFFFFF",
    fontFamily: "Poppins_500Medium",
    fontSize: 28,
  },
  chipLabel: {
    color: "#FFFFFF",
    ...typography.bodyMedium,
  },
  chipHint: {
    marginTop: 4,
    color: "#8C98A8",
    ...typography.caption,
  },
  groundingNote: {
    marginTop: 12,
    color: "#667085",
    ...typography.caption,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: "auto",
    backgroundColor: "#F4A623",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#0B0F14",
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
  },
});
