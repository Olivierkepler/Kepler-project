import React, { useEffect, useRef, useState } from "react";

import {
  Pressable,
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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

  /** Hides execution/attention details when this card is used in the Plan list. */
  showExecutionDetails?: boolean;

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
  showExecutionDetails = true,
  onPress,
  onView,
  onEdit,
  onShare,
  readOnly = false,
  showDivider = true,
}: PlanItemCardProps) {
  const [failedImageUris, setFailedImageUris] = useState<string[]>([]);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [actionMenuPosition, setActionMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 224,
  });
  const actionButtonRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const imageSource = getPlanItemImageDisplaySource(item, failedImageUris);

  useEffect(() => {
    setFailedImageUris([]);
  }, [item.imageUri, item.imageUrl]);

  const rowAction = onView ?? onPress;
  const interactive = Boolean(rowAction);
  const showOverflow = Boolean(onEdit || onShare);

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

  const openActionMenu = () => {
    actionButtonRef.current?.measureInWindow((x, y, width, height) => {
      const menuWidth = Math.min(224, windowWidth - 24);
      const menuHeight = (onEdit ? 52 : 0) + (onShare ? 52 : 0);
      const left = Math.max(
        12,
        Math.min(x + width - menuWidth, windowWidth - menuWidth - 12),
      );
      const below = y + height + 6;
      const top =
        below + menuHeight <= windowHeight - 12
          ? below
          : Math.max(12, y - menuHeight - 6);
      setActionMenuPosition({ top, left, width: menuWidth });
      setActionMenuVisible(true);
    });
  };

  const runMenuAction = (callback?: () => void) => {
    setActionMenuVisible(false);
    if (callback) {
      requestAnimationFrame(callback);
    }
  };

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

          {showExecutionDetails ? (
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
          ) : null}
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

          {showExecutionDetails && latestDelta ? (
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

        {showExecutionDetails && showAssignmentMeta && assignment ? (
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

        {/* Latest field status */}
        {showExecutionDetails ? <View style={styles.previewRow}>
          <Ionicons
            name={
              latestMeasurement
                ? "checkmark-circle-outline"
                : "time-outline"
            }
            size={14}
            color={latestMeasurement ? "#667085" : "#98A2B3"}
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

          {interactive && !showOverflow ? (
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#C5CBD3"
            />
          ) : null}
        </View> : null}

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
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [
            styles.rowPrimary,
            pressed && interactive && styles.rowPressed,
          ]}
          onPress={rowAction}
          disabled={!interactive}
          accessibilityRole={interactive ? "button" : undefined}
          accessibilityLabel={interactive ? `Open plan item ${item.label}` : item.label}
        >
          {rowBody}
        </Pressable>
        {showOverflow ? (
          <Pressable
            ref={actionButtonRef}
            style={({ pressed }) => [
              styles.overflowButton,
              pressed && styles.overflowButtonPressed,
            ]}
            onPress={openActionMenu}
            accessibilityRole="button"
            accessibilityLabel="Plan item actions"
            accessibilityState={{ expanded: actionMenuVisible }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={KEPLER_NAVY} />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setActionMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close plan item actions"
          />
          <View
            style={[
              styles.actionMenu,
              {
                top: actionMenuPosition.top,
                left: actionMenuPosition.left,
                width: actionMenuPosition.width,
              },
            ]}
          >
            {onEdit ? (
              <Pressable
                onPress={() => runMenuAction(onEdit)}
                style={({ pressed }) => [styles.actionMenuItem, pressed && styles.actionMenuItemPressed]}
                accessibilityRole="button"
                accessibilityLabel="Edit Plan Item"
              >
                <Ionicons name="create-outline" size={18} color={KEPLER_NAVY} />
                <Text style={styles.actionMenuLabel}>Edit Plan Item</Text>
              </Pressable>
            ) : null}
            {onShare ? (
              <Pressable
                onPress={() => runMenuAction(onShare)}
                style={({ pressed }) => [styles.actionMenuItem, pressed && styles.actionMenuItemPressed]}
                accessibilityRole="button"
                accessibilityLabel="Share Plan Item"
              >
                <Ionicons name="share-outline" size={18} color={KEPLER_NAVY} />
                <Text style={styles.actionMenuLabel}>Share Plan Item</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      {showDivider ? <View style={styles.rowDivider} /> : null}
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
      backgroundColor: "#FFFFFF",
    },

    rowPrimary: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
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

    overflowButton: {
      width: 42,
      height: 42,
      marginLeft: 4,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },

    overflowButtonPressed: {
      backgroundColor: "#F2F4F7",
    },

    menuOverlay: {
      flex: 1,
    },

    actionMenu: {
      position: "absolute",
      width: 224,
      borderRadius: 12,
      paddingHorizontal: 8,
      backgroundColor: "#FFFFFF",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#D0D5DD",
      shadowColor: "#101828",
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 9,
    },

    actionMenuItem: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "#EAECF0",
    },

    actionMenuItemPressed: {
      backgroundColor: "#F8FAFC",
    },

    actionMenuLabel: {
      ...typography.bodyMedium,
      color: "#344054",
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
