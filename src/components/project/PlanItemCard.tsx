import React from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import type {
  Delta,
} from "../../types/delta";

import type {
  Measurement,
} from "../../types/measurement";

import type {
  PlanItem,
} from "../../types/plan";

import {
  typography,
} from "../../theme/colors";

import {
  formatPlanItemTypeLabel,
} from "../../utils/domain/planItemFieldContext";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PlanItemAssignmentDisplay = {
  displayLabel: string;
  hasActiveAssignment: boolean;
};

type PlanItemCardProps = {
  item: PlanItem;

  latestMeasurement?: Measurement | null;

  latestDelta?: Delta | null;

  assignment?: PlanItemAssignmentDisplay | null;

  /**
   * When false, hides the row-level assignment subtitle.
   * Used when Work Package section headers already show assignee.
   */
  showAssignmentMeta?: boolean;

  onPress?: () => void;

  readOnly?: boolean;

  showDivider?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatQuantity(
  value: number,
  unit: string,
): string {
  if (unit === "ea") {
    return `${value} ${unit}`;
  }

  return `${value.toFixed(
    2,
  )} ${unit}`;
}

function formatSignedQuantity(
  value: number,
  unit: string,
): string {
  const sign =
    value > 0 ? "+" : "";

  if (unit === "ea") {
    return `${sign}${value} ${unit}`;
  }

  return `${sign}${value.toFixed(
    2,
  )} ${unit}`;
}

function getInitials(
  label: string,
): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "PL";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${words[0][0]}${
    words[1][0]
  }`.toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Plan Item Card                                                             */
/* -------------------------------------------------------------------------- */

export default function PlanItemCard({
  item,
  latestMeasurement = null,
  latestDelta = null,
  assignment = null,
  showAssignmentMeta = true,
  onPress,
  readOnly = false,
  showDivider = true,
}: PlanItemCardProps) {
  // Read-only is presentation only — authorized shared items remain tappable.
  const interactive = !!onPress;

  const initials =
    getInitials(item.label);

  const typeLabel =
    formatPlanItemTypeLabel(
      item.type,
    );

  const plannedValue =
    formatQuantity(
      item.plannedValue,
      item.unit,
    );

  const fieldValue =
    latestMeasurement
      ? formatQuantity(
          latestMeasurement.value,
          latestMeasurement.unit,
        )
      : null;

  const deltaValue =
    latestDelta
      ? formatSignedQuantity(
          latestDelta.difference,
          latestDelta.unit,
        )
      : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,

        pressed &&
          interactive &&
          styles.rowPressed,
      ]}
      onPress={
        interactive
          ? onPress
          : undefined
      }
      disabled={!interactive}
      accessibilityRole={
        interactive
          ? "button"
          : undefined
      }
      accessibilityLabel={
        interactive
          ? `Open plan item ${item.label}`
          : item.label
      }
    >
      {/* ------------------------------------------------------------------ */}
      {/* Avatar                                                             */}
      {/* ------------------------------------------------------------------ */}

      <View
        style={
          styles.avatar
        }
      >
        <Text
          style={
            styles.avatarText
          }
        >
          {initials}
        </Text>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Content                                                            */}
      {/* ------------------------------------------------------------------ */}

      <View
        style={
          styles.content
        }
      >
        {/* Top row */}
        <View
          style={
            styles.topRow
          }
        >
          <Text
            style={
              styles.title
            }
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.label}
          </Text>

          <Text
            style={
              styles.plannedValue
            }
            numberOfLines={1}
          >
            {plannedValue}
          </Text>
        </View>

        {/* Middle row */}
        <View
          style={
            styles.middleRow
          }
        >
          <View
            style={
              styles.typeRow
            }
          >
            <Text
              style={
                styles.typeText
              }
            >
              {typeLabel}
            </Text>

            {item.origin === "plan_import" ? (
              <>
                <View
                  style={
                    styles.metaDot
                  }
                />
                <Text
                  style={
                    styles.importedText
                  }
                  accessibilityLabel={`Imported plan item ${item.label}`}
                >
                  Imported
                </Text>
              </>
            ) : null}

            <View
              style={
                styles.metaDot
              }
            />

            <Text
              style={
                styles.statusText
              }
            >
              {latestMeasurement
                ? "Measured"
                : "Awaiting field"}
            </Text>
          </View>

          {latestDelta ? (
            <View
              style={
                styles.deltaBadge
              }
            >
              <Text
                style={
                  styles.deltaText
                }
              >
                {deltaValue}
              </Text>
            </View>
          ) : null}
        </View>

        {showAssignmentMeta && assignment ? (
          <View style={styles.assignmentRow}>
            <Ionicons
              name={
                assignment.hasActiveAssignment
                  ? "checkmark-circle"
                  : "ellipse-outline"
              }
              size={13}
              color={
                assignment.hasActiveAssignment
                  ? "#3B6FCF"
                  : "#98A2B3"
              }
            />
            <Text
              style={[
                styles.assignmentText,
                assignment.hasActiveAssignment &&
                  styles.assignmentTextActive,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {assignment.displayLabel}
            </Text>
          </View>
        ) : null}

        {/* Latest field */}
        <View
          style={
            styles.previewRow
          }
        >
          <Ionicons
            name={
              latestMeasurement
                ? "checkmark-circle-outline"
                : "time-outline"
            }
            size={14}
            color={
              latestMeasurement
                ? "#667085"
                : "#98A2B3"
            }
          />

          <Text
            style={
              styles.preview
            }
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {fieldValue
              ? `Latest field: ${fieldValue}`
              : "No field measurement yet"}
          </Text>

          {interactive ? (
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#C5CBD3"
            />
          ) : null}
        </View>

        {/* Read-only state */}
        {readOnly ? (
          <View
            style={
              styles.readOnlyRow
            }
          >
            <Ionicons
              name="lock-closed-outline"
              size={12}
              color="#98A2B3"
            />

            <Text
              style={
                styles.readOnlyText
              }
            >
              Read only
            </Text>
          </View>
        ) : null}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Divider                                                            */}
      {/* ------------------------------------------------------------------ */}

      {showDivider ? (
        <View
          style={
            styles.divider
          }
        />
      ) : null}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    row: {
      position: "relative",

      minHeight: 94,

      flexDirection: "row",

      alignItems: "center",

      paddingLeft: 14,

      paddingRight: 14,

      paddingVertical: 14,

      backgroundColor:
        "#FFFFFF",
    },

    rowPressed: {
      backgroundColor:
        "#F8FAFC",
    },

    /* ---------------------------------------------------------------------- */
    /* Avatar                                                                 */
    /* ---------------------------------------------------------------------- */

    avatar: {
      width: 50,
      height: 50,

      borderRadius: 25,

      alignItems: "center",

      justifyContent:
        "center",

      marginRight: 13,

      backgroundColor:
        "#EEF2F6",
    },

    avatarText: {
      ...typography.bodyMedium,

      color: "#344054",

      textAlign: "center",
    },

    /* ---------------------------------------------------------------------- */
    /* Content                                                                */
    /* ---------------------------------------------------------------------- */

    content: {
      flex: 1,

      minWidth: 0,
    },

    topRow: {
      flexDirection: "row",

      alignItems:
        "center",

      gap: 12,
    },

    title: {
      ...typography.bodyMedium,

      color: "#101828",

      flex: 1,

      minWidth: 0,
    },

    plannedValue: {
      ...typography.bodyMedium,

      color: "#101828",

      flexShrink: 0,

      textAlign: "right",
    },

    /* ---------------------------------------------------------------------- */
    /* Metadata                                                               */
    /* ---------------------------------------------------------------------- */

    middleRow: {
      flexDirection: "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap: 10,

      marginTop: 4,
    },

    typeRow: {
      flex: 1,

      minWidth: 0,

      flexDirection: "row",

      alignItems:
        "center",

      gap: 6,
    },

    typeText: {
      ...typography.caption,

      color: "#667085",
    },

    importedText: {
      ...typography.caption,

      color: "#667085",
    },

    metaDot: {
      width: 3,
      height: 3,

      borderRadius: 2,

      backgroundColor:
        "#D0D5DD",
    },

    statusText: {
      ...typography.caption,

      color: "#98A2B3",

      flexShrink: 1,
    },

    assignmentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 5,
    },

    assignmentText: {
      ...typography.caption,
      color: "#98A2B3",
      flex: 1,
      minWidth: 0,
    },

    assignmentTextActive: {
      color: "#475467",
    },

    /* ---------------------------------------------------------------------- */
    /* Delta                                                                  */
    /* ---------------------------------------------------------------------- */

    deltaBadge: {
      flexShrink: 0,

      paddingHorizontal: 7,

      paddingVertical: 3,

      borderRadius: 999,

      backgroundColor:
        "#F2F4F7",
    },

    deltaText: {
      ...typography.metadata,

      color: "#475467",
    },

    /* ---------------------------------------------------------------------- */
    /* Preview                                                                */
    /* ---------------------------------------------------------------------- */

    previewRow: {
      flexDirection: "row",

      alignItems:
        "center",

      gap: 5,

      marginTop: 6,
    },

    preview: {
      ...typography.caption,

      color: "#98A2B3",

      flex: 1,

      minWidth: 0,
    },

    /* ---------------------------------------------------------------------- */
    /* Read Only                                                              */
    /* ---------------------------------------------------------------------- */

    readOnlyRow: {
      flexDirection: "row",

      alignItems:
        "center",

      gap: 4,

      marginTop: 6,
    },

    readOnlyText: {
      ...typography.metadata,

      color: "#98A2B3",
    },

    /* ---------------------------------------------------------------------- */
    /* Divider                                                                */
    /* ---------------------------------------------------------------------- */

    divider: {
      position: "absolute",

      left: 77,
      right: 0,
      bottom: 0,

      height:
        StyleSheet.hairlineWidth,

      backgroundColor:
        "#E9EDF2",
    },
  });