import React from "react";

import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import type { HomeFeedMediaItem } from "../../../types/homeFeed";

const KEPLER_NAVY = "#012169";

type Props = {
  media: HomeFeedMediaItem[];
};

export default function HomeFeedMedia({
  media,
}: Props) {
  if (media.length === 0) {
    return null;
  }

  if (media.length === 1) {
    return (
      <MediaTile
        item={media[0]}
        style={styles.single}
      />
    );
  }

  if (media.length === 2) {
    return (
      <View style={styles.twoUp}>
        <MediaTile
          item={media[0]}
          style={styles.half}
        />
        <MediaTile
          item={media[1]}
          style={styles.half}
        />
      </View>
    );
  }

  const [primary, ...rest] = media;
  const overflow =
    rest.length > 2
      ? rest.length - 2
      : 0;

  return (
    <View style={styles.grid}>
      <MediaTile
        item={primary}
        style={styles.gridPrimary}
      />

      <View style={styles.gridSecondary}>
        {rest.slice(0, 2).map((item, index) => (
          <MediaTile
            key={item.id}
            item={item}
            style={styles.gridTile}
            overflowLabel={
              index === 1 && overflow > 0
                ? `+${overflow + 1}`
                : undefined
            }
          />
        ))}
      </View>
    </View>
  );
}

function MediaTile({
  item,
  style,
  overflowLabel,
}: {
  item: HomeFeedMediaItem;
  style: object;
  overflowLabel?: string;
}) {
  const isVideo =
    item.type === "video";

  return (
    <View
      style={[
        styles.tile,
        style,
      ]}
      accessibilityLabel={
        isVideo
          ? "Video attachment"
          : "Photo attachment"
      }
    >
      {item.uri ? (
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            isVideo && styles.videoPlaceholder,
          ]}
        />
      )}

      {isVideo ? (
        <View style={styles.videoOverlay}>
          <View style={styles.playBadge}>
            <Ionicons
              name="play"
              size={16}
              color={KEPLER_NAVY}
            />
          </View>

          {item.durationLabel ? (
            <Text style={styles.duration}>
              {item.durationLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      {overflowLabel ? (
        <View style={styles.overflow}>
          <Text style={styles.overflowText}>
            {overflowLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  single: {
    width: "100%",
    height: 232,
    maxHeight: 280,
  },

  twoUp: {
    flexDirection: "row",
    gap: 3,
  },

  half: {
    flex: 1,
    height: 156,
  },

  grid: {
    flexDirection: "row",
    gap: 3,
    height: 196,
  },

  gridPrimary: {
    flex: 1.35,
    height: "100%",
  },

  gridSecondary: {
    flex: 1,
    gap: 3,
  },

  gridTile: {
    flex: 1,
    height: "100%",
  },

  tile: {
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor:
      "rgba(15,23,42,0.05)",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  placeholder: {
    flex: 1,
    backgroundColor:
      "rgba(1,33,105,0.05)",
  },

  videoPlaceholder: {
    backgroundColor:
      "rgba(15,23,42,0.12)",
  },

  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(15,23,42,0.28)",
  },

  playBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(255,255,255,0.92)",
  },

  duration: {
    position: "absolute",
    right: 8,
    bottom: 8,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    backgroundColor:
      "rgba(15,23,42,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },

  overflow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(15,23,42,0.42)",
  },

  overflowText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
});
