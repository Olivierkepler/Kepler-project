import React from "react";

import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Ionicons from "@expo/vector-icons/Ionicons";

import type { RootStackParamList } from "../../navigation/types";

import { typography } from "../../theme/colors";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "PlanAddMethod"
>;

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";

const PROJECT_BACKGROUND =
  require("../../../assets/bgproject.png");

/**
 * Lightweight method chooser before AddPlanItem / PlanImportStart.
 *
 * Navigation behavior:
 * - Manual -> AddPlanItem
 * - File generation -> PlanImportStart
 *
 * Existing route behavior is intentionally preserved.
 */
export default function PlanAddMethodSheet({
  route,
  navigation,
}: Props) {
  const { projectId } = route.params;

  const handleManualPress = () => {
    navigation.replace("AddPlanItem", {
      projectId,
    });
  };

  const handleImportPress = () => {
    navigation.replace("PlanImportStart", {
      projectId,
    });
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "bottom"]}
    >
      <ImageBackground
        source={PROJECT_BACKGROUND}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.container}>
          {/* Top bar */}
          <View style={styles.topBar}>
            {/* <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="Close add to plan"
              hitSlop={8}
            >
              <Ionicons
                name="close"
                size={22}
                color={KEPLER_NAVY}
              />
            </Pressable> */}

            <View style={styles.topBarCenter}>
              <Text style={styles.topBarLabel}>
                ADD TO PLAN
              </Text>
            </View>

            <View style={styles.topBarSpacer} />
          </View>

          {/* Intro */}
          <View style={styles.intro}>
            {/* <View style={styles.introIcon}>
              <Ionicons
                name="layers-outline"
                size={21}
                color={KEPLER_NAVY}
              />
            </View> */}

            <Text style={styles.eyebrow}>
              PROJECT BASELINE
            </Text>

            <Text style={styles.title}>
              How would you like to add plan data?
            </Text>

            <Text style={styles.subtitle}>
              Add a single item manually or generate a starting
              baseline from project files.
            </Text>
          </View>

          {/* Options */}
          <View style={styles.options}>
            {/* Manual */}
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                styles.primaryOptionCard,
                pressed && styles.optionPressed,
              ]}
              onPress={handleManualPress}
              accessibilityRole="button"
              accessibilityLabel="Add plan item manually"
            >
              <View
                style={[
                  styles.optionIcon,
                  styles.manualIcon,
                ]}
              >
                <Ionicons
                  name="add-outline"
                  size={23}
                  color={KEPLER_NAVY}
                />
              </View>

              <View style={styles.optionTextBlock}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>
                    Add manually
                  </Text>

                  <View style={styles.quickBadge}>
                    <Text style={styles.quickBadgeText}>
                      QUICK
                    </Text>
                  </View>
                </View>

                <Text style={styles.optionBody}>
                  Create one plan item with its planned
                  quantity, unit, and target.
                </Text>
              </View>

              <View style={styles.optionChevron}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={KEPLER_NAVY}
                />
              </View>
            </Pressable>

            {/* Generate from files */}
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionPressed,
              ]}
              onPress={handleImportPress}
              accessibilityRole="button"
              accessibilityLabel="Generate plan from files"
            >
              <View
                style={[
                  styles.optionIcon,
                  styles.importIcon,
                ]}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={22}
                  color={KEPLER_NAVY}
                />
              </View>

              <View style={styles.optionTextBlock}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>
                    Generate from files
                  </Text>

                  <View style={styles.aiBadge}>
                    <Text style={styles.aiBadgeText}>
                      AI ASSISTED
                    </Text>
                  </View>
                </View>

                <Text style={styles.optionBody}>
                  Use drawings, PDFs, or photos to prepare
                  plan items for review.
                </Text>

                <View style={styles.fileTypes}>
                  <FileType
                    icon="document-text-outline"
                    label="PDF"
                  />

                  <FileType
                    icon="image-outline"
                    label="Photo"
                  />

                  <FileType
                    icon="construct-outline"
                    label="Drawing"
                  />
                </View>
              </View>

              <View style={styles.optionChevron}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={KEPLER_NAVY}
                />
              </View>
            </Pressable>
          </View>

          {/* Information */}
          <View style={styles.infoRow}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={TEXT_MUTED}
            />

            <Text style={styles.infoText}>
              Generated items remain reviewable before they
              become part of the project baseline.
            </Text>
          </View>

          {/* Cancel */}
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.cancelPressed,
            ]}
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

type FileTypeProps = {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  label: string;
};

