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
  "OnboardingPlan"
>;

export default function OnboardingPlanScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.progress} accessibilityLabel="Step 1 of 3">
          1 / 3
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          PLAN THE WORK
        </Text>
        <Text style={styles.body}>
          Define what should happen. Create project plans, quantities,
          production rates and impact inputs that become the baseline for
          field comparison.
        </Text>

        <View
          style={styles.visualCard}
          accessibilityLabel="Plan baseline one hundred feet"
        >
          <Text style={styles.visualEyebrow}>PLAN</Text>
          <Text style={styles.visualValue}>100 FT</Text>
          <View style={styles.baselineBar} />
          <Text style={styles.visualCaption}>BASELINE</Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate("OnboardingCapture")}
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
    marginTop: 40,
    marginBottom: 40,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E2936",
    backgroundColor: "#0E141C",
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  visualEyebrow: {
    color: "#F4A623",
    ...typography.caption,
  },
  visualValue: {
    marginTop: 16,
    color: "#FFFFFF",
    fontFamily: "Poppins_500Medium",
    fontSize: 40,
  },
  baselineBar: {
    marginTop: 18,
    width: "70%",
    height: 3,
    backgroundColor: "#F4A623",
    borderRadius: 2,
  },
  visualCaption: {
    marginTop: 14,
    color: "#8C98A8",
    ...typography.caption,
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
