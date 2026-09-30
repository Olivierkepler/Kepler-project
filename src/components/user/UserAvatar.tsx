import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

const KEPLER_NAVY = "#012169";

type Props = {
  imageUrl?: string | null;
  size?: number;
  pending?: boolean;
  isOwner?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function UserAvatar({
  imageUrl,
  size = 44,
  pending = false,
  isOwner = false,
  loading = false,
  style,
  accessibilityLabel = "User avatar",
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const radius = size / 2;
  const trimmedUrl = imageUrl?.trim() ?? "";
  const showImage = trimmedUrl.length > 0 && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [trimmedUrl]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        isOwner && styles.owner,
        pending && styles.pending,
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      {showImage ? (
        <Image
          source={{ uri: trimmedUrl }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: radius,
            },
          ]}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Ionicons
          name={pending ? "person-outline" : "person"}
          size={size * 0.52}
          color={KEPLER_NAVY}
          style={pending ? styles.pendingIcon : undefined}
        />
      )}

      {loading ? (
        <View
          style={[
            styles.loadingOverlay,
            {
              width: size,
              height: size,
              borderRadius: radius,
            },
          ]}
        >
          <ActivityIndicator color={KEPLER_NAVY} size="small" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1, 33, 105, 0.08)",
    overflow: "hidden",
  },
  owner: {
    backgroundColor: "rgba(1, 33, 105, 0.12)",
  },
  pending: {
    backgroundColor: "rgba(1, 33, 105, 0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1, 33, 105, 0.12)",
  },
  pendingIcon: {
    opacity: 0.72,
  },
  image: {
    backgroundColor: "rgba(1, 33, 105, 0.04)",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
  },
});