function FileType({
  icon,
  label,
}: FileTypeProps) {
  return (
    <View style={styles.fileType}>
      <Ionicons
        name={icon}
        size={13}
        color={TEXT_SECONDARY}
      />

      <Text style={styles.fileTypeText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ---------------------------------------------------------------------- */
  /* Screen                                                                 */
  /* ---------------------------------------------------------------------- */

  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 16,
  },

  /* ---------------------------------------------------------------------- */
  /* Top bar                                                                */
  /* ---------------------------------------------------------------------- */

  topBar: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "rgba(255,255,255,0.72)",

    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.09)",
  },

  closeButtonPressed: {
    opacity: 0.72,
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  topBarCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },

  topBarLabel: {
    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",
    letterSpacing: 1.15,
  },

  topBarSpacer: {
    width: 40,
  },

  /* ---------------------------------------------------------------------- */
  /* Intro                                                                  */
  /* ---------------------------------------------------------------------- */

  intro: {
    paddingTop: 18,
    paddingBottom: 16,
  },

  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "rgba(1,33,105,0.06)",

    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.10)",

    marginBottom: 12,
  },

  eyebrow: {
    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",
    letterSpacing: 1.15,

    marginBottom: 6,
  },

  title: {
    ...typography.title,

    color: TEXT_PRIMARY,

    maxWidth: 335,
  },

  subtitle: {
    ...typography.body,

    color: TEXT_SECONDARY,

    marginTop: 7,

    maxWidth: 340,

    lineHeight: 21,
  },

  /* ---------------------------------------------------------------------- */
  /* Options                                                                */
  /* ---------------------------------------------------------------------- */

  options: {
    gap: 10,
  },

  optionCard: {
    minHeight: 104,

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 15,
    paddingVertical: 14,

    borderRadius: 18,

    backgroundColor: "rgba(255,255,255,0.86)",

    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.09)",

    shadowColor: "#101828",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.045,
    shadowRadius: 12,

    elevation: 2,
  },

  primaryOptionCard: {
    borderColor: "rgba(1,33,105,0.13)",
  },

  optionPressed: {
    opacity: 0.88,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 13,

    borderWidth: StyleSheet.hairlineWidth,
  },

  manualIcon: {
    backgroundColor: "rgba(1,33,105,0.065)",
    borderColor: "rgba(1,33,105,0.10)",
  },

  importIcon: {
    backgroundColor: "rgba(227,24,55,0.045)",
    borderColor: "rgba(227,24,55,0.09)",
  },

  optionTextBlock: {
    flex: 1,
    minWidth: 0,
  },

  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",

    flexWrap: "wrap",

    columnGap: 7,
    rowGap: 4,
  },

  optionTitle: {
    ...typography.bodyMedium,

    color: TEXT_PRIMARY,

    fontWeight: "700",
  },

  optionBody: {
    ...typography.caption,

    color: TEXT_SECONDARY,

    marginTop: 4,

    lineHeight: 17,
  },

  optionChevron: {
    width: 28,
    height: 40,

    alignItems: "flex-end",
    justifyContent: "center",

    marginLeft: 7,
  },

  /* ---------------------------------------------------------------------- */
  /* Quick / AI badges                                                      */
  /* ---------------------------------------------------------------------- */

  quickBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,

    borderRadius: 999,

    backgroundColor: "rgba(1,33,105,0.07)",
  },

  quickBadgeText: {
    ...typography.metadata,

    fontSize: 9,

    color: KEPLER_NAVY,

    fontWeight: "700",

    letterSpacing: 0.75,
  },

  aiBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,

    borderRadius: 999,

    backgroundColor: "rgba(227,24,55,0.065)",
  },

  aiBadgeText: {
    ...typography.metadata,

    fontSize: 9,

    color: KEPLER_RED,

    fontWeight: "700",

    letterSpacing: 0.6,
  },

  /* ---------------------------------------------------------------------- */
  /* File types                                                             */
  /* ---------------------------------------------------------------------- */

  fileTypes: {
    flexDirection: "row",
    alignItems: "center",

    flexWrap: "wrap",

    gap: 5,

    marginTop: 8,
  },

  fileType: {
    minHeight: 24,

    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    paddingHorizontal: 7,

    borderRadius: 999,

    backgroundColor: "rgba(248,250,252,0.90)",

    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(102,112,133,0.12)",
  },

  fileTypeText: {
    ...typography.metadata,

    color: TEXT_SECONDARY,

    fontSize: 10,

    fontWeight: "600",
  },

  /* ---------------------------------------------------------------------- */
  /* Information                                                            */
  /* ---------------------------------------------------------------------- */

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",

    gap: 7,

    paddingHorizontal: 4,

    marginTop: 12,
  },

  infoText: {
    ...typography.caption,

    flex: 1,

    color: TEXT_MUTED,

    lineHeight: 17,
  },

  /* ---------------------------------------------------------------------- */
  /* Cancel                                                                 */
  /* ---------------------------------------------------------------------- */

  cancelButton: {
    minHeight: 42,

    marginTop: 8,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 14,
  },

  cancelPressed: {
    opacity: 0.62,
  },

  cancelText: {
    ...typography.button,

    color: TEXT_SECONDARY,

    fontWeight: "600",
  },
});