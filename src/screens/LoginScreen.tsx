import React, {
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthProvider";

import { typography } from "../theme/colors";

import {
  formatAuthErrorMessage,
} from "../utils/authErrors";

import KeplerLogo from "../components/branding/KeplerLogo";

/* -------------------------------------------------------------------------- */
/* Background                                                                 */
/* -------------------------------------------------------------------------- */

const LOGIN_BACKGROUND =
  require("../../assets/bglog.png");

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Props = {
  onNavigateToCreateAccount?: () => void;
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function LoginScreen({
  onNavigateToCreateAccount,
}: Props) {
  const { signIn } = useAuth();

  const { width } =
    useWindowDimensions();

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    passwordVisible,
    setPasswordVisible,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Responsive Logo                                                          */
  /* ------------------------------------------------------------------------ */

  const logoWidth =
    useMemo(() => {
      return Math.min(
        width - 48,
        320,
      );
    }, [width]);

  const logoHeight =
    logoWidth * 0.24;

  /* ------------------------------------------------------------------------ */
  /* Sign In                                                                  */
  /* ------------------------------------------------------------------------ */

  const handleSignIn =
    async () => {
      const normalizedEmail =
        email.trim();

      if (
        !normalizedEmail ||
        !password
      ) {
        Alert.alert(
          "Missing credentials",
          "Enter your email and password.",
        );

        return;
      }

      setSubmitting(true);

      try {
        await signIn(
          normalizedEmail,
          password,
        );
      } catch (error) {
        Alert.alert(
          "Sign in failed",
          formatAuthErrorMessage(
            error,
            "signIn",
          ),
        );
      } finally {
        setSubmitting(false);
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <ImageBackground
      source={LOGIN_BACKGROUND}
      style={styles.background}
      imageStyle={
        styles.backgroundImage
      }
      resizeMode="cover"
    >
      {/* ---------------------------------------------------------- */}
      {/* Very subtle white veil for reliable form readability      */}
      {/* ---------------------------------------------------------- */}

      <View
        pointerEvents="none"
        style={
          styles.backgroundVeil
        }
      />

      <SafeAreaView
        style={styles.safeArea}
        edges={[
          "top",
          "bottom",
        ]}
      >
        <KeyboardAvoidingView
          style={
            styles.keyboardView
          }
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.scrollContent
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={
              false
            }
            bounces={false}
          >
            {/* ==================================================== */}
            {/* BRAND                                                */}
            {/* ==================================================== */}

            <View
              style={
                styles.brandArea
              }
            >
              <KeplerLogo
                width={logoWidth}
                height={logoHeight}
                autoPlay
              />
            </View>

      

            {/* ==================================================== */}
            {/* FORM                                                 */}
            {/* ==================================================== */}

            <View
              style={styles.form}
            >
              {/* -------------------------------------------------- */}
              {/* Intro                                              */}
              {/* -------------------------------------------------- */}

              <View
                style={[
                  styles.introSection,
                  { alignItems: "center", justifyContent: "center" }
                ]}
              >
                <Text
                  style={[
                    styles.eyebrow,
                    { textAlign: "center" }
                  ]}
                >
                  WELCOME BACK
                </Text>

                <Text
                  style={[
                    styles.title,
                    { textAlign: "center" }
                  ]}
                >
                  Sign in
                </Text>

                <Text
                  style={[
                    styles.subtitle,
                    { textAlign: "center" }
                  ]}
                >
                  Access your projects,
                  field activity, and
                  construction intelligence.
                </Text>
              </View>

         

              {/* ================================================== */}
              {/* EMAIL                                              */}
              {/* ================================================== */}

              <View
                style={
                  styles.field
                }
              >
                <Text
                  style={
                    styles.label
                  }
                >
                  EMAIL
                </Text>

                <View
                  style={
                    styles.inputContainer
                  }
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color="#667085"
                    style={
                      styles.inputIcon
                    }
                  />

                  <TextInput
                    style={
                      styles.input
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    autoComplete="email"
                    returnKeyType="next"
                    value={email}
                    onChangeText={
                      setEmail
                    }
                    placeholder="you@company.com"
                    placeholderTextColor="#98A2B3"
                    editable={
                      !submitting
                    }
                    accessibilityLabel="Email"
                  />
                </View>
              </View>

              {/* ================================================== */}
              {/* PASSWORD                                           */}
              {/* ================================================== */}

              <View
                style={
                  styles.field
                }
              >
                <Text
                  style={
                    styles.label
                  }
                >
                  PASSWORD
                </Text>

                <View
                  style={
                    styles.inputContainer
                  }
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#667085"
                    style={
                      styles.inputIcon
                    }
                  />

                  <TextInput
                    style={
                      styles.input
                    }
                    secureTextEntry={
                      !passwordVisible
                    }
                    textContentType="password"
                    autoComplete="password"
                    returnKeyType="done"
                    value={password}
                    onChangeText={
                      setPassword
                    }
                    onSubmitEditing={() => {
                      void handleSignIn();
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor="#98A2B3"
                    editable={
                      !submitting
                    }
                    accessibilityLabel="Password"
                  />

                  <Pressable
                    style={
                      styles.passwordToggle
                    }
                    onPress={() => {
                      setPasswordVisible(
                        (current) =>
                          !current,
                      );
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      passwordVisible
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    <Ionicons
                      name={
                        passwordVisible
                          ? "eye-off-outline"
                          : "eye-outline"
                      }
                      size={19}
                      color="#667085"
                    />
                  </Pressable>
                </View>
              </View>

              {/* ================================================== */}
              {/* SIGN IN                                            */}
              {/* ================================================== */}

              <Pressable
                style={({
                  pressed,
                }) => [
                  styles.button,

                  pressed &&
                    !submitting &&
                    styles.buttonPressed,

                  submitting &&
                    styles.buttonDisabled,
                ]}
                onPress={() => {
                  void handleSignIn();
                }}
                disabled={
                  submitting
                }
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                accessibilityState={{
                  disabled:
                    submitting,

                  busy:
                    submitting,
                }}
              >
                {submitting ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <>
                    <Text
                      style={
                        styles.buttonText
                      }
                    >
                      Sign in
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              {/* ================================================== */}
              {/* CREATE ACCOUNT                                     */}
              {/* ================================================== */}

              {onNavigateToCreateAccount ? (
                <View
                  style={
                    styles.footerRow
                  }
                >
                  <Text
                    style={
                      styles.footerText
                    }
                  >
                    New to Kepler?
                  </Text>

                  <Pressable
                    onPress={
                      onNavigateToCreateAccount
                    }
                    disabled={
                      submitting
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                    hitSlop={8}
                  >
                    <Text
                      style={
                        styles.footerLink
                      }
                    >
                      Create account
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Background                                                             */
    /* ---------------------------------------------------------------------- */

    background: {
      flex: 1,

      backgroundColor:
        "#FFFFFF",
    },

    backgroundImage: {
      width: "100%",

      height: "100%",
    },

    /**
     * Keeps the background visible while ensuring
     * all form content remains readable.
     *
     * If you want the artwork stronger later,
     * reduce 0.12 to something like 0.05.
     */
    backgroundVeil: {
      ...StyleSheet.absoluteFill,

      backgroundColor:
        "rgba(255,255,255,0.12)",
    },

    /* ---------------------------------------------------------------------- */
    /* Screen                                                                 */
    /* ---------------------------------------------------------------------- */

    safeArea: {
      flex: 1,

      /**
       * IMPORTANT:
       * Must remain transparent or it will
       * cover bglogin.png.
       */
      backgroundColor:
        "transparent",
    },

    keyboardView: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,

      paddingHorizontal: 24,

      paddingBottom: 32,
    },

    /* ---------------------------------------------------------------------- */
    /* Brand                                                                  */
    /* ---------------------------------------------------------------------- */

    brandArea: {
      minHeight: 172,

      width: "100%",

      alignItems:
        "flex-start",

      justifyContent:
        "flex-end",

      paddingBottom: 76,
    },

    /* ---------------------------------------------------------------------- */
    /* Form                                                                   */
    /* ---------------------------------------------------------------------- */

    form: {
      width: "100%",

      maxWidth: 480,

      alignSelf:
        "flex-start",
    },

    introSection: {
      marginBottom: 32,
    },

    eyebrow: {
      ...typography.metadata,

      color: "#667085",

      fontWeight: "600",

      letterSpacing: 1.25,
    },

    title: {
      ...typography.display,

      marginTop: 10,

      color: "#101828",

      letterSpacing: -0.8,
    },

    subtitle: {
      ...typography.bodyLarge,

      marginTop: 10,

      maxWidth: 440,

      color: "#667085",

      lineHeight: 24,
    },

    /* ---------------------------------------------------------------------- */
    /* Fields                                                                 */
    /* ---------------------------------------------------------------------- */

    field: {
      marginBottom: 18,
    },

    label: {
      ...typography.metadata,

      marginBottom: 8,

      color: "#475467",

      fontWeight: "600",

      letterSpacing: 0.7,
    },

    inputContainer: {
      minHeight: 54,

      flexDirection: "row",

      alignItems: "center",

      borderWidth: 1,

      borderColor:
        "rgba(208,213,221,0.92)",

      // borderRadius: 14,

      backgroundColor:
        "rgba(255,255,255,0.90)",

      shadowColor:
        "#101828",

      shadowOffset: {
        width: 0,
        height: 2,
      },

      shadowOpacity:
        Platform.OS === "ios"
          ? 0.035
          : 0,

      shadowRadius: 5,

      elevation: 1,
    },

    inputIcon: {
      marginLeft: 15,

      marginRight: 10,
    },

    input: {
      ...typography.bodyLarge,

      flex: 1,

      minHeight: 52,

      paddingVertical: 13,

      paddingRight: 14,

      color: "#101828",
    },

    passwordToggle: {
      width: 46,

      height: 52,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    /* ---------------------------------------------------------------------- */
    /* Sign In                                                                */
    /* ---------------------------------------------------------------------- */

    button: {
      height: 52,

      marginTop: 8,

  

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "center",

      gap: 8,

      backgroundColor:
        "#012169",

      shadowColor:
        "#012169",

      shadowOffset: {
        width: 0,
        height: 6,
      },

      shadowOpacity:
        Platform.OS === "ios"
          ? 0.16
          : 0,

      shadowRadius: 12,

      elevation: 4,
    },

    buttonPressed: {
      opacity: 0.9,

      transform: [
        {
          scale: 0.99,
        },
      ],
    },

    buttonDisabled: {
      opacity: 0.58,
    },

    buttonText: {
      ...typography.bodyMedium,

      color: "#FFFFFF",

      fontWeight: "600",
    },

    /* ---------------------------------------------------------------------- */
    /* Footer                                                                 */
    /* ---------------------------------------------------------------------- */

    footerRow: {
      marginTop: 26,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "flex-start",

      flexWrap: "wrap",

      gap: 6,
    },

    footerText: {
      ...typography.body,

      color: "#667085",
    },

    footerLink: {
      ...typography.bodyMedium,

      color: "#012169",

      fontWeight: "600",
    },
  });