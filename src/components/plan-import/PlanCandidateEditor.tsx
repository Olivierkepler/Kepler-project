import React, {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  colors,
  typography,
} from "../../theme/colors";

import type {
  PatchRemotePlanImportCandidateInput,
  RemotePlanImportCandidate,
  RemotePlanImportCandidateType,
} from "../../services/api/planImports";

import {
  formatCandidateType,
} from "../../utils/planImportReview";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

const TYPE_OPTIONS: readonly RemotePlanImportCandidateType[] = [
  "length",
  "count",
  "area",
  "volume",
  "other",
];

const SCREEN_BACKGROUND = require("../../../assets/bgproject.png");

const KEPLER_NAVY = "#012169";
const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";

type Props = {
  visible: boolean;

  candidate:
    | RemotePlanImportCandidate
    | null;

  saving: boolean;

  removing?: boolean;

  onClose: () => void;

  onSave: (
    patch: PatchRemotePlanImportCandidateInput,
  ) => void;

  onRemove?: () => void;
};

/* -------------------------------------------------------------------------- */
/*                           Plan Candidate Editor                            */
/* -------------------------------------------------------------------------- */

export default function PlanCandidateEditor({
  visible,
  candidate,
  saving,
  removing = false,
  onClose,
  onSave,
  onRemove,
}: Props) {
  const insets =
    useSafeAreaInsets();

  const busy = saving || removing;

  const [label, setLabel] =
    useState("");

  const [type, setType] =
    useState<RemotePlanImportCandidateType>(
      "other",
    );

  const [
    plannedValueText,
    setPlannedValueText,
  ] = useState("");

  const [unit, setUnit] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (
      !visible ||
      !candidate
    ) {
      return;
    }

    setLabel(
      candidate.label,
    );

    setType(
      candidate.type,
    );

    setPlannedValueText(
      candidate.plannedValue ==
        null
        ? ""
        : String(
            candidate.plannedValue,
          ),
    );

    setUnit(
      candidate.unit ?? "",
    );

    setDescription(
      candidate.description ??
        "",
    );

    setError(null);
  }, [
    visible,
    candidate,
  ]);

  const handleSave = () => {
    if (!candidate) {
      return;
    }

    const trimmedLabel =
      label.trim();

    if (!trimmedLabel) {
      setError(
        "Label is required.",
      );

      return;
    }

    const trimmedUnit =
      unit.trim();

    const trimmedDescription =
      description.trim();

    const plannedRaw =
      plannedValueText.trim();

    let plannedValue:
      | number
      | null
      | undefined = undefined;

    if (plannedRaw === "") {
      plannedValue = null;
    } else {
      const parsed =
        Number(plannedRaw);

      if (
        !Number.isFinite(
          parsed,
        ) ||
        parsed < 0
      ) {
        setError(
          "Planned value must be a number ≥ 0.",
        );

        return;
      }

      plannedValue =
        parsed;
    }

    const patch: PatchRemotePlanImportCandidateInput =
      {
        label:
          trimmedLabel,

        type,

        plannedValue,

        unit: trimmedUnit
          ? trimmedUnit
          : null,

        description:
          trimmedDescription
            ? trimmedDescription
            : null,

        expectedUpdatedAt:
          candidate.updatedAt,
      };

    setError(null);
    onSave(patch);
  };

  const handleRemovePress = () => {
    if (!candidate || !onRemove || busy) {
      return;
    }

    Alert.alert(
      "Remove suggestion?",
      `"${candidate.label}" will be removed from this generated plan.\n\nThis action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            onRemove();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={
        onClose
      }
    >
      <ImageBackground
        source={SCREEN_BACKGROUND}
        style={styles.background}
        resizeMode="cover"
      >
        <View
          style={[
            styles.safe,
            {
              paddingTop:
                Math.max(
                  insets.top,
                  10,
                ),

              paddingBottom:
                Math.max(
                  insets.bottom,
                  12,
                ),
            },
          ]}
        >
          {/* ------------------------------------------------------------ */}
          {/* Header                                                       */}
          {/* ------------------------------------------------------------ */}

          <View
            style={
              styles.topBar
            }
          >
            <Pressable
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerAction,
                pressed &&
                  styles.headerActionPressed,
              ]}
            >
              <Text
                style={
                  styles.cancelText
                }
              >
                Cancel
              </Text>
            </Pressable>

            <Text
              style={
                styles.topTitle
              }
            >
              Edit suggestion
            </Text>

            <Pressable
              onPress={
                handleSave
              }
              disabled={
                busy ||
                !candidate
              }
              accessibilityRole="button"
              accessibilityLabel="Save suggestion"
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerAction,
                styles.headerActionRight,
                pressed &&
                  !busy &&
                  styles.headerActionPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color={
                    KEPLER_NAVY
                  }
                />
              ) : (
                <Text
                  style={
                    styles.saveText
                  }
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Content                                                      */}
          {/* ------------------------------------------------------------ */}

          <ScrollView
            style={
              styles.scroll
            }
            contentContainerStyle={
              styles.content
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={
              false
            }
          >
            {/* ---------------------------------------------------------- */}
            {/* Compact intro                                              */}
            {/* ---------------------------------------------------------- */}

            <View
              style={
                styles.intro
              }
            >
              <Text
                style={
                  styles.infoEyebrow
                }
              >
                AI SUGGESTION
              </Text>

              <Text
                style={
                  styles.hint
                }
              >
                Edit before adding to Plan.
              </Text>

              <Text
                style={
                  styles.hintSecondary
                }
              >
                Changes remain with this import until approval.
              </Text>
            </View>

            {/* ---------------------------------------------------------- */}
            {/* Details                                                    */}
            {/* ---------------------------------------------------------- */}

            <SectionLabel text="DETAILS" first />

            <FieldLabel
              text="Label"
            />

            <TextInput
              style={
                styles.input
              }
              value={label}
              onChangeText={
                setLabel
              }
              placeholder="Suggestion label"
              placeholderTextColor={
                TEXT_MUTED
              }
              editable={!busy}
              accessibilityLabel="Suggestion label"
              selectionColor={
                KEPLER_NAVY
              }
            />

            {/* ---------------------------------------------------------- */}
            {/* Type                                                       */}
            {/* ---------------------------------------------------------- */}

            <SectionLabel text="TYPE" />

            <View
              style={
                styles.typeRow
              }
            >
              {TYPE_OPTIONS.map(
                (option) => {
                  const active =
                    type === option;

                  return (
                    <Pressable
                      key={option}
                      style={({
                        pressed,
                      }) => [
                        styles.typeChip,

                        active &&
                          styles.typeChipActive,

                        pressed &&
                          styles.typeChipPressed,
                      ]}
                      onPress={() =>
                        setType(
                          option,
                        )
                      }
                      disabled={
                        busy
                      }
                      accessibilityRole="button"
                      accessibilityState={{
                        selected:
                          active,
                      }}
                      accessibilityLabel={`Type ${formatCandidateType(
                        option,
                      )}`}
                    >
                      <Text
                        style={[
                          styles.typeChipText,

                          active &&
                            styles.typeChipTextActive,
                        ]}
                      >
                        {formatCandidateType(
                          option,
                        )}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>

            {/* ---------------------------------------------------------- */}
            {/* Quantity                                                   */}
            {/* ---------------------------------------------------------- */}

            <SectionLabel text="QUANTITY" />

            <View
              style={
                styles.twoColumnRow
              }
            >
              <View
                style={
                  styles.fieldColumnLarge
                }
              >
                <FieldLabel
                  text="Planned value"
                  compact
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    plannedValueText
                  }
                  onChangeText={
                    setPlannedValueText
                  }
                  placeholder="120"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  keyboardType="decimal-pad"
                  editable={!busy}
                  accessibilityLabel="Planned value"
                  selectionColor={
                    KEPLER_NAVY
                  }
                />
              </View>

              <View
                style={
                  styles.fieldColumnSmall
                }
              >
                <FieldLabel
                  text="Unit"
                  compact
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={unit}
                  onChangeText={
                    setUnit
                  }
                  placeholder="ft"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={!busy}
                  accessibilityLabel="Unit"
                  autoCapitalize="none"
                  selectionColor={
                    KEPLER_NAVY
                  }
                />
              </View>
            </View>

            {/* ---------------------------------------------------------- */}
            {/* Description                                                */}
            {/* ---------------------------------------------------------- */}

            <SectionLabel text="DESCRIPTION" />

            <TextInput
              style={[
                styles.input,
                styles.textArea,
              ]}
              value={
                description
              }
              onChangeText={
                setDescription
              }
              placeholder="Optional notes about this suggestion"
              placeholderTextColor={
                TEXT_MUTED
              }
              multiline
              textAlignVertical="top"
              editable={!busy}
              accessibilityLabel="Description"
              selectionColor={
                KEPLER_NAVY
              }
            />

            {/* ---------------------------------------------------------- */}
            {/* Error                                                      */}
            {/* ---------------------------------------------------------- */}

            {error ? (
              <View
                style={
                  styles.errorCard
                }
              >
                <Text
                  style={
                    styles.error
                  }
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {onRemove ? (
              <View style={styles.removeSection}>
                <View style={styles.removeSeparator} />

                <Pressable
                  onPress={handleRemovePress}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Remove suggestion"
                  accessibilityState={{
                    disabled: busy,
                    busy: removing,
                  }}
                  style={({ pressed }) => [
                    styles.removeButton,
                    pressed && !busy && styles.removeButtonPressed,
                    busy && styles.removeButtonDisabled,
                  ]}
                >
                  {removing ? (
                    <View style={styles.removeBusyRow}>
                      <ActivityIndicator
                        size="small"
                        color={colors.danger}
                      />
                      <Text style={styles.removeBusyText}>
                        Removing…
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.removeText}>
                      Remove suggestion
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </ImageBackground>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Section / Field                               */
/* -------------------------------------------------------------------------- */

function SectionLabel({
  text,
  first,
}: {
  text: string;
  first?: boolean;
}) {
  return (
    <Text
      style={[
        styles.sectionLabel,
        first ? styles.sectionLabelFirst : null,
      ]}
    >
      {text}
    </Text>
  );
}

function FieldLabel({
  text,
  compact,
}: {
  text: string;
  compact?: boolean;
}) {
  return (
    <Text
      style={[
        styles.fieldLabel,
        compact ? styles.fieldLabelCompact : null,
      ]}
    >
      {text}
    </Text>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    background: {
      flex: 1,
      width: "100%",
      height: "100%",
    },

    safe: {
      flex: 1,
      backgroundColor: "transparent",
    },

    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    topBar: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(1,33,105,0.10)",
      backgroundColor: "rgba(255,255,255,0.78)",
    },

    headerAction: {
      minWidth: 62,
      minHeight: 40,
      alignItems: "flex-start",
      justifyContent: "center",
    },

    headerActionRight: {
      alignItems: "flex-end",
    },

    headerActionPressed: {
      opacity: 0.55,
    },

    cancelText: {
      ...typography.button,
      color: TEXT_SECONDARY,
    },

    topTitle: {
      ...typography.bodyMedium,
      color: TEXT_PRIMARY,
      fontSize: 17,
      fontWeight: "600",
      letterSpacing: -0.2,
    },

    saveText: {
      ...typography.button,
      color: KEPLER_NAVY,
      fontWeight: "700",
      textAlign: "right",
    },

    /* ---------------------------------------------------------------------- */
    /* Scroll                                                                 */
    /* ---------------------------------------------------------------------- */

    scroll: {
      flex: 1,
      backgroundColor: "transparent",
    },

    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 40,
    },

    /* ---------------------------------------------------------------------- */
    /* Intro                                                                  */
    /* ---------------------------------------------------------------------- */

    intro: {
      marginBottom: 4,
      paddingVertical: 10,
      paddingHorizontal: 2,
    },

    infoEyebrow: {
      ...typography.metadata,
      marginBottom: 6,
      color: KEPLER_NAVY,
      fontWeight: "700",
      letterSpacing: 1.1,
      fontSize: 11,
    },

    hint: {
      ...typography.bodyMedium,
      color: TEXT_PRIMARY,
      lineHeight: 20,
      fontWeight: "600",
    },

    hintSecondary: {
      ...typography.caption,
      color: TEXT_SECONDARY,
      marginTop: 4,
      lineHeight: 18,
    },

    /* ---------------------------------------------------------------------- */
    /* Labels                                                                 */
    /* ---------------------------------------------------------------------- */

    sectionLabel: {
      ...typography.metadata,
      color: KEPLER_NAVY,
      fontWeight: "700",
      letterSpacing: 1.0,
      fontSize: 11,
      marginTop: 20,
      marginBottom: 8,
      opacity: 0.9,
    },

    sectionLabelFirst: {
      marginTop: 18,
    },

    fieldLabel: {
      ...typography.caption,
      color: TEXT_SECONDARY,
      marginBottom: 7,
      fontWeight: "600",
    },

    fieldLabelCompact: {
      marginTop: 0,
    },

    /* ---------------------------------------------------------------------- */
    /* Inputs                                                                 */
    /* ---------------------------------------------------------------------- */

    input: {
      ...typography.body,
      minHeight: 50,
      color: TEXT_PRIMARY,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(1,33,105,0.10)",
      borderRadius: 15,
      paddingHorizontal: 15,
      paddingVertical: 12,
      backgroundColor: "rgba(255,255,255,0.84)",
    },

    textArea: {
      minHeight: 104,
      paddingTop: 13,
    },

    /* ---------------------------------------------------------------------- */
    /* Quantity / Unit                                                        */
    /* ---------------------------------------------------------------------- */

    twoColumnRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 11,
    },

    fieldColumnLarge: {
      flex: 1.85,
    },

    fieldColumnSmall: {
      flex: 1,
    },

    /* ---------------------------------------------------------------------- */
    /* Type Chips                                                             */
    /* ---------------------------------------------------------------------- */

    typeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 2,
    },

    typeChip: {
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(1,33,105,0.12)",
      backgroundColor: "rgba(255,255,255,0.72)",
      alignItems: "center",
      justifyContent: "center",
    },

    typeChipActive: {
      backgroundColor: "rgba(1,33,105,0.08)",
      borderColor: "rgba(1,33,105,0.28)",
    },

    typeChipPressed: {
      opacity: 0.64,
    },

    typeChipText: {
      ...typography.button,
      color: TEXT_SECONDARY,
      fontSize: 13,
    },

    typeChipTextActive: {
      color: KEPLER_NAVY,
      fontWeight: "700",
    },

    /* ---------------------------------------------------------------------- */
    /* Error                                                                  */
    /* ---------------------------------------------------------------------- */

    errorCard: {
      marginTop: 14,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: "rgba(239,68,68,0.07)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(239,68,68,0.20)",
    },

    error: {
      ...typography.body,
      color: colors.danger,
      lineHeight: 19,
    },

    /* ---------------------------------------------------------------------- */
    /* Remove                                                                 */
    /* ---------------------------------------------------------------------- */

    removeSection: {
      marginTop: 28,
      paddingBottom: 8,
    },

    removeSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: "rgba(1,33,105,0.10)",
      marginBottom: 22,
    },

    removeButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
    },

    removeButtonPressed: {
      opacity: 0.65,
    },

    removeButtonDisabled: {
      opacity: 0.45,
    },

    removeText: {
      ...typography.button,
      color: colors.danger,
      fontWeight: "600",
    },

    removeBusyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    removeBusyText: {
      ...typography.button,
      color: colors.danger,
      fontWeight: "600",
    },
  });
