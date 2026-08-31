import React, {
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import type {
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

import Ionicons from "@expo/vector-icons/Ionicons";

import {
  useAuth,
} from "../auth/AuthProvider";

import type {
  RootStackParamList,
} from "../navigation/types";

import {
  ensureRemotePlanItem,
} from "../services/sync/planItemBootstrap";

import {
  createPlanItem,
} from "../store/planItems";

import {
  typography,
} from "../theme/colors";

import type {
  PlanItemType,
} from "../types/plan";

import {
  PLAN_ITEM_CREATE_TYPES,
  defaultUnitForPlanItemType,
  isCurrentlyMeasurablePlanItemType,
  resolvePlanItemCreateFormNumerics,
  validatePlanItemCreateInput,
} from "../utils/domain/planItemCreate";

type Props =
  NativeStackScreenProps<
    RootStackParamList,
    "AddPlanItem"
  >;

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";

const BORDER =
  "rgba(1,33,105,0.10)";

const FIELD_BACKGROUND =
  "rgba(255,255,255,0.86)";

const SCREEN_BACKGROUND =
  require("../../assets/bgproject.png");

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function parseRequiredPositiveNumber(
  raw: string,
): number | null {
  const trimmed =
    raw.trim();

  if (!trimmed) {
    return null;
  }

  const value =
    Number(trimmed);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

function typeLabel(
  type: PlanItemType,
): string {
  switch (type) {
    case "length":
      return "Length";

    case "area":
      return "Area";

    case "count":
      return "Count";

    case "volume":
      return "Volume";

    default:
      return String(type);
  }
}

function typeIcon(
  type: PlanItemType,
): React.ComponentProps<
  typeof Ionicons
>["name"] {
  switch (type) {
    case "length":
      return "resize-outline";

    case "area":
      return "scan-outline";

    case "count":
      return "apps-outline";

    case "volume":
      return "cube-outline";

    default:
      return "cube-outline";
  }
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function AddPlanItemScreen({
  route,
  navigation,
}: Props) {
  const { user } =
    useAuth();

  const {
    projectId,
  } = route.params;

  const [
    type,
    setType,
  ] =
    useState<PlanItemType>(
      "length",
    );

  const [
    label,
    setLabel,
  ] =
    useState("");

  const [
    plannedValueText,
    setPlannedValueText,
  ] =
    useState("");

  const [
    unitCostText,
    setUnitCostText,
  ] =
    useState("");

  const [
    productionRateText,
    setProductionRateText,
  ] =
    useState("");

  const [
    laborHoursText,
    setLaborHoursText,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const unit =
    useMemo(
      () =>
        defaultUnitForPlanItemType(
          type,
        ),
      [
        type,
      ],
    );

  const measurementSupported =
    isCurrentlyMeasurablePlanItemType(
      type,
      unit,
    );

  /* ------------------------------------------------------------------------ */
  /* Save                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleSave =
    async () => {
      if (
        !user?.uid ||
        saving
      ) {
        return;
      }

      const trimmedLabel =
        label.trim();

      const plannedValue =
        parseRequiredPositiveNumber(
          plannedValueText,
        );

      const numerics =
        resolvePlanItemCreateFormNumerics(
          {
            unitCostText,
            productionRateText,
            laborHoursText,
          },
        );

      if (!trimmedLabel) {
        setError(
          "Label is required.",
        );

        return;
      }

      if (
        plannedValue ===
        null
      ) {
        setError(
          "Planned quantity must be a number greater than 0.",
        );

        return;
      }

      if (!numerics.ok) {
        setError(
          numerics.error,
        );

        return;
      }

      const validated =
        validatePlanItemCreateInput(
          {
            projectId,

            type,

            label:
              trimmedLabel,

            plannedValue,

            unit,

            unitCost:
              numerics.unitCost,

            productionRatePerDay:
              numerics.productionRatePerDay,

            laborHoursPerUnit:
              numerics.laborHoursPerUnit,
          },
        );

      if (!validated.ok) {
        setError(
          validated.error,
        );

        return;
      }

      setError(null);

      setSaving(true);

      try {
        const ownerUid =
          user.uid;

        const created =
          await createPlanItem(
            ownerUid,
            validated.value,
          );

        /**
         * Local create already succeeded.
         * Cloud bootstrap remains best-effort.
         */
        const remotePlanItemId =
          await ensureRemotePlanItem(
            ownerUid,
            projectId,
            created.id,
          );

        if (
          !remotePlanItemId
        ) {
          Alert.alert(
            "Saved on this device",
            "Cloud sync is pending. The plan item is available locally.",
          );
        }

        navigation.goBack();
      } catch (
        saveError
      ) {
        const message =
          saveError
            instanceof Error
            ? saveError.message
            : "Unable to create plan item.";

        setError(
          message,
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
        "bottom",
      ]}
    >
      <ImageBackground
        source={
          SCREEN_BACKGROUND
        }
        style={
          styles.background
        }
        resizeMode="cover"
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
            style={({
              pressed,
            }) => [
              styles.backButton,

              pressed &&
                styles.backButtonPressed,
            ]}
            onPress={() =>
              navigation.goBack()
            }
            disabled={
              saving
            }
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={
              8
            }
          >
            <Ionicons
              name="chevron-back"
              size={
                24
              }
              color={
                KEPLER_NAVY
              }
            />
          </Pressable>

          <Text
            style={
              styles.topBarTitle
            }
          >
            Add Plan Item
          </Text>

          <View
            style={
              styles.topBarSpacer
            }
          />
        </View>

        <ScrollView
          style={
            styles.container
          }
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS ===
            "ios"
              ? "interactive"
              : "on-drag"
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* -------------------------------------------------------------- */}
          {/* Plan details                                                   */}
          {/* -------------------------------------------------------------- */}

          <View
            style={
              styles.formSection
            }
          >
            {/* Kepler accent */}

            <View
              pointerEvents="none"
              style={
                styles.sectionTopAccent
              }
            >
              <View
                style={
                  styles.sectionTopAccentBlue
                }
              />

              <View
                style={
                  styles.sectionTopAccentRed
                }
              />
            </View>

            <View
              style={
                styles.sectionHeadingRow
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Plan details
              </Text>

              <Text
                style={
                  styles.requiredHint
                }
              >
                REQUIRED
              </Text>
            </View>

            {/* Label */}

            <View
              style={
                styles.fieldGroup
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                LABEL
              </Text>

              <View
                style={
                  styles.inputShell
                }
              >
                <Ionicons
                  name="document-text-outline"
                  size={
                    18
                  }
                  color={
                    TEXT_MUTED
                  }
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    label
                  }
                  onChangeText={
                    setLabel
                  }
                  placeholder="e.g. North corridor conduit"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving
                  }
                  returnKeyType="next"
                  accessibilityLabel="Plan item label"
                />
              </View>
            </View>

            {/* Type */}

            <View
              style={
                styles.fieldGroup
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                TYPE
              </Text>

              <View
                style={
                  styles.typeRow
                }
              >
                {PLAN_ITEM_CREATE_TYPES.map(
                  (
                    option,
                  ) => {
                    const selected =
                      option ===
                      type;

                    return (
                      <Pressable
                        key={
                          option
                        }
                        style={[
                          styles.typeChip,

                          selected &&
                            styles.typeChipSelected,
                        ]}
                        onPress={() =>
                          setType(
                            option,
                          )
                        }
                        disabled={
                          saving
                        }
                        accessibilityRole="button"
                        accessibilityState={{
                          selected,
                        }}
                        accessibilityLabel={`Select type ${option}`}
                      >
                        <Ionicons
                          name={
                            typeIcon(
                              option,
                            )
                          }
                          size={
                            16
                          }
                          color={
                            selected
                              ? "#FFFFFF"
                              : KEPLER_NAVY
                          }
                        />

                        <Text
                          style={[
                            styles.typeChipText,

                            selected &&
                              styles.typeChipTextSelected,
                          ]}
                        >
                          {
                            typeLabel(
                              option,
                            )
                          }
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>

            {/* Planned quantity */}

            <View
              style={
                styles.fieldGroup
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                PLANNED QUANTITY
              </Text>

              <View
                style={
                  styles.quantityRow
                }
              >
                <View
                  style={[
                    styles.inputShell,
                    styles.quantityInputShell,
                  ]}
                >
                  <Ionicons
                    name="calculator-outline"
                    size={
                      18
                    }
                    color={
                      TEXT_MUTED
                    }
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
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={
                      TEXT_MUTED
                    }
                    editable={
                      !saving
                    }
                    accessibilityLabel="Planned quantity"
                  />
                </View>

                <View
                  style={
                    styles.unitBox
                  }
                  accessibilityLabel={`Unit ${unit}`}
                >
                  <Text
                    style={
                      styles.unitLabel
                    }
                  >
                    UNIT
                  </Text>

                  <Text
                    style={
                      styles.unitValue
                    }
                  >
                    {
                      unit
                    }
                  </Text>
                </View>
              </View>
            </View>

            {/* Production rate */}

            <View
              style={[
                styles.fieldGroup,
                styles.lastFieldGroup,
              ]}
            >
              <View
                style={
                  styles.labelRow
                }
              >
                <Text
                  style={
                    styles.label
                  }
                >
                  PRODUCTION RATE / DAY
                </Text>

                <Text
                  style={
                    styles.fieldHelper
                  }
                >
                  OPTIONAL
                </Text>
              </View>

              <View
                style={
                  styles.inputShell
                }
              >
                <Ionicons
                  name="speedometer-outline"
                  size={
                    18
                  }
                  color={
                    TEXT_MUTED
                  }
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    productionRateText
                  }
                  onChangeText={
                    setProductionRateText
                  }
                  keyboardType="decimal-pad"
                  placeholder="e.g. 30"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving
                  }
                  accessibilityLabel="Production rate per day"
                />
              </View>
            </View>
          </View>

          {/* -------------------------------------------------------------- */}
          {/* Estimating                                                     */}
          {/* -------------------------------------------------------------- */}

          <View
            style={
              styles.optionalSection
            }
          >
            {/* Kepler accent */}

            <View
              pointerEvents="none"
              style={
                styles.sectionTopAccent
              }
            >
              <View
                style={
                  styles.sectionTopAccentBlue
                }
              />

              <View
                style={
                  styles.sectionTopAccentRed
                }
              />
            </View>

            <View
              style={
                styles.optionalHeader
              }
            >
              <View
                style={
                  styles.optionalHeaderText
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Estimating
                </Text>
              </View>

              <View
                style={
                  styles.optionalBadge
                }
              >
                <Text
                  style={
                    styles.optionalBadgeText
                  }
                >
                  OPTIONAL
                </Text>
              </View>
            </View>

            {/* Unit cost */}

            <View
              style={
                styles.fieldGroup
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                UNIT COST
              </Text>

              <View
                style={
                  styles.inputShell
                }
              >
                <Ionicons
                  name="cash-outline"
                  size={
                    18
                  }
                  color={
                    TEXT_MUTED
                  }
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    unitCostText
                  }
                  onChangeText={
                    setUnitCostText
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving
                  }
                  accessibilityLabel="Unit cost"
                />
              </View>
            </View>

            {/* Labor */}

            <View
              style={[
                styles.fieldGroup,
                styles.lastFieldGroup,
              ]}
            >
              <Text
                style={
                  styles.label
                }
              >
                LABOR HOURS / UNIT
              </Text>

              <View
                style={
                  styles.inputShell
                }
              >
                <Ionicons
                  name="time-outline"
                  size={
                    18
                  }
                  color={
                    TEXT_MUTED
                  }
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    laborHoursText
                  }
                  onChangeText={
                    setLaborHoursText
                  }
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving
                  }
                  accessibilityLabel="Labor hours per unit"
                />
              </View>
            </View>
          </View>

          {/* -------------------------------------------------------------- */}
          {/* Measurement compatibility                                     */}
          {/* -------------------------------------------------------------- */}

          {!measurementSupported ? (
            <View
              style={
                styles.noteCard
              }
            >
              <View
                style={
                  styles.noteIcon
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={
                    18
                  }
                  color={
                    KEPLER_NAVY
                  }
                />
              </View>

              <View
                style={
                  styles.noteContent
                }
              >
                <Text
                  style={
                    styles.noteTitle
                  }
                >
                  Field capture availability
                </Text>

                <Text
                  style={
                    styles.noteBody
                  }
                >
                  You can create this plan item now. Field measurement currently
                  supports length items in feet only.
                </Text>
              </View>
            </View>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Error                                                          */}
          {/* -------------------------------------------------------------- */}

          {error ? (
            <View
              style={
                styles.errorBanner
              }
              accessibilityRole="alert"
            >
              <Ionicons
                name="alert-circle-outline"
                size={
                  17
                }
                color={
                  KEPLER_RED
                }
              />

              <Text
                style={
                  styles.errorText
                }
              >
                {
                  error
                }
              </Text>
            </View>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Save                                                           */}
          {/* -------------------------------------------------------------- */}

          <Pressable
            style={({
              pressed,
            }) => [
              styles.saveButton,

              pressed &&
                !saving &&
                styles.saveButtonPressed,

              saving &&
                styles.saveButtonDisabled,
            ]}
            onPress={() => {
              void handleSave();
            }}
            disabled={
              saving
            }
            accessibilityRole="button"
            accessibilityLabel="Save plan item"
            accessibilityState={{
              disabled:
                saving,

              busy:
                saving,
            }}
          >
            {saving ? (
              <View
                style={
                  styles.savingContent
                }
              >
                <ActivityIndicator
                  color="#FFFFFF"
                  size="small"
                />

                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Saving…
                </Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name="checkmark"
                  size={
                    19
                  }
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Save Plan Item
                </Text>
              </>
            )}
          </Pressable>

          <Text
            style={
              styles.saveHint
            }
          >
            Saved locally first and synchronized when cloud access is available.
          </Text>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Screen                                                                 */
    /* ---------------------------------------------------------------------- */

    safeArea: {
      flex: 1,

      backgroundColor:
        "#F8FAFC",
    },

    background: {
      flex: 1,

      width: "100%",

      height: "100%",
    },

    container: {
      flex: 1,
    },

    content: {
      paddingHorizontal:
        18,

      paddingTop:
        6,

      paddingBottom:
        40,
    },

    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    topBar: {
      minHeight:
        56,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      paddingHorizontal:
        18,
    },

    backButton: {
      width:
        40,

      height:
        40,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    backButtonPressed: {
      opacity:
        0.72,
    },

    topBarTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    topBarSpacer: {
      width:
        40,
    },

    /* ---------------------------------------------------------------------- */
    /* Plan Details                                                           */
    /* ---------------------------------------------------------------------- */

    formSection: {
      marginTop:
        0,

      paddingHorizontal:
        16,

      paddingTop:
        17,

      paddingBottom:
        4,

      backgroundColor:
        "rgba(255,255,255,0.80)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",

    

      overflow:
        "hidden",

      position:
        "relative",
    },

    /* ---------------------------------------------------------------------- */
    /* Estimating                                                             */
    /* ---------------------------------------------------------------------- */

    optionalSection: {
      marginTop:
        14,

      paddingHorizontal:
        16,

      paddingTop:
        17,

      paddingBottom:
        4,

      backgroundColor:
        "rgba(255,255,255,0.62)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.07)",


      overflow:
        "hidden",

      position:
        "relative",
    },

    /* ---------------------------------------------------------------------- */
    /* Shared Kepler Top Accent                                               */
    /* ---------------------------------------------------------------------- */

    sectionTopAccent: {
      position:
        "absolute",

      top:
        0,

      left:
        0,

      right:
        0,

      height:
        2,

      flexDirection:
        "row",

      zIndex:
        2,
    },

    sectionTopAccentBlue: {
      flex:
        1,

      backgroundColor:
        KEPLER_NAVY,
    },

    sectionTopAccentRed: {
      width:
        34,

      backgroundColor:
        KEPLER_RED,
    },

    /* ---------------------------------------------------------------------- */
    /* Section Headers                                                        */
    /* ---------------------------------------------------------------------- */

    sectionHeadingRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      marginBottom:
        15,
    },

    sectionTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    sectionDescription: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      marginTop:
        3,
    },

    requiredHint: {
      ...typography.metadata,

      color:
        TEXT_MUTED,

      fontSize:
        9,

      fontWeight:
        "700",

      letterSpacing:
        0.9,
    },

    optionalHeader: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      justifyContent:
        "space-between",

      gap:
        12,

      marginBottom:
        15,
    },

    optionalHeaderText: {
      flex:
        1,

      minWidth:
        0,
    },

    optionalBadge: {
      paddingHorizontal:
        8,

      paddingVertical:
        4,

      borderRadius:
        999,

      backgroundColor:
        "rgba(1,33,105,0.06)",

      flexShrink:
        0,
    },

    optionalBadgeText: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontSize:
        9,

      fontWeight:
        "700",

      letterSpacing:
        0.8,
    },

    /* ---------------------------------------------------------------------- */
    /* Fields                                                                 */
    /* ---------------------------------------------------------------------- */

    fieldGroup: {
      marginBottom:
        15,
    },

    lastFieldGroup: {
      marginBottom:
        11,
    },

    labelRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",
    },

    label: {
      ...typography.metadata,

      color:
        "#475467",

      fontWeight:
        "700",

      letterSpacing:
        0.6,

      marginBottom:
        7,
    },

    fieldHelper: {
      ...typography.metadata,

      color:
        TEXT_MUTED,

      fontSize:
        9,

      fontWeight:
        "600",

      marginBottom:
        7,
    },

    inputShell: {
      minHeight:
        50,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        10,

      paddingHorizontal:
        14,

      backgroundColor:
        FIELD_BACKGROUND,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        BORDER,

      borderRadius:
        13,
    },

    input: {
      ...typography.body,

      flex:
        1,

      minWidth:
        0,

      color:
        TEXT_PRIMARY,

      paddingVertical:
        13,

      fontWeight:
        "500",
    },

    /* ---------------------------------------------------------------------- */
    /* Type                                                                   */
    /* ---------------------------------------------------------------------- */

    typeRow: {
      flexDirection:
        "row",

      flexWrap:
        "wrap",

      gap:
        8,
    },

    typeChip: {
      minHeight:
        38,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        6,

      paddingHorizontal:
        6,

      borderRadius:
        999,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.11)",

      backgroundColor:
        "rgba(255,255,255,0.72)",
    },

    typeChipSelected: {
      backgroundColor:
        KEPLER_NAVY,

      borderColor:
        KEPLER_NAVY,
    },

    typeChipText: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight:
        "600",
    },

    typeChipTextSelected: {
      color:
        "#FFFFFF",

      fontWeight:
        "700",
    },

    /* ---------------------------------------------------------------------- */
    /* Quantity / Unit                                                        */
    /* ---------------------------------------------------------------------- */

    quantityRow: {
      flexDirection:
        "row",

      alignItems:
        "stretch",

      gap:
        10,
    },

    quantityInputShell: {
      flex:
        1,

      minWidth:
        0,
    },

    unitBox: {
      width:
        86,

      minHeight:
        50,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1,33,105,0.055)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.10)",

      borderRadius:
        13,
    },

    unitLabel: {
      ...typography.metadata,

      color:
        TEXT_MUTED,

      fontSize:
        9,

      fontWeight:
        "700",

      letterSpacing:
        0.7,
    },

    unitValue: {
      ...typography.bodyMedium,

      color:
        KEPLER_NAVY,

      marginTop:
        1,

      fontWeight:
        "700",
    },

    /* ---------------------------------------------------------------------- */
    /* Field Capture Note                                                     */
    /* ---------------------------------------------------------------------- */

    noteCard: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        10,

      marginTop:
        14,

      paddingHorizontal:
        14,

      paddingVertical:
        13,

      backgroundColor:
        "rgba(1,33,105,0.045)",

      borderLeftWidth:
        2,

      borderLeftColor:
        KEPLER_NAVY,
    },

    noteIcon: {
      width:
        28,

      height:
        28,

      alignItems:
        "center",

      justifyContent:
        "center",

      flexShrink:
        0,
    },

    noteContent: {
      flex:
        1,

      minWidth:
        0,
    },

    noteTitle: {
      ...typography.caption,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    noteBody: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      marginTop:
        3,

      lineHeight:
        17,
    },

    /* ---------------------------------------------------------------------- */
    /* Error                                                                  */
    /* ---------------------------------------------------------------------- */

    errorBanner: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        8,

      marginTop:
        14,

      paddingHorizontal:
        13,

      paddingVertical:
        11,

      backgroundColor:
        "rgba(227,24,55,0.055)",

      borderLeftWidth:
        2,

      borderLeftColor:
        KEPLER_RED,
    },

    errorText: {
      ...typography.caption,

      flex:
        1,

      color:
        "#B42318",

      fontWeight:
        "600",

      lineHeight:
        17,
    },

    /* ---------------------------------------------------------------------- */
    /* Save                                                                   */
    /* ---------------------------------------------------------------------- */

    saveButton: {
      minHeight:
        52,

      marginTop:
        18,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        8,

      borderRadius:
        14,

      backgroundColor:
        KEPLER_NAVY,

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width:
          0,

        height:
          7,
      },

      shadowOpacity:
        0.18,

      shadowRadius:
        14,

      elevation:
        4,
    },

    saveButtonPressed: {
      opacity:
        0.9,

      transform: [
        {
          scale:
            0.99,
        },
      ],
    },

    saveButtonDisabled: {
      opacity:
        0.62,
    },

    saveButtonText: {
      ...typography.bodyMedium,

      color:
        "#FFFFFF",

      fontWeight:
        "700",
    },

    savingContent: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        9,
    },

    saveHint: {
      ...typography.metadata,

      color:
        TEXT_MUTED,

      textAlign:
        "center",

      marginTop:
        9,

      paddingHorizontal:
        20,

      lineHeight:
        15,
    },
  });