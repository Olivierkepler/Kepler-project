import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors } from "../../theme/colors";

type Props = {
  uri?: string | null;
  size: number;
  radius?: number;
};

export default function WorkPackageImage({ uri, size, radius = 10 }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => setFailedUri(null), [uri]);
  const showImage = Boolean(uri?.trim()) && failedUri !== uri;

  return (
    <View
      style={[
        styles.surface,
        { width: size, height: size, borderRadius: radius },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          resizeMode="cover"
          onError={() => setFailedUri(uri ?? null)}
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <Ionicons name="cube-outline" size={Math.round(size * 0.58)} color={colors.brand.navy} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(1,33,105,0.06)",
  },
});
