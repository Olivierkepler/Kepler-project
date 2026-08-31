import React, {
  useEffect,
  useState,
} from "react";

import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  typography,
} from "../../../theme/colors";

import type { HomeFeedHumanUpdate } from "../../../types/homeFeed";

import {
  formatFeedEditedLabel,
  formatFeedRelativeTime,
} from "../../../utils/home/feedFormatters";

import FeedAvatar from "./FeedAvatar";

import HomeFeedMedia from "./HomeFeedMedia";

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

type Props = {
  item: HomeFeedHumanUpdate;

  currentUserId?: string;

  onProjectPress?: (
    projectId: string,
  ) => void;

  onCommentPress?: () => void;

  onEditPress?: () => void;

  onDeletePress?: () => void;

  onToggleAcknowledgement?: () => Promise<unknown>;

  acknowledgementPending?: boolean;

  resolveMediaReadUrl?: (
    mediaId: string,
  ) => Promise<string | null>;
};

export default function HomeFeedPost({
  item,
  currentUserId,
  onProjectPress,
  onCommentPress,
  onEditPress,
  onDeletePress,
  onToggleAcknowledgement,
  acknowledgementPending = false,
  resolveMediaReadUrl,
}: Props) {
  const [resolvedMedia, setResolvedMedia] =
    useState(item.media ?? []);

  useEffect(() => {
    let active = true;

    async function loadMedia() {
      if (
        !item.media ||
        item.media.length === 0 ||
        !resolveMediaReadUrl
      ) {
        if (active) {
          setResolvedMedia(item.media ?? []);
        }

        return;
      }

      const loaded = await Promise.all(
        item.media.map(async (entry) => {
          const uri =
            await resolveMediaReadUrl(
              entry.id,
            );

          return {
            ...entry,
            uri: uri ?? "",
          };
        }),
      );

      if (active) {
        setResolvedMedia(loaded);
      }
    }

    void loadMedia();

    return () => {
      active = false;
    };
  }, [
    item.media,
    resolveMediaReadUrl,
  ]);

  const contextParts = [
    item.tradeLabel,
    item.levelLabel,
    item.locationLabel,
  ].filter(Boolean);

  const showEngagementSummary =
    item.acknowledgementCount > 0 ||
    item.commentCount > 0;

  const isAuthor =
    Boolean(currentUserId) &&
    item.author.userId === currentUserId;

  const editedLabel =
    formatFeedEditedLabel(
      item.createdAt,
      item.updatedAt,
    );

  const openOwnerMenu = () => {
    if (!isAuthor) {
      return;
    }

    Alert.alert(
      "Project update",
      undefined,
      [
        {
          text: "Edit post",
          onPress: onEditPress,
        },

        {
          text: "Delete post",
          style: "destructive",
          onPress: onDeletePress,
        },

        {
          text: "Cancel",
          style: "cancel",
        },
      ],
    );
  };

  const handleAcknowledge = () => {
    if (
      !onToggleAcknowledgement ||
      acknowledgementPending
    ) {
      return;
    }

    void (async () => {
      const result =
        await onToggleAcknowledgement();

      if (result === null) {
        Alert.alert(
          "Unable to update acknowledgement",
          "Please try again.",
        );
      }
    })();
  };

  return (
    <View style={styles.post}>
      {/* -------------------------------------------------------------- */}
      {/* Kepler navy + red top accent                                   */}
      {/* -------------------------------------------------------------- */}

      <View
        pointerEvents="none"
        style={styles.cardTopAccent}
      >
        <View
          style={styles.cardTopAccentNavy}
        />

        <View
          style={styles.cardTopAccentRed}
        />
      </View>

      {/* -------------------------------------------------------------- */}
      {/* Header                                                         */}
      {/* -------------------------------------------------------------- */}

      <View style={styles.header}>
        <FeedAvatar
          initial={item.author.initial}
          size={42}
        />

        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text
              style={styles.author}
              numberOfLines={1}
            >
              {item.author.displayName}
            </Text>

            <Text style={styles.time}>
              {formatFeedRelativeTime(
                item.createdAt,
              )}
            </Text>
          </View>

          <Text
            style={styles.project}
            numberOfLines={1}
          >
            {item.projectName}
          </Text>

          {editedLabel ? (
            <Text style={styles.edited}>
              {editedLabel}
            </Text>
          ) : null}
        </View>

        {isAuthor ? (
          <Pressable
            style={styles.menuButton}
            onPress={openOwnerMenu}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            hitSlop={8}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color="#667085"
            />
          </Pressable>
        ) : null}
      </View>

      {/* -------------------------------------------------------------- */}
      {/* Body                                                           */}
      {/* -------------------------------------------------------------- */}

      <Text style={styles.body}>
        {item.text}
      </Text>

      {/* -------------------------------------------------------------- */}
      {/* Media                                                          */}
      {/* -------------------------------------------------------------- */}

      {resolvedMedia.length > 0 ? (
        <View
          style={[
            styles.mediaWrap,

            item.text.trim().length > 0 &&
              item.text.trim().length < 90 &&
              styles.mediaWrapAfterShortBody,
          ]}
        >
          <HomeFeedMedia
            media={resolvedMedia}
          />
        </View>
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Context                                                        */}
      {/* -------------------------------------------------------------- */}

      {contextParts.length > 0 ? (
        <Text style={styles.context}>
          {contextParts.join(" • ")}
        </Text>
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Engagement summary                                             */}
      {/* -------------------------------------------------------------- */}

      {showEngagementSummary ? (
        <View
          style={styles.engagementSummary}
        >
          {item.acknowledgementCount >
          0 ? (
            <View
              style={styles.summaryItem}
            >
              <Ionicons
                name="checkmark-circle"
                size={13}
                color="#667085"
              />

              <Text
                style={styles.summaryText}
              >
                {item.acknowledgementCount}{" "}
                acknowledged
              </Text>
            </View>
          ) : null}

          {item.acknowledgementCount >
            0 &&
          item.commentCount > 0 ? (
            <Text
              style={styles.summaryDot}
            >
              ·
            </Text>
          ) : null}

          {item.commentCount > 0 ? (
            <View
              style={styles.summaryItem}
            >
              <Ionicons
                name="chatbubble-outline"
                size={13}
                color="#667085"
              />

              <Text
                style={styles.summaryText}
              >
                {item.commentCount}{" "}
                {item.commentCount === 1
                  ? "comment"
                  : "comments"}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Actions                                                        */}
      {/* -------------------------------------------------------------- */}

      <View style={styles.actions}>
        <FeedAction
          icon={
            item.acknowledgedByCurrentUser
              ? "checkmark-circle"
              : "checkmark-circle-outline"
          }
          label={
            item.acknowledgedByCurrentUser
              ? "Acknowledged"
              : "Acknowledge"
          }
          onPress={handleAcknowledge}
          disabled={
            acknowledgementPending
          }
          active={
            item.acknowledgedByCurrentUser
          }
        />

        <FeedAction
          icon="chatbubble-outline"
          label="Comment"
          onPress={onCommentPress}
        />

        <FeedAction
          icon="open-outline"
          label="Project"
          onPress={
            onProjectPress
              ? () =>
                  onProjectPress(
                    item.projectId,
                  )
              : undefined
          }
        />
      </View>
    </View>
  );
}

function FeedAction({
  icon,
  label,
  onPress,
  disabled = false,
  active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;

  label: string;

  onPress?: () => void;

  disabled?: boolean;

  active?: boolean;
}) {
  const isDisabled =
    disabled || !onPress;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: isDisabled,
      }}
      style={({ pressed }) => [
        styles.action,

        pressed &&
          onPress &&
          !isDisabled &&
          styles.actionPressed,

        isDisabled &&
          styles.actionDisabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={17}
        color={
          isDisabled
            ? "#98A2B3"
            : active
              ? KEPLER_NAVY
              : "#475467"
        }
      />

      <Text
        style={[
          styles.actionLabel,

          isDisabled &&
            styles.actionLabelDisabled,

          active &&
            styles.actionLabelActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* ---------------------------------------------------------------------- */
  /* Post card                                                              */
  /* ---------------------------------------------------------------------- */

  post: {
    marginBottom: 14,

    paddingHorizontal: 0,

    // Slightly more room at the top for the 2px accent.
    paddingTop: 16,
    paddingBottom: 14,

    backgroundColor:
      "rgba(255,255,255,0.82)",

    borderRadius: 17,

    borderWidth:
      StyleSheet.hairlineWidth,

    borderColor:
      "rgba(15,23,42,0.07)",

    // Required so the accent follows
    // the rounded top corners.
    overflow: "hidden",

    position: "relative",
  },

  /* ---------------------------------------------------------------------- */
  /* Kepler top accent                                                      */
  /* ---------------------------------------------------------------------- */

  cardTopAccent: {
    position: "absolute",

    top: 0,
    left: 0,
    right: 0,

    height: 2,

    flexDirection: "row",

    zIndex: 10,
  },

  cardTopAccentNavy: {
    flex: 1,

    backgroundColor:
      KEPLER_NAVY,
  },

  cardTopAccentRed: {
    width: 34,

    backgroundColor:
      KEPLER_RED,
  },

  /* ---------------------------------------------------------------------- */
  /* Header                                                                 */
  /* ---------------------------------------------------------------------- */

  header: {
    flexDirection: "row",

    alignItems: "flex-start",

    gap: 10,

    marginBottom: 9,
  },

  headerCopy: {
    flex: 1,

    minWidth: 0,
  },

  titleRow: {
    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent: "space-between",

    gap: 8,
  },

  author: {
    ...typography.bodyMedium,

    color: "#101828",

    fontWeight: "600",

    fontSize: 14.5,

    flex: 1,
  },

  time: {
    ...typography.caption,

    color: "#98A2B3",

    fontSize: 11,

    marginTop: 1,
  },

  project: {
    ...typography.caption,

    color: KEPLER_NAVY,

    marginTop: 2,

    fontWeight: "600",

    fontSize: 12.5,

    opacity: 0.92,
  },

  edited: {
    ...typography.caption,

    color: "#98A2B3",

    marginTop: 2,

    fontSize: 11,
  },

  menuButton: {
    width: 28,

    height: 28,

    alignItems: "center",

    justifyContent: "center",

    marginTop: 2,
  },

  /* ---------------------------------------------------------------------- */
  /* Content                                                                */
  /* ---------------------------------------------------------------------- */

  body: {
    ...typography.body,

    color: "#101828",

    fontSize: 15,

    lineHeight: 21,
  },

  mediaWrap: {
    marginTop: 10,
  },

  mediaWrapAfterShortBody: {
    marginTop: 6,
  },

  context: {
    ...typography.caption,

    color: "#667085",

    marginTop: 8,

    fontSize: 12,
  },

  /* ---------------------------------------------------------------------- */
  /* Engagement summary                                                     */
  /* ---------------------------------------------------------------------- */

  engagementSummary: {
    flexDirection: "row",

    flexWrap: "wrap",

    alignItems: "center",

    gap: 6,

    marginTop: 9,
  },

  summaryItem: {
    flexDirection: "row",

    alignItems: "center",

    gap: 4,
  },

  summaryDot: {
    ...typography.caption,

    color: "#98A2B3",

    fontSize: 12,
  },

  summaryText: {
    ...typography.caption,

    color: "#667085",

    fontSize: 12,
  },

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  actions: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    marginTop: 11,

    paddingTop: 10,

    borderTopWidth:
      StyleSheet.hairlineWidth,

    borderTopColor:
      "rgba(15,23,42,0.06)",
  },

  action: {
    flex: 1,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 5,

    minHeight: 44,

    borderRadius: 8,
  },

  actionPressed: {
    opacity: 0.72,

    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  actionDisabled: {
    opacity: 0.5,
  },

  actionLabel: {
    ...typography.caption,

    color: "#475467",

    fontWeight: "600",

    fontSize: 12,
  },

  actionLabelActive: {
    color: KEPLER_NAVY,

    fontWeight: "600",
  },

  actionLabelDisabled: {
    color: "#98A2B3",
  },
});