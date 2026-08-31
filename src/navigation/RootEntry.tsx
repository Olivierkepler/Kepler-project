import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";

import { BlurView } from "expo-blur";

import { useAuth } from "../auth/AuthProvider";

import BuildSigmaLoader from "../components/branding/BuildSigmaLoader";

import AppNavigator from "../navigation/AppNavigator";
import OnboardingNavigator from "../navigation/OnboardingNavigator";

import CreateAccountScreen from "../screens/CreateAccountScreen";
import LoginScreen from "../screens/LoginScreen";

import CloudSyncCoordinator from "../services/sync/CloudSyncCoordinator";

import usePushNotifications from "../hooks/usePushNotifications";

import { colors } from "../theme/colors";

import {
  getHasCompletedOnboarding,
  shouldPresentOnboarding,
} from "../utils/onboarding/onboardingPreference";

function BuildSigmaStartup() {
  const pulse = useRef(
    new Animated.Value(0),
  ).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),

        Animated.timing(pulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [pulse]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.12],
  });

  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.48],
  });

  return (
    <View style={styles.loading}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.loaderHalo,
          {
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      >
        <BlurView
          intensity={30}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.loaderContent}>
        <BuildSigmaLoader
          size={64}
          label="Loading BuildSigma…"
        />
      </View>
    </View>
  );
}

type UnauthenticatedMode = "signIn" | "createAccount";

function AuthenticatedAppShell() {
  usePushNotifications();

  return (
    <>
      <CloudSyncCoordinator />
      <AppNavigator />
    </>
  );
}

export default function RootEntry() {
  const { user, loading } = useAuth();

  const [
    onboardingReady,
    setOnboardingReady,
  ] = useState(false);

  const [
    needsOnboarding,
    setNeedsOnboarding,
  ] = useState(false);

  const [
    unauthenticatedMode,
    setUnauthenticatedMode,
  ] = useState<UnauthenticatedMode>("signIn");

  useEffect(() => {
    let active = true;

    if (!user) {
      setOnboardingReady(false);
      setNeedsOnboarding(false);
      return;
    }

    // Authenticated users leave the unauthenticated gate; reset for next sign-out.
    setUnauthenticatedMode("signIn");

    setOnboardingReady(false);

    void (async () => {
      const completed =
        await getHasCompletedOnboarding();

      if (!active) {
        return;
      }

      setNeedsOnboarding(
        shouldPresentOnboarding(completed),
      );

      setOnboardingReady(true);
    })();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  if (
    loading ||
    (user && !onboardingReady)
  ) {
    return <BuildSigmaStartup />;
  }

  if (!user) {
    if (unauthenticatedMode === "createAccount") {
      return (
        <CreateAccountScreen
          onNavigateToSignIn={() => {
            setUnauthenticatedMode("signIn");
          }}
        />
      );
    }

    return (
      <LoginScreen
        onNavigateToCreateAccount={() => {
          setUnauthenticatedMode("createAccount");
        }}
      />
    );
  }

  if (needsOnboarding) {
    return (
      <OnboardingNavigator
        onComplete={() => {
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  return (
    <AuthenticatedAppShell />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,

    backgroundColor: colors.background,

    alignItems: "center",
    justifyContent: "center",

    overflow: "hidden",
  },

  loaderContent: {
    zIndex: 2,

    alignItems: "center",
    justifyContent: "center",
  },

  loaderHalo: {
    position: "absolute",

    width: 230,
    height: 230,

    borderRadius: 115,

    overflow: "hidden",

    backgroundColor:
      "rgba(30,143,224,0.055)",
  },
});