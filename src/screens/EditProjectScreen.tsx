import React, {
  useCallback,
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

import {
  useFocusEffect,
} from "@react-navigation/native";

import type {
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";

import type {
  RootStackParamList,
} from "../navigation/types";

import {
  getRemoteProjectId,
} from "../store/projectCloudMappings";

import {
  getProjectById,
  archiveProject,
  restoreProject,
  updateProject,
  isProjectArchived,
} from "../store/projects";

import {
  markProjectUpdatePending,
} from "../store/projectUpdateSyncState";

import {
  syncProjectUpdateToCloud,
} from "../services/sync/projectUpdate";

import type {
  ProjectStatus,
} from "../types/project";

import {
  typography,
} from "../theme/colors";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Props =
  NativeStackScreenProps<
    RootStackParamList,
    "EditProject"
  >;

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY =
  "#012169";

const KEPLER_RED =
  "#E31837";

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

const PROJECT_BACKGROUND =
  require("../../assets/bgproject.png");

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const PROJECT_STATUSES:
  readonly ProjectStatus[] = [
    "active",
    "planning",
    "completed",
    "on-hold",
  ];

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

export default function EditProjectScreen({
  route,
  navigation,
}: Props) {
  const { user } =
    useAuth();

  const projectId =
    route.params.projectId;

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    notFound,
    setNotFound,
  ] = useState(false);

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
    "active",
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
    archiving,
    setArchiving,
  ] = useState(false);

  const [
    archivedAt,
    setArchivedAt,
  ] = useState<
    string | null
  >(null);

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
        archiving ||
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
  /* Load                                                                     */
  /* ------------------------------------------------------------------------ */

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setLoading(false);
        setNotFound(true);

        return;
      }

      const ownerUid =
        user.uid;

      let active =
        true;

      async function load() {
        setLoading(true);

        const project =
          await getProjectById(
            ownerUid,
            projectId,
          );

        if (!active) {
          return;
        }

        if (!project) {
          setNotFound(true);
          setLoading(false);

          return;
        }

        setName(
          project.name,
        );

        setLocation(
          project.location,
        );

        setStatus(
          project.status,
        );

        setAvatarUri(
          project.avatarUri ??
            null,
        );

        setArchivedAt(
          typeof project.archivedAt ===
            "string"
            ? project.archivedAt
            : null,
        );

        setNotFound(false);
        setLoading(false);
      }

      void load();

      return () => {
        active = false;
      };
    }, [
      projectId,
      user?.uid,
    ]),
  );

  /* ------------------------------------------------------------------------ */
  /* Save                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleSave =
    async () => {
      if (
        !user?.uid ||
        saving ||
        archiving
      ) {
        return;
      }

      const trimmedName =
        name.trim();

      const trimmedLocation =
        location.trim();

      if (
        !trimmedName ||
        !trimmedLocation
      ) {
        setError(
          "Name and location are required.",
        );

        return;
      }

      setError(null);
      setSaving(true);

      try {
        const ownerUid =
          user.uid;

        const updated =
          await updateProject(
            ownerUid,
            projectId,
            {
              name:
                trimmedName,

              location:
                trimmedLocation,

              status,

              avatarUri,
            },
          );

        if (!updated) {
          setError(
            "Project not found.",
          );

          return;
        }

        const remoteProjectId =
          await getRemoteProjectId(
            ownerUid,
            projectId,
          );

        /**
         * Local save already succeeded.
         *
         * Mark cloud update pending and
         * perform sync without blocking
         * navigation on network latency.
         */
        if (
          remoteProjectId
        ) {
          await markProjectUpdatePending(
            ownerUid,
            projectId,
          );

          void syncProjectUpdateToCloud(
            ownerUid,
            projectId,
          ).then(
            (result) => {
              if (
                !result.synced
              ) {
                Alert.alert(
                  "Saved on this device",
                  "Cloud update is pending.",
                );
              }
            },
          );
        }

        navigation.goBack();
      } catch {
        setError(
          "Unable to save project.",
        );
      } finally {
        setSaving(false);
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Archive / Restore                                                        */
  /* ------------------------------------------------------------------------ */

  const isArchived =
    isProjectArchived({
      archivedAt,
    });

  const handleArchiveProject =
    async () => {
      if (
        !user?.uid ||
        saving ||
        archiving
      ) {
        return;
      }

      setArchiving(true);
      setError(null);

      try {
        const updated =
          await archiveProject(
            user.uid,
            projectId,
          );

        if (!updated) {
          setError(
            "Project not found.",
          );

          return;
        }

        navigation.goBack();
      } catch {
        setError(
          "Unable to archive project.",
        );
      } finally {
        setArchiving(false);
      }
    };

  const confirmArchiveProject =
    () => {
      if (
        saving ||
        archiving
      ) {
        return;
      }

      Alert.alert(
        "Archive project?",
        "Archived projects are removed from your active workspace but all project data is preserved. You can restore this project later.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Archive",
            style:
              "destructive",
            onPress: () => {
              void handleArchiveProject();
            },
          },
        ],
      );
    };

  const handleRestoreProject =
    async () => {
      if (
        !user?.uid ||
        saving ||
        archiving
      ) {
        return;
      }

      setArchiving(true);
      setError(null);

      try {
        const updated =
          await restoreProject(
            user.uid,
            projectId,
          );

        if (!updated) {
          setError(
            "Project not found.",
          );

          return;
        }

        navigation.goBack();
      } catch {
        setError(
          "Unable to restore project.",
        );
      } finally {
        setArchiving(false);
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                  */
  /* ------------------------------------------------------------------------ */

  if (loading) {
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
          resizeMode="cover"
          style={
            styles.background
          }
        >
          <View
            style={
              styles.loadingContainer
            }
          >
            <View
              style={
                styles.loadingIndicator
              }
            >
              <ActivityIndicator
                size="small"
                color={
                  KEPLER_NAVY
                }
              />
            </View>

            <Text
              style={
                styles.loadingText
              }
            >
              Loading project…
            </Text>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Not Found                                                                */
  /* ------------------------------------------------------------------------ */

  if (notFound) {
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
          resizeMode="cover"
          style={
            styles.background
          }
        >
          <View
            style={
              styles.notFoundScreen
            }
          >
            <View
              style={
                styles.topBar
              }
            >
              <Pressable
                style={({
                  pressed,
                }) => [
                  styles.backButton,

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

              <Text
                style={
                  styles.topBarTitle
                }
              >
                Edit Project.
              </Text>

              <View
                style={
                  styles.topBarPlaceholder
                }
              />
            </View>

            <View
              style={
                styles.emptyState
              }
            >
              <View
                style={
                  styles.emptyIcon
                }
              >
                <Ionicons
                  name="folder-open-outline"
                  size={26}
                  color={
                    KEPLER_NAVY
                  }
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                Project not found
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                This project may have been removed or is no longer available on this device.
              </Text>

              <Pressable
                style={({
                  pressed,
                }) => [
                  styles.emptyButton,

                  pressed &&
                    styles.emptyButtonPressed,
                ]}
                onPress={() =>
                  navigation.goBack()
                }
              >
                <Text
                  style={
                    styles.emptyButtonText
                  }
                >
                  Go back
                </Text>
              </Pressable>
            </View>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

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
        resizeMode="cover"
        style={
          styles.background
        }
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
                styles.backButton,

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

            <Text
              style={
                styles.topBarTitle
              }
            >
              Edit Project.
            </Text>

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
            style={
              styles.intro
            }
          >
            <Text
              style={
                styles.introTitle
              }
            >
              Project details
            </Text>

            <Text
              style={
                styles.introText
              }
            >
              Update the information your team uses to identify and organize this project.
            </Text>
          </View>

          {/* ================================================================== */}
          {/* Form                                                               */}
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
                      !archiving &&
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
                    archiving ||
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
                      archiving ||
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
                      : avatarUri
                        ? "Change the image used to identify this project."
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
                        archiving ||
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
                  placeholder="Project name"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving &&
                    !archiving
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
                  placeholder="Project location"
                  placeholderTextColor={
                    TEXT_MUTED
                  }
                  editable={
                    !saving &&
                    !archiving
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
                Update the phase that best reflects the project today.
              </Text>

              <View
                style={
                  styles.statusRow
                }
              >
                {PROJECT_STATUSES.map(
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
                            !archiving &&
                            styles.statusChipPressed,
                        ]}
                        onPress={() =>
                          setStatus(
                            option,
                          )
                        }
                        disabled={
                          saving ||
                          archiving
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
                !archiving &&
                styles.saveButtonPressed,

              (saving ||
                archiving) &&
                styles.saveButtonDisabled,
            ]}
            onPress={() => {
              void handleSave();
            }}
            disabled={
              saving ||
              archiving
            }
            accessibilityRole="button"
            accessibilityLabel="Save project"
            accessibilityState={{
              disabled:
                saving ||
                archiving,

              busy:
                saving,
            }}
          >
            {saving ? (
              <>
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Saving…
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Save Changes
                </Text>

                <Ionicons
                  name="checkmark"
                  size={19}
                  color="#FFFFFF"
                />
              </>
            )}
          </Pressable>

          <Pressable
            style={({
              pressed,
            }) => [
              styles.archiveButton,

              pressed &&
                !saving &&
                !archiving &&
                styles.archiveButtonPressed,

              (saving ||
                archiving) &&
                styles.archiveButtonDisabled,
            ]}
            onPress={() => {
              if (
                isArchived
              ) {
                void handleRestoreProject();
              } else {
                confirmArchiveProject();
              }
            }}
            disabled={
              saving ||
              archiving
            }
            accessibilityRole="button"
            accessibilityLabel={
              isArchived
                ? "Restore project"
                : "Archive project"
            }
            accessibilityState={{
              disabled:
                saving ||
                archiving,

              busy:
                archiving,
            }}
          >
            {archiving ? (
              <>
                <ActivityIndicator
                  size="small"
                  color="#475467"
                />

                <Text
                  style={
                    styles.archiveButtonText
                  }
                >
                  {isArchived
                    ? "Restoring…"
                    : "Archiving…"}
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name={
                    isArchived
                      ? "refresh-outline"
                      : "archive-outline"
                  }
                  size={18}
                  color="#475467"
                />

                <Text
                  style={
                    styles.archiveButtonText
                  }
                >
                  {isArchived
                    ? "Restore Project"
                    : "Archive Project"}
                </Text>
              </>
            )}
          </Pressable>

          <Text
            style={
              styles.syncHint
            }
          >
            Changes are saved locally first and synchronized to the cloud when available.
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
        "rgba(255,255,255,0.72)",

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
          ? 0.05
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

    topBarTitle: {
      ...typography.bodyLarge,

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
      alignItems:
        "center",

      justifyContent:
        "center",

      marginBottom:
        22,

      paddingHorizontal:
        8,
    },

    introTitle: {
      ...typography.title,

      color:
        TEXT_PRIMARY,

      textAlign:
        "center",

      letterSpacing:
        -0.45,
    },

    introText: {
      ...typography.body,

      maxWidth:
        390,

      marginTop:
        6,

      color:
        TEXT_SECONDARY,

      textAlign:
        "center",

      lineHeight:
        21,
    },

    /* ---------------------------------------------------------------------- */
    /* Form                                                                   */
    /* ---------------------------------------------------------------------- */

    formCard: {
      padding:
        16,

      backgroundColor:
        "rgba(255,255,255,0.38)",

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
          ? 0.045
          : 0,

      shadowRadius:
        14,

      elevation:
        2,
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

      flex:
        1,

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
    },

    statusChipPressed: {
      opacity:
        0.7,

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
            1.15,
        },
      ],

      fontWeight:
        "700",
    },

    statusIconSelected: {
      transform: [
        {
          scale:
            1.18,
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
      minHeight:
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
        0.62,
    },

    archiveButton: {
      minHeight:
        48,

      marginTop:
        14,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        8,

      backgroundColor:
        "rgba(255,255,255,0.55)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(102,112,133,0.20)",
    },

    archiveButtonPressed: {
      opacity:
        0.86,
    },

    archiveButtonDisabled: {
      opacity:
        0.62,
    },

    archiveButtonText: {
      ...typography.body,

      color:
        "#475467",

      fontWeight:
        "600",
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

    /* ---------------------------------------------------------------------- */
    /* Loading                                                                */
    /* ---------------------------------------------------------------------- */

    loadingContainer: {
      flex: 1,

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal:
        24,
    },

    loadingIndicator: {
      width:
        48,

      height:
        48,

      borderRadius:
        24,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(255,255,255,0.80)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",
    },

    loadingText: {
      ...typography.caption,

      marginTop:
        10,

      color:
        TEXT_SECONDARY,
    },

    /* ---------------------------------------------------------------------- */
    /* Not Found                                                              */
    /* ---------------------------------------------------------------------- */

    notFoundScreen: {
      flex: 1,

      paddingHorizontal:
        20,
    },

    emptyState: {
      flex: 1,

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal:
        26,

      paddingBottom:
        80,
    },

    emptyIcon: {
      width:
        58,

      height:
        58,

      borderRadius:
        18,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginBottom:
        16,

      backgroundColor:
        "rgba(1,33,105,0.07)",
    },

    emptyTitle: {
      ...typography.title,

      color:
        TEXT_PRIMARY,

      textAlign:
        "center",
    },

    emptyText: {
      ...typography.body,

      maxWidth:
        320,

      marginTop:
        7,

      color:
        TEXT_SECONDARY,

      textAlign:
        "center",

      lineHeight:
        21,
    },

    emptyButton: {
      minWidth:
        120,

      height:
        44,

      marginTop:
        18,

      paddingHorizontal:
        18,

      borderRadius:
        14,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        KEPLER_NAVY,
    },

    emptyButtonPressed: {
      opacity:
        0.86,

      transform: [
        {
          scale:
            0.98,
        },
      ],
    },

    emptyButtonText: {
      ...typography.bodyMedium,

      color:
        "#FFFFFF",
    },
  });