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

import BuildSigmaAnimatedLogo from "../../components/branding/BuildSigmaAnimatedLogo";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { typography } from "../../theme/typography";
import KeplerLogo from "../../components/branding/KeplerLogo";

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  "OnboardingWelcome"
>;

const PIPELINE = ["PLAN", "FIELD", "DELTA", "INTELLIGENCE"] as const;

export default function OnboardingWelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* <BuildSigmaAnimatedLogo
          size={112}
          showWordmark
          showTagline
          tagline="PLAN ↔ REALITY"
          style={styles.logo}
        /> */}

        <KeplerLogo
          width={480}
          height={480}
          style={styles.logo}
        />    

        <View
          style={styles.hero}
          accessibilityLabel="Plan to field to delta to intelligence"
        >
          <View style={styles.gridBackdrop}>
            {[0, 1, 2, 3].map((row) => (
              <View key={row} style={styles.gridRow}>
                {[0, 1, 2].map((col) => (
                  <View key={col} style={styles.gridCell} />
                ))}
              </View>
            ))}
          </View>

          <View style={styles.pipeline}>
            {PIPELINE.map((label, index) => (
              <React.Fragment key={label}>
                <View style={styles.pipelineNode}>
                  <Text style={styles.pipelineLabel}>{label}</Text>
                </View>
                {index < PIPELINE.length - 1 ? (
                  <View style={styles.pipelineConnector} />
                ) : null}
              </React.Fragment>
            ))}
          </View>
        </View>

        <Text style={styles.headline}>
          Turn field conditions into actionable project intelligence.
        </Text>
        <Text style={styles.body}>
          Capture measurements, evidence and field activity. BuildSigma
          reconciles reality against the project plan.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate("OnboardingPlan")}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
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
    paddingTop: 28,
    paddingBottom: 28,
    justifyContent: "center",
  },
  logo: {
    marginBottom: 20,
  },
  hero: {
    marginTop: 12,
    marginBottom: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E2936",
    backgroundColor: "#0E141C",
    overflow: "hidden",
    paddingVertical: 24,
    paddingHorizontal: 16,
    minHeight: 180,
    justifyContent: "center",
  },
  gridBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    padding: 12,
    justifyContent: "space-between",
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flex: 1,
  },
  gridCell: {
    flex: 1,
    margin: 4,
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 4,
  },
  pipeline: {
    alignItems: "center",
    gap: 0,
  },
  pipelineNode: {
    backgroundColor: "#15202B",
    borderWidth: 1,
    borderColor: "#F4A623",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 160,
    alignItems: "center",
  },
  pipelineLabel: {
    ...typography.caption,
    color: "#F4A623",
    fontFamily: "Poppins_500Medium",
    letterSpacing: 1.5,
  },
  pipelineConnector: {
    width: 2,
    height: 12,
    backgroundColor: "#F4A623",
    opacity: 0.7,
  },
  headline: {
    ...typography.title,
    color: "#FFFFFF",
    textAlign: "center",
  },
  body: {
    ...typography.bodyLarge,
    marginTop: 14,
    color: "#8C98A8",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 36,
    backgroundColor: "#F4A623",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    ...typography.button,
    color: "#0B0F14",
  },
});
