import React, {
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
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthProvider";

import {
  colors,
  typography,
} from "../theme/colors";

import {
  normalizeInvitationEmail,
} from "../store/projectInvitations";

import {
  formatAuthErrorMessage,
  isEmailAlreadyInUse,
} from "../utils/authErrors";

import {
  SignUpProfileError,
} from "../auth/AuthProvider";

import {
  MAX_USER_DISPLAY_NAME_LENGTH,
} from "../types/userProfile";

/* -------------------------------------------------------------------------- */
/* Background                                                                 */
/* -------------------------------------------------------------------------- */

const SIGNUP_BACKGROUND =
  require("../../assets/bgsignup.png");

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Props = {
  onNavigateToSignIn: () => void;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isValidEmailShape(
  email: string,
): boolean {
  // Lightweight client check only — Firebase remains authoritative.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function CreateAccountScreen({
  onNavigateToSignIn,
}: Props) {
  const { signUp } = useAuth();

  const [
    fullName,
    setFullName,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Create Account                                                           */
  /* ------------------------------------------------------------------------ */

  const handleCreateAccount =
    async () => {
      if (submitting) {
        return;
      }

      const normalizedEmail =
        normalizeInvitationEmail(
          email,
        );

      const normalizedName =
        fullName.trim();

      if (!normalizedName) {
        Alert.alert(
          "Full name required",
          "Enter your full name.",
        );

        return;
      }

      if (
        normalizedName.length >
        MAX_USER_DISPLAY_NAME_LENGTH
      ) {
        Alert.alert(
          "Name too long",
          `Use ${MAX_USER_DISPLAY_NAME_LENGTH} characters or fewer.`,
        );

        return;
      }

      if (!normalizedEmail) {
        Alert.alert(
          "Email required",
          "Enter your email address.",
        );

        return;
      }

      if (
        !isValidEmailShape(
          normalizedEmail,
        )
      ) {
        Alert.alert(
          "Invalid email",
          "Enter a valid email address.",
        );

        return;
      }

      if (!password) {
        Alert.alert(
          "Password required",
          "Enter a password.",
        );

        return;
      }

      if (
        password !==
        confirmPassword
      ) {
        Alert.alert(
          "Passwords do not match",
          "Confirm password must match your password.",
        );

        return;
      }

      setSubmitting(true);

      try {
        await signUp(
          normalizedEmail,
          password,
          normalizedName,
        );

        // Firebase signs the user in;
        // RootEntry / AuthProvider handle the rest.
      } catch (error) {
        if (
          error instanceof
          SignUpProfileError
        ) {
          Alert.alert(
            "Account created with profile warning",
            error.message,
          );

          return;
        }

        if (
          isEmailAlreadyInUse(
            error,
          )
        ) {
          Alert.alert(
            "Account already exists",
            "An account with this email already exists. Sign in instead.",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Sign in",
                onPress:
                  onNavigateToSignIn,
              },
            ],
          );

          return;
        }

        Alert.alert(
          "Unable to create account",
          formatAuthErrorMessage(
            error,
            "signUp",
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
      source={SIGNUP_BACKGROUND}
      style={styles.background}
      imageStyle={
        styles.backgroundImage
      }
      resizeMode="cover"
    >
      {/* Optional readability veil */}

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
          style={styles.flex}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={
              styles.content
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={
              false
            }
          >
            {/* ---------------------------------------------------- */}
            {/* Intro                                                */}
            {/* ---------------------------------------------------- */}

          <View style={{ alignItems: "center", justifyContent: "center",  }}>
            <Text style={styles.eyebrow}>
              JOIN KEPLER
            </Text>

            <Text style={styles.title}>
              Create account
            </Text>

            <Text style={[styles.subtitle, { textAlign: "center" }]}>
              Create your Kepler account to join projects and collaborate with
              your team.
            </Text>
          </View>
     

            {/* ---------------------------------------------------- */}
            {/* Full Name                                            */}
            {/* ---------------------------------------------------- */}

            <Text
              style={styles.label}
            >
              FULL NAME
            </Text>

            <TextInput
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
              value={fullName}
              onChangeText={
                setFullName
              }
              placeholder="Rose Charles"
              placeholderTextColor="#98A2B3"
              editable={!submitting}
              accessibilityLabel="Full name"
            />

            {/* ---------------------------------------------------- */}
            {/* Email                                                */}
            {/* ---------------------------------------------------- */}

            <Text
              style={styles.label}
            >
              EMAIL
            </Text>

            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={
                setEmail
              }
              placeholder="you@company.com"
              placeholderTextColor="#98A2B3"
              editable={!submitting}
              accessibilityLabel="Email"
            />

            {/* ---------------------------------------------------- */}
            {/* Password                                             */}
            {/* ---------------------------------------------------- */}

            <Text
              style={styles.label}
            >
              PASSWORD
            </Text>

            <TextInput
              style={styles.input}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="password-new"
              value={password}
              onChangeText={
                setPassword
              }
              placeholder="Password"
              placeholderTextColor="#98A2B3"
              editable={!submitting}
              accessibilityLabel="Password"
            />

            {/* ---------------------------------------------------- */}
            {/* Confirm Password                                     */}
            {/* ---------------------------------------------------- */}

            <Text
              style={styles.label}
            >
              CONFIRM PASSWORD
            </Text>

            <TextInput
              style={styles.input}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="password-new"
              value={
                confirmPassword
              }
              onChangeText={
                setConfirmPassword
              }
              placeholder="Confirm password"
              placeholderTextColor="#98A2B3"
              editable={!submitting}
              accessibilityLabel="Confirm password"
            />

            {/* ---------------------------------------------------- */}
            {/* Create Account                                       */}
            {/* ---------------------------------------------------- */}

            <Pressable
              style={({
                pressed,
              }) => [
                styles.button,

                submitting &&
                  styles.buttonDisabled,

                pressed &&
                  !submitting &&
                  styles.buttonPressed,
              ]}
              onPress={() => {
                void handleCreateAccount();
              }}
              disabled={
                submitting
              }
              accessibilityRole="button"
              accessibilityLabel="Create account"
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
                <Text
                  style={
                    styles.buttonText
                  }
                >
                  Create account
                </Text>
              )}
            </Pressable>

            {/* ---------------------------------------------------- */}
            {/* Footer                                               */}
            {/* ---------------------------------------------------- */}

            <View
              style={styles.footerRow}
            >
              <Text
                style={
                  styles.footerText
                }
              >
                Already have an account?
              </Text>

              <Pressable
                onPress={
                  onNavigateToSignIn
                }
                disabled={
                  submitting
                }
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                hitSlop={8}
              >
                <Text
                  style={
                    styles.footerLink
                  }
                >
                  Sign in
                </Text>
              </Pressable>
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

    backgroundVeil: {
      ...StyleSheet.absoluteFillObject,

      backgroundColor:
        "rgba(255,255,255,0.10)",
    },

    /* ---------------------------------------------------------------------- */
    /* Screen                                                                 */
    /* ---------------------------------------------------------------------- */

    safeArea: {
      flex: 1,

      backgroundColor:
        "transparent",
    },

    flex: {
      flex: 1,
    },

    content: {
      flexGrow: 1,

      paddingHorizontal: 24,

      paddingTop: 50,

      paddingBottom: 40,
    },

    /* ---------------------------------------------------------------------- */
    /* Intro                                                                  */
    /* ---------------------------------------------------------------------- */

    eyebrow: {
      ...typography.metadata,

      color: "#667085",

      letterSpacing: 1.25,

      fontWeight: "600",
    },

    title: {
      ...typography.display,

      color: "#101828",

      marginTop: 12,

      letterSpacing: -0.7,
    },

    subtitle: {
      ...typography.body,

      color: "#667085",

      marginTop: 10,

      marginBottom: 28,

      lineHeight: 22,
    },

    /* ---------------------------------------------------------------------- */
    /* Fields                                                                 */
    /* ---------------------------------------------------------------------- */

    label: {
      ...typography.metadata,

      color: "#475467",

      letterSpacing: 0.7,

      marginBottom: 8,

      fontWeight: "600",
    },

    input: {
      ...typography.bodyLarge,

      backgroundColor:
        "rgba(255,255,255,0.90)",

      borderWidth: 1,

      borderColor:
        "rgba(208,213,221,0.92)",

    

      color: "#101828",

      paddingHorizontal: 14,

      paddingVertical: 14,

      marginBottom: 16,

      shadowColor:
        "#101828",

      shadowOffset: {
        width: 0,
        height: 1,
      },

      shadowOpacity:
        Platform.OS === "ios"
          ? 0.025
          : 0,

      shadowRadius: 3,

      elevation: 1,
    },

    /* ---------------------------------------------------------------------- */
    /* Button                                                                 */
    /* ---------------------------------------------------------------------- */

    button: {
      marginTop: 8,

      minHeight: 50,

   

      backgroundColor:
        "#012169",

      alignItems: "center",

      justifyContent:
        "center",

      shadowColor:
        "#012169",

      shadowOffset: {
        width: 0,
        height: 5,
      },

      shadowOpacity:
        Platform.OS === "ios"
          ? 0.15
          : 0,

      shadowRadius: 10,

      elevation: 3,
    },

    buttonDisabled: {
      opacity: 0.65,
    },

    buttonPressed: {
      opacity: 0.9,

      transform: [
        {
          scale: 0.99,
        },
      ],
    },

    buttonText: {
      ...typography.button,

      color: "#FFFFFF",
    },

    /* ---------------------------------------------------------------------- */
    /* Footer                                                                 */
    /* ---------------------------------------------------------------------- */

    footerRow: {
      marginTop: 22,

      flexDirection: "row",

      justifyContent:
        "center",

      alignItems: "center",

      gap: 6,

      flexWrap: "wrap",
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