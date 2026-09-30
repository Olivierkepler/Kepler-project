import React, { useEffect, useState } from "react";

import {
  Pressable,
  Image,
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
import { getPlanItemImageDisplaySource } from "../../utils/domain/planItemImage";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PlanItemAssignmentDisplay = {
  displayLabel: string;
  hasActiveAssignment: boolean;
};

const KEPLER_NAVY = "#012169";

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

  onView?: () => void;

  onEdit?: () => void;

  onShare?: () => void;

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
  onView,
  onEdit,
  onShare,
  readOnly = false,
  showDivider = true,
}: PlanItemCardProps) {
  const [failedImageUris, setFailedImageUris] = useState<string[]>([]);
  const imageSource = getPlanItemImageDisplaySource(item, failedImageUris);

  useEffect(() => {
    setFailedImageUris([]);
  }, [item.imageUri, item.imageUrl]);

  const hasActionIcons = Boolean(onView || onEdit || onShare);
  const interactive = !!onPress && !hasActionIcons;
  const showActions = hasActionIcons;

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

  const fieldStatusLabel = latestMeasurement
    ? "Measured"
    : "Awaiting field";

  const assignmentDisplayLabel = assignment?.displayLabel ?? "";
  const opaqueMemberSuffix = /(?:^|\s·\s*)[A-Za-z0-9_-]{4,12}…[A-Za-z0-9_-]{4,10}$/.exec(
    assignmentDisplayLabel,
  );
  const assignmentPrefix = opaqueMemberSuffix
    ? assignmentDisplayLabel.slice(0, opaqueMemberSuffix.index).trim()
    : "";
  const safeAssignmentDisplayLabel = opaqueMemberSuffix
    ? assignmentPrefix
      ? `${assignmentPrefix} · Assigned member`
      : "Assigned member"
    : assignmentDisplayLabel;

  const deltaValue =
    latestDelta
      ? formatSignedQuantity(
          latestDelta.difference,
          latestDelta.unit,
        )
      : null;

  const actionButtons = showActions ? (
    <View style={styles.itemActions}>
      {onView ? (
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          onPress={onView}
          accessibilityRole="button"
          accessibilityLabel={`View ${item.label}`}
          hitSlop={4}
        >
          <Ionicons
            name="eye-outline"
            size={20}
            color={KEPLER_NAVY}
          />
        </Pressable>
      ) : null}

      {onEdit ? (
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.label}`}
          hitSlop={4}
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={KEPLER_NAVY}
          />
        </Pressable>
      ) : null}

      {onShare ? (
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel={`Share ${item.label}`}
          hitSlop={4}
        >
          <Ionicons
            name="share-outline"
            size={20}
            color={KEPLER_NAVY}
          />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const rowBody = (
    <>
      <View
        style={
          styles.avatar
        }
      >
        {imageSource ? (
          <Image
            key={imageSource.uri}
            source={{ uri: imageSource.uri }}
            style={styles.avatarImage}
            resizeMode="cover"
            onError={() =>
              setFailedImageUris((current) =>
                current.includes(imageSource.uri)
                  ? current
                  : [...current, imageSource.uri],
              )
            }
            accessible={false}
          />
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
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
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.label}
          </Text>

          <View
            style={[
              styles.statusBadge,
              latestMeasurement
                ? styles.measuredStatusBadge
                : styles.awaitingStatusBadge,
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Field status, ${fieldStatusLabel}`}
          >
            <Text
              style={[
                styles.statusBadgeText,
                latestMeasurement
                  ? styles.measuredStatusText
                  : styles.awaitingStatusText,
              ]}
              numberOfLines={1}
            >
              {fieldStatusLabel}
            </Text>
          </View>
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

          </View>

          <Text style={styles.plannedValueSecondary} numberOfLines={1}>
            {plannedValue}
          </Text>

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
              {safeAssignmentDisplayLabel}
            </Text>
          </View>
        ) : null}

        {/* Latest field + actions */}
        {showActions ? (
          <View style={styles.itemFooterRow}>
            <View style={styles.measurementStatus}>
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
                style={styles.preview}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {fieldValue
                  ? `Latest field: ${fieldValue}`
                  : "No field measurement yet"}
              </Text>
            </View>

            {actionButtons}
          </View>
        ) : (
          <View style={styles.previewRow}>
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
              style={styles.preview}
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
        )}

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
    </>
  );

  return (
    <View style={styles.rowContainer}>
    {hasActionIcons ? (
      <View style={styles.row}>{rowBody}</View>
    ) : (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && interactive && styles.rowPressed,
        ]}
        onPress={interactive ? onPress : undefined}
        disabled={!interactive}
        accessibilityRole={interactive ? "button" : undefined}
        accessibilityLabel={
          interactive ? `Open plan item ${item.label}` : item.label
        }
      >
        {rowBody}
      </Pressable>
    )}

    {showDivider ? (
      <View style={styles.rowDivider} />
    ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    rowContainer: {
      position: "relative",
      backgroundColor: "#FFFFFF",
    },

    row: {
      position: "relative",

      flexDirection: "row",

      alignItems: "center",

      paddingLeft: 14,

      paddingRight: 14,

      paddingVertical: 12,

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

    avatarImage: {
      width: 50,
      height: 50,
      borderRadius: 25,
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

      alignItems: "flex-start",

      justifyContent: "space-between",

      gap: 8,
    },

    title: {
      ...typography.bodyMedium,

      color: "#101828",

      flex: 1,

      minWidth: 0,

      fontWeight: "700",
    },

    statusBadge: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },

    measuredStatusBadge: {
      backgroundColor: "#EEF4FF",
    },

    awaitingStatusBadge: {
      backgroundColor: "#F2F4F7",
    },

    statusBadgeText: {
      ...typography.metadata,
      fontWeight: "600",
    },

    measuredStatusText: {
      color: "#344E7A",
    },

    awaitingStatusText: {
      color: "#667085",
    },

    plannedValueSecondary: {
      ...typography.bodyMedium,

      color: "#475467",

      flexShrink: 0,

      textAlign: "right",
      marginLeft: "auto",
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

    itemFooterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      marginTop: 7,
    },

    measurementStatus: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
      gap: 5,
      marginRight: 4,
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

    itemActions: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 8,
      gap: 2,
      flexShrink: 0,
    },

    actionButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },

    actionButtonPressed: {
      opacity: 0.65,
    },

    /* ---------------------------------------------------------------------- */
    /* Divider                                                                */
    /* ---------------------------------------------------------------------- */

    rowDivider: {
      marginLeft: 77,
      height: StyleSheet.hairlineWidth,
      backgroundColor: "#E9EDF2",
    },
  });
