import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useOnboardingComplete } from "../../navigation/onboardingComplete";
import type { OnboardingStackParamList } from "../../navigation/types";
import { setHasCompletedOnboarding } from "../../utils/onboarding/onboardingPreference";
import { typography } from "../../theme/colors";

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  "OnboardingReconcile"
>;

const STEPS = [
  { label: "PLAN", value: "100 FT" },
  { label: "FIELD", value: "82 FT" },
  { label: "DELTA", value: "−18 FT" },
  { label: "AGENT REVIEW", value: "Evidence + summary" },
  { label: "HUMAN DECISION", value: "Accept · Reject · Resolve" },
] as const;

export default function OnboardingReconcileScreen(_props: Props) {
  const onComplete = useOnboardingComplete();
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      await setHasCompletedOnboarding(true);
      onComplete();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.progress} accessibilityLabel="Step 3 of 3">
          3 / 3
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          RECONCILE PLAN VS REALITY
        </Text>
        <Text style={styles.body}>
          BuildSigma compares recorded field conditions against the plan,
          calculates deterministic variance and impact, reviews supporting
          evidence, and prepares the result for human review.
        </Text>

        <View
          style={styles.visualCard}
          accessibilityLabel="Plan to field to delta to agent review to human decision"
        >
          {STEPS.map((step, index) => (
            <React.Fragment key={step.label}>
              <View style={styles.stepRow}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={styles.stepValue}>{step.value}</Text>
              </View>
              {index < STEPS.length - 1 ? (
                <Text style={styles.arrow} accessibilityElementsHidden>
                  ↓
                </Text>
              ) : null}
            </React.Fragment>
          ))}
        </View>

        <Pressable
          style={[styles.primaryButton, submitting && styles.primaryDisabled]}
          onPress={() => {
            void handleStart();
          }}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Start BuildSigma"
          accessibilityState={{ disabled: submitting, busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#0B0F14" />
          ) : (
            <Text style={styles.primaryButtonText}>Start BuildSigma</Text>
          )}
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
    marginTop: 28,
    marginBottom: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E2936",
    backgroundColor: "#0E141C",
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  stepRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#243041",
    backgroundColor: "#15202B",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stepLabel: {
    color: "#F4A623",
    ...typography.caption,
  },
  stepValue: {
    marginTop: 4,
    color: "#FFFFFF",
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
  },
  arrow: {
    color: "#F4A623",
    textAlign: "center",
    ...typography.bodyLarge,
    marginVertical: 4,
    fontFamily: "Poppins_500Medium",
  },
  primaryButton: {
    marginTop: "auto",
    backgroundColor: "#F4A623",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#0B0F14",
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
  },
});
