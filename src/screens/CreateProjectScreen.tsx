import React, {
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import * as ImagePicker from "expo-image-picker";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import type {
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";

import type {
  RootStackParamList,
} from "../navigation/types";

import {
  ensureRemoteProject,
} from "../services/sync/projectBootstrap";

import {
  createProject,
  updateProject,
} from "../store/projects";

import {
  persistProjectImage,
} from "../services/projects/projectImageLocal";

import type {
  ProjectStatus,
} from "../types/project";

import {
  DEFAULT_PROJECT_CREATE_STATUS,
  PROJECT_CREATE_STATUSES,
  validateProjectCreateInput,
} from "../utils/domain/projectCreate";

import {
  typography,
} from "../theme/colors";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Props =
  NativeStackScreenProps<
    RootStackParamList,
    "CreateProject"
  >;

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY =
  "#012169";

const KEPLER_RED =
  "#E31837";

const PROJECT_BACKGROUND =
  require("../../assets/bgproject.png");

const TEXT_PRIMARY =
  "#101828";

const TEXT_SECONDARY =
  "#667085";

const TEXT_MUTED =
  "#98A2B3";

const BORDER =
  "#D0D5DD";

const SURFACE =
  "#FFFFFF";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function statusLabel(
  status: ProjectStatus,
): string {
  switch (status) {
    case "active":
      return "Active";

    case "planning":
      return "Planning";

    case "completed":
      return "Completed";

    case "on-hold":
      return "On hold";
  }
}

function statusIcon(
  status: ProjectStatus,
): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case "active":
      return "play-circle-outline";

    case "planning":
      return "layers-outline";

    case "completed":
      return "checkmark-circle-outline";

    case "on-hold":
      return "pause-circle-outline";
  }
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function CreateProjectScreen({
  navigation,
}: Props) {
  const { user } =
    useAuth();

  const [
    name,
    setName,
  ] = useState("");

  const [
    location,
    setLocation,
  ] = useState("");

  const [
    status,
    setStatus,
  ] = useState<ProjectStatus>(
    DEFAULT_PROJECT_CREATE_STATUS,
  );

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    avatarUri,
    setAvatarUri,
  ] = useState<
    string | null
  >(null);

  const [
    avatarLoading,
    setAvatarLoading,
  ] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Project image                                                            */
  /* ------------------------------------------------------------------------ */

  const handleChooseProjectImage =
    async () => {
      if (
        saving ||
        avatarLoading
      ) {
        return;
      }

      setAvatarLoading(
        true,
      );

      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (
          !permission.granted
        ) {
          Alert.alert(
            "Photo access required",
            "Allow access to your photos to choose a project image.",
          );

          return;
        }

        const result =
          await ImagePicker.launchImageLibraryAsync({
            mediaTypes: [
              "images",
            ],

            allowsEditing:
              true,

            aspect: [
              1,
              1,
            ],

            quality:
              0.85,
          });

        if (
          result.canceled
        ) {
          return;
        }

        const selected =
          result.assets[0];

        if (
          !selected?.uri
        ) {
          return;
        }

        setAvatarUri(
          selected.uri,
        );
      } catch {
        Alert.alert(
          "Unable to load image",
          "The project image could not be loaded. Please try again.",
        );
      } finally {
        setAvatarLoading(
          false,
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Save                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleSave =
    async () => {
      if (
        !user?.uid ||
        saving
      ) {
        return;
      }

      const validated =
        validateProjectCreateInput({
          name,
          location,
          status,
        });

      if (
        !validated.ok
      ) {
        setError(
          validated.error,
        );

        return;
      }

      setError(
        null,
      );

      setSaving(
        true,
      );

      try {
        const ownerUid =
          user.uid;

        const created =
          await createProject(
            ownerUid,
            {
              ...validated.value,
              avatarUri: null,
            },
          );

        if (avatarUri) {
          try {
            const durableAvatarUri = await persistProjectImage(
              ownerUid,
              created.id,
              avatarUri,
            );
            const projectWithImage = await updateProject(
              ownerUid,
              created.id,
              { avatarUri: durableAvatarUri },
            );

            if (!projectWithImage) {
              throw new Error("Project not found.");
            }
          } catch {
            Alert.alert(
              "Project saved without image",
              "The image could not be saved. You can add it later by editing the project.",
            );
          }
        }

        /**
         * Local create already succeeded.
         * Cloud bootstrap remains best-effort.
         */
        const remoteProjectId =
          await ensureRemoteProject(
            ownerUid,
            created.id,
          );

        if (
          !remoteProjectId
        ) {
          Alert.alert(
            "Saved on this device",
            "Cloud sync is pending. The project is available locally.",
          );
        }

        navigation.replace(
          "Project",
          {
            projectId:
              created.id,
          },
        );
      } catch (
        saveError
      ) {
        const message =
          saveError instanceof
          Error
            ? saveError.message
            : "Unable to create project.";

        setError(
          message,
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
        "bottom",
      ]}
    >
      <ImageBackground
        source={
          PROJECT_BACKGROUND
        }
        style={
          styles.background
        }
        resizeMode="cover"
      >
        <ScrollView
          style={
            styles.container
          }
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* ================================================================== */}
          {/* Header                                                             */}
          {/* ================================================================== */}

          <View
            style={
              styles.topBar
            }
          >
            <Pressable
              style={({
                pressed,
              }) => [
                pressed &&
                  styles.backButtonPressed,
              ]}
              onPress={() =>
                navigation.goBack()
              }
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={
                  KEPLER_NAVY
                }
              />
            </Pressable>

            <View
              style={
                styles.topBarCenter
              }
            >
              <Text
                style={
                  styles.topBarTitle
                }
              >
                Create Project
              </Text>
            </View>

            <View
              style={
                styles.topBarPlaceholder
              }
            />
          </View>

          {/* ================================================================== */}
          {/* Intro                                                              */}
          {/* ================================================================== */}

          <View
            style={[
              styles.intro,
              {
                alignItems:
                  "center",

                justifyContent:
                  "center",
              },
            ]}
          >
            <Text
              style={[
                styles.introTitle,
                {
                  textAlign:
                    "center",
                },
              ]}
            >
              Start with the basics
            </Text>

            <Text
              style={[
                styles.introText,
                {
                  textAlign:
                    "center",
                },
              ]}
            >
              Add the project name, location, and current status. You can add more details later.
            </Text>
          </View>

          {/* ================================================================== */}
          {/* Form Card                                                          */}
          {/* ================================================================== */}

          <View
            style={
              styles.formCard
            }
          >
            {/* -------------------------------------------------------------- */}
            {/* Project image                                                  */}
            {/* -------------------------------------------------------------- */}

            <View
              style={
                styles.avatarSection
              }
            >
              <View
                style={
                  styles.avatarPickerRow
                }
              >
                <Pressable
                  style={({
                    pressed,
                  }) => [
                    styles.avatarPreviewWrap,

                    pressed &&
                      !saving &&
                      !avatarLoading &&
                      styles.avatarPreviewPressed,

                    avatarLoading &&
                      styles.avatarPreviewLoading,
                  ]}
                  onPress={() => {
                    void handleChooseProjectImage();
                  }}
                  disabled={
                    saving ||
                    avatarLoading
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    avatarLoading
                      ? "Loading project image"
                      : avatarUri
                        ? "Change project image"
                        : "Add project image"
                  }
                  accessibilityState={{
                    disabled:
                      saving ||
                      avatarLoading,

                    busy:
                      avatarLoading,
                  }}
                >
                  {avatarUri ? (
                    <Image
                      source={{
                        uri:
                          avatarUri,
                      }}
                      style={
                        styles.avatarPreview
                      }
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View
                      style={
                        styles.avatarPlaceholder
                      }
                    >
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color={
                          KEPLER_NAVY
                        }
                      />
                    </View>
                  )}

                  {/* ---------------------------------------------------------- */}
                  {/* Avatar action / loading badge                              */}
                  {/* ---------------------------------------------------------- */}

                  <View
                    style={[
                      styles.avatarBadge,

                      avatarLoading &&
                        styles.avatarBadgeLoading,
                    ]}
                  >
                    {avatarLoading ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <Ionicons
                        name={
                          avatarUri
                            ? "pencil"
                            : "add"
                        }
                        size={14}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                </Pressable>

                <View
                  style={
                    styles.avatarCopy
                  }
                >
                  <Text
                    style={
                      styles.avatarTitle
                    }
                  >
                    Project image
                  </Text>

                  <Text
                    style={
                      styles.avatarHelper
                    }
                  >
                    {avatarLoading
                      ? "Preparing your project image..."
                      : "Add a photo to make this project easier to recognize."}
                  </Text>

                  {avatarUri &&
                  !avatarLoading ? (
                    <Pressable
                      onPress={() =>
                        setAvatarUri(
                          null,
                        )
                      }
                      disabled={
                        saving ||
                        avatarLoading
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Remove project image"
                      hitSlop={8}
                    >
                      <Text
                        style={
                          styles.avatarRemove
                        }
                      >
                        Remove photo
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>

            {/* -------------------------------------------------------------- */}
            {/* Name                                                           */}
            {/* -------------------------------------------------------------- */}

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
                PROJECT NAME
              </Text>

              <View
                style={
                  styles.inputContainer
                }
              >
                <Ionicons
                  name="business-outline"
                  size={18}
                  color={
                    TEXT_SECONDARY
                  }
                  style={
                    styles.inputIcon
                  }
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    name
                  }
                  onChangeText={
                    setName
                  }
                  placeholder="Cambridge Retail Fit-Out"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving
                  }
                  autoCapitalize="words"
                  autoCorrect={
                    false
                  }
                  returnKeyType="next"
                  accessibilityLabel="Project name"
                />
              </View>
            </View>

            {/* -------------------------------------------------------------- */}
            {/* Location                                                       */}
            {/* -------------------------------------------------------------- */}

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
                LOCATION
              </Text>

              <View
                style={
                  styles.inputContainer
                }
              >
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={
                    TEXT_SECONDARY
                  }
                  style={
                    styles.inputIcon
                  }
                />

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    location
                  }
                  onChangeText={
                    setLocation
                  }
                  placeholder="Cambridge, MA"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving
                  }
                  autoCapitalize="words"
                  returnKeyType="done"
                  accessibilityLabel="Project location"
                />
              </View>
            </View>

            {/* -------------------------------------------------------------- */}
            {/* Status                                                         */}
            {/* -------------------------------------------------------------- */}

            <View
              style={
                styles.statusSection
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                STATUS
              </Text>

              <Text
                style={
                  styles.statusHelper
                }
              >
                Choose the phase that best reflects the project today.
              </Text>

              <View
                style={
                  styles.statusRow
                }
              >
                {PROJECT_CREATE_STATUSES.map(
                  (
                    option,
                  ) => {
                    const selected =
                      option ===
                      status;

                    return (
                      <Pressable
                        key={
                          option
                        }
                        style={({
                          pressed,
                        }) => [
                          styles.statusChip,

                          selected &&
                            styles.statusChipSelected,

                          pressed &&
                            !saving &&
                            styles.statusChipPressed,
                        ]}
                        onPress={() =>
                          setStatus(
                            option,
                          )
                        }
                        disabled={
                          saving
                        }
                        accessibilityRole="button"
                        accessibilityState={{
                          selected,
                        }}
                        accessibilityLabel={`Select status ${statusLabel(
                          option,
                        )}`}
                      >
                        <Ionicons
                          name={
                            statusIcon(
                              option,
                            )
                          }
                          size={17}
                          color={
                            KEPLER_NAVY
                          }
                          style={
                            selected
                              ? styles.statusIconSelected
                              : undefined
                          }
                        />

                        <Text
                          style={[
                            styles.statusChipText,

                            selected &&
                              styles.statusChipTextSelected,
                          ]}
                        >
                          {
                            statusLabel(
                              option,
                            )
                          }
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>
          </View>

          {/* ================================================================== */}
          {/* Error                                                              */}
          {/* ================================================================== */}

          {error ? (
            <View
              style={
                styles.errorBanner
              }
            >
              <View
                style={
                  styles.errorIcon
                }
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color={
                    KEPLER_RED
                  }
                />
              </View>

              <Text
                style={
                  styles.errorText
                }
              >
                {
                  error
                }
              </Text>
            </View>
          ) : null}

          {/* ================================================================== */}
          {/* Save                                                               */}
          {/* ================================================================== */}

          <Pressable
            style={({
              pressed,
            }) => [
              styles.saveButton,

              pressed &&
                !saving &&
                styles.saveButtonPressed,

              saving &&
                styles.saveButtonDisabled,
            ]}
            onPress={() => {
              void handleSave();
            }}
            disabled={
              saving
            }
            accessibilityRole="button"
            accessibilityLabel="Save project"
            accessibilityState={{
              disabled:
                saving,

              busy:
                saving,
            }}
          >
            {saving ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Create Project
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color="#FFFFFF"
                />
              </>
            )}
          </Pressable>

          <Text
            style={
              styles.syncHint
            }
          >
            Project data is saved locally first and synchronized to the cloud when available.
          </Text>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Screen                                                                 */
    /* ---------------------------------------------------------------------- */

    safeArea: {
      flex: 1,

      backgroundColor:
        "#F8FAFC",
    },

    background: {
      flex: 1,

      width:
        "100%",

      height:
        "100%",
    },

    container: {
      flex: 1,
    },

    content: {
      paddingHorizontal:
        20,

      paddingBottom:
        42,
    },

    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    topBar: {
      minHeight:
        74,

      paddingTop:
        6,

      marginBottom:
        18,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",
    },

    backButton: {
      width:
        42,

      height:
        42,

      borderRadius:
        14,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(255,255,255,0.92)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.06
          : 0,

      shadowRadius:
        8,

      elevation:
        2,
    },

    backButtonPressed: {
      opacity:
        0.76,

      transform: [
        {
          scale:
            0.95,
        },
      ],
    },

    topBarCenter: {
      flex: 1,

      alignItems:
        "center",

      paddingHorizontal:
        12,
    },

    topBarEyebrow: {
      ...typography.metadata,

      color:
        KEPLER_RED,

      fontWeight:
        "700",

      letterSpacing:
        1.3,
    },

    topBarTitle: {
      ...typography.bodyLarge,

      marginTop:
        2,

      color:
        TEXT_PRIMARY,

      fontFamily:
        "Poppins_500Medium",
    },

    topBarPlaceholder: {
      width:
        42,
    },

    /* ---------------------------------------------------------------------- */
    /* Intro                                                                  */
    /* ---------------------------------------------------------------------- */

    intro: {
      marginBottom:
        22,
    },

    introTitle: {
      ...typography.title,

      color:
        TEXT_PRIMARY,

      letterSpacing:
        -0.45,
    },

    introText: {
      ...typography.body,

      marginTop:
        6,

      maxWidth:
        420,

      color:
        TEXT_SECONDARY,

      lineHeight:
        21,
    },

    /* ---------------------------------------------------------------------- */
    /* Form Card                                                              */
    /* ---------------------------------------------------------------------- */

    formCard: {
      padding:
        16,

      backgroundColor:
        "rgba(255, 255, 255, 0.31)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.07)",

      shadowColor:
        "#101828",

      shadowOffset: {
        width: 0,

        height: 4,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.05
          : 0,

      shadowRadius:
        14,

      elevation:
        3,
    },

    /* ---------------------------------------------------------------------- */
    /* Avatar                                                                 */
    /* ---------------------------------------------------------------------- */

    avatarSection: {
      marginBottom:
        20,
    },

    avatarPickerRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        14,
    },

    avatarPreviewWrap: {
      width:
        82,

      height:
        82,

      overflow:
        "visible",

      position:
        "relative",
    },

    avatarPreviewPressed: {
      opacity:
        0.88,
    },

    avatarPreviewLoading: {
      opacity:
        0.72,
    },

    avatarPreview: {
      width:
        "100%",

      height:
        "100%",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.10)",
    },

    avatarPlaceholder: {
      width:
        "100%",

      height:
        "100%",

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1,33,105,0.06)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.10)",
    },

    avatarBadge: {
      position:
        "absolute",

      right:
        -2,

      bottom:
        -2,

      width:
        26,

      height:
        26,

      borderRadius:
        13,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        KEPLER_RED,

      borderWidth:
        2,

      borderColor:
        SURFACE,
    },

    avatarBadgeLoading: {
      backgroundColor:
        KEPLER_NAVY,
    },

    avatarCopy: {
      flex: 1,

      minWidth:
        0,
    },

    avatarTitle: {
      ...typography.body,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "600",
    },

    avatarHelper: {
      ...typography.caption,

      marginTop:
        4,

      color:
        TEXT_SECONDARY,

      lineHeight:
        18,
    },

    avatarRemove: {
      ...typography.caption,

      marginTop:
        8,

      color:
        KEPLER_RED,

      fontWeight:
        "600",
    },

    /* ---------------------------------------------------------------------- */
    /* Fields                                                                 */
    /* ---------------------------------------------------------------------- */

    field: {
      marginBottom:
        18,
    },

    label: {
      ...typography.metadata,

      marginBottom:
        8,

      color:
        "#475467",

      fontWeight:
        "700",

      letterSpacing:
        0.75,
    },

    inputContainer: {
      minHeight:
        54,

      flexDirection:
        "row",

      alignItems:
        "center",

      borderWidth:
        1,

      borderColor:
        BORDER,

      backgroundColor:
        SURFACE,
    },

    inputIcon: {
      marginLeft:
        15,

      marginRight:
        10,
    },

    input: {
      ...typography.bodyLarge,

      flex: 1,

      minHeight:
        52,

      paddingVertical:
        13,

      paddingRight:
        14,

      color:
        TEXT_PRIMARY,
    },

    /* ---------------------------------------------------------------------- */
    /* Status                                                                 */
    /* ---------------------------------------------------------------------- */

    statusSection: {
      marginTop:
        2,
    },

    statusHelper: {
      ...typography.caption,

      marginTop:
        -2,

      marginBottom:
        12,

      color:
        TEXT_SECONDARY,
    },

    statusRow: {
      flexDirection:
        "row",

      flexWrap:
        "wrap",

      gap:
        8,
    },

    statusChip: {
      minHeight:
        42,

      paddingHorizontal:
        13,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        7,

      borderWidth:
        1,

      borderColor:
        "transparent",

      borderRadius:
        100,

      backgroundColor:
        "transparent",
    },

    statusChipSelected: {
      borderColor:
        "transparent",

      backgroundColor:
        "transparent",

      shadowColor:
        "transparent",

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.12
          : 0,

      shadowRadius:
        7,

      elevation:
        2,
    },

    statusChipPressed: {
      opacity:
        0.76,

      transform: [
        {
          scale:
            0.98,
        },
      ],
    },

    statusChipText: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight:
        "600",
    },

    statusChipTextSelected: {
      transform: [
        {
          scale:
            1.2,
        },
      ],
    },

    statusIconSelected: {
      transform: [
        {
          scale:
            1.2,
        },
      ],
    },

    /* ---------------------------------------------------------------------- */
    /* Error                                                                  */
    /* ---------------------------------------------------------------------- */

    errorBanner: {
      minHeight:
        48,

      marginTop:
        16,

      paddingHorizontal:
        12,

      paddingVertical:
        10,

      flexDirection:
        "row",

      alignItems:
        "center",

      borderRadius:
        14,

      backgroundColor:
        "rgba(227,24,55,0.07)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(227,24,55,0.15)",
    },

    errorIcon: {
      width:
        30,

      height:
        30,

      borderRadius:
        10,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginRight:
        8,

      backgroundColor:
        "rgba(227,24,55,0.07)",
    },

    errorText: {
      ...typography.body,

      flex:
        1,

      color:
        "#B42318",
    },

    /* ---------------------------------------------------------------------- */
    /* Save                                                                   */
    /* ---------------------------------------------------------------------- */

    saveButton: {
      height:
        52,

      marginTop:
        20,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        8,

      backgroundColor:
        KEPLER_NAVY,

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width: 0,

        height: 6,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.17
          : 0,

      shadowRadius:
        12,

      elevation:
        4,
    },

    saveButtonPressed: {
      opacity:
        0.9,

      transform: [
        {
          scale:
            0.99,
        },
      ],
    },

    saveButtonDisabled: {
      opacity:
        0.58,
    },

    saveButtonText: {
      ...typography.bodyMedium,

      color:
        "#FFFFFF",

      fontWeight:
        "600",
    },

    syncHint: {
      ...typography.caption,

      marginTop:
        12,

      paddingHorizontal:
        8,

      textAlign:
        "center",

      color:
        TEXT_MUTED,

      lineHeight:
        17,
    },
  });