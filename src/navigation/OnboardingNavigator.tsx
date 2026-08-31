import React, {
  createContext,
  useContext,
} from "react";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import OnboardingCaptureScreen from "../screens/onboarding/OnboardingCaptureScreen";
import OnboardingPlanScreen from "../screens/onboarding/OnboardingPlanScreen";
import OnboardingReconcileScreen from "../screens/onboarding/OnboardingReconcileScreen";
import OnboardingWelcomeScreen from "../screens/onboarding/OnboardingWelcomeScreen";

import { colors } from "../theme/colors";

export type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingPlan: undefined;
  OnboardingCapture: undefined;
  OnboardingReconcile: undefined;
};

const Stack =
  createNativeStackNavigator<OnboardingStackParamList>();

const OnboardingCompleteContext =
  createContext<(() => void) | null>(null);

export function useOnboardingComplete(): () => void {
  const complete =
    useContext(OnboardingCompleteContext);

  if (!complete) {
    throw new Error(
      "useOnboardingComplete must be used within OnboardingNavigator",
    );
  }

  return complete;
}

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