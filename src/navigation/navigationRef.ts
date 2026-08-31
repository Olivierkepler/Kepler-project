import { createNavigationContainerRef } from "@react-navigation/native";

import type { RootStackParamList } from "../navigation/types";

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();

export function isNavigationReady(): boolean {
  return navigationRef.isReady();
}
