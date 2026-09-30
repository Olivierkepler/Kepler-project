import React from "react";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import OnboardingCaptureScreen from "../screens/onboarding/OnboardingCaptureScreen";
import OnboardingPlanScreen from "../screens/onboarding/OnboardingPlanScreen";
import OnboardingReconcileScreen from "../screens/onboarding/OnboardingReconcileScreen";
import OnboardingWelcomeScreen from "../screens/onboarding/OnboardingWelcomeScreen";

import { OnboardingCompleteContext } from "./onboardingComplete";
import type { OnboardingStackParamList } from "./types";
import { colors } from "../theme/colors";

const Stack =
  createNativeStackNavigator<OnboardingStackParamList>();

type Props = {
  onComplete: () => void;
};

export default function OnboardingNavigator({
  onComplete,
}: Props) {
  return (
    <OnboardingCompleteContext.Provider
      value={onComplete}
    >
      <Stack.Navigator
        initialRouteName="OnboardingWelcome"
        screenOptions={{
          headerShown: false,

          animation: "slide_from_right",

          gestureEnabled: true,

          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="OnboardingWelcome"
          component={OnboardingWelcomeScreen}
          options={{
            animation: "fade",
          }}
        />

        <Stack.Screen
          name="OnboardingPlan"
          component={OnboardingPlanScreen}
        />

        <Stack.Screen
          name="OnboardingCapture"
          component={OnboardingCaptureScreen}
        />

        <Stack.Screen
          name="OnboardingReconcile"
          component={OnboardingReconcileScreen}
        />
      </Stack.Navigator>
    </OnboardingCompleteContext.Provider>
  );
}
