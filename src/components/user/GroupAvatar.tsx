import React, { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

const KEPLER_NAVY = "#012169";

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  imageUrl?: string | null;
};

export default function GroupAvatar({
  size = 44,
  style,
  accessibilityLabel = "Group conversation",
  imageUrl,
}: Props) {
  const radius = size / 2;
  const normalizedImageUrl = imageUrl?.trim() ?? "";
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedImageUrl(null);
  }, [normalizedImageUrl]);
  const shouldShowImage =
    normalizedImageUrl.length > 0 && failedImageUrl !== normalizedImageUrl;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      {shouldShowImage ? (
        <Image
          source={{ uri: normalizedImageUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => setFailedImageUrl(normalizedImageUrl)}
        />
      ) : (
        <Ionicons name="people" size={size * 0.52} color={KEPLER_NAVY} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1, 33, 105, 0.08)",
  },
});
