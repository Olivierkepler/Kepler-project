import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Modal,
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
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  typography,
} from "../../../theme/colors";

import type {
  Project,
} from "../../../types/project";

import type {
  RemoteFeedPost,
} from "../../../services/api/feedPosts";

import {
  publishProjectFeedPost,
} from "../../../services/feed/publishProjectFeedPost";

import {
  ensureRemoteProject,
} from "../../../services/sync/projectBootstrap";

import type {
  ComposerLaunchMode,
} from "./HomeFeedComposer";

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY = "#012169";

/**
 * CreateProjectUpdateModal lives at:
 *
 * src/components/home/feed/
 *
 * ../../../../assets resolves to the
 * project-level assets folder.
 */
const UPDATE_BACKGROUND =
  require("../../../../assets/bglog.png");

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type LocalMedia = {
  id: string;

  type: "image" | "video";

  uri: string;
};

type Props = {
  visible: boolean;

  launchMode: ComposerLaunchMode;

  projects: readonly Project[];

  ownerUid?: string;

  onClose: () => void;

  onPublished: (
    post: RemoteFeedPost,
  ) => void;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function createLocalPostId(): string {
  return `feed-post-${Date.now()}-${Math.floor(
    Math.random() * 100000,
  )}`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CreateProjectUpdateModal({
  visible,
  launchMode,
  projects,
  ownerUid,
  onClose,
  onPublished,
}: Props) {
  const insets =
    useSafeAreaInsets();

  const [
    text,
    setText,
  ] = useState("");

  const [
    selectedProjectId,
    setSelectedProjectId,
  ] = useState<string | null>(
    null,
  );

  const [
    media,
    setMedia,
  ] = useState<LocalMedia[]>(
    [],
  );

  const [
    projectPickerOpen,
    setProjectPickerOpen,
  ] = useState(false);

  const [
    posting,
    setPosting,
  ] = useState(false);

  const [
    localPostId,
    setLocalPostId,
  ] = useState(
    () => createLocalPostId(),
  );

  const selectedProject =
    useMemo(
      () =>
        projects.find(
          (project) =>
            project.id ===
            selectedProjectId,
        ) ?? null,
      [
        projects,
        selectedProjectId,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Lifecycle                                                                */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!visible) {
      setText("");

      setSelectedProjectId(
        null,
      );

      setMedia([]);

      setProjectPickerOpen(
        false,
      );

      setPosting(false);

      setLocalPostId(
        createLocalPostId(),
      );

      return;
    }

    if (
      projects.length === 1 &&
      !selectedProjectId
    ) {
      setSelectedProjectId(
        projects[0]!.id,
      );
    }
  }, [
    visible,
    projects,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (
      launchMode === "photo"
    ) {
      void pickPhoto();

      return;
    }

    if (
      launchMode === "video"
    ) {
      void pickVideo();
    }
  }, [
    visible,
    launchMode,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Derived                                                                  */
  /* ------------------------------------------------------------------------ */

  const trimmedText =
    text.trim();

  const canPost =
    Boolean(
      selectedProjectId,
    ) &&
    (
      trimmedText.length > 0 ||
      media.length > 0
    ) &&
    !posting;

  /* ------------------------------------------------------------------------ */
  /* Post                                                                     */
  /* ------------------------------------------------------------------------ */

  const handlePost =
    async () => {
      if (
        !canPost ||
        !selectedProjectId ||
        !ownerUid
      ) {
        return;
      }

      setPosting(true);

      try {
        const remoteProjectId =
          await ensureRemoteProject(
            ownerUid,
            selectedProjectId,
          );

        if (
          !remoteProjectId
        ) {
          throw new Error(
            "This project is not connected to the cloud yet.",
          );
        }

        const created =
          await publishProjectFeedPost(
            {
              remoteProjectId,

              localPostId,

              text:
                trimmedText,

              media:
                media.map(
                  (item) => ({
                    localMediaId:
                      item.id,

                    type:
                      item.type,

                    uri:
                      item.uri,
                  }),
                ),
            },
          );

        onPublished(
          created,
        );

        onClose();
      } catch (
        error
      ) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to publish project update.";

        Alert.alert(
          "Unable to post update",
          message,
        );
      } finally {
        setPosting(
          false,
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Photo                                                                    */
  /* ------------------------------------------------------------------------ */

  const pickPhoto =
    async () => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (
        !permission.granted
      ) {
        Alert.alert(
          "Photo library permission needed",
          "Allow photo library access to attach a project photo.",
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync(
          {
            mediaTypes: [
              "images",
            ],

            quality:
              0.8,

            allowsEditing:
              false,
          },
        );

      if (
        !result.canceled &&
        result.assets[0]?.uri
      ) {
        setMedia(
          (current) => [
            ...current,

            {
              id:
                `local-photo-${Date.now()}`,

              type:
                "image",

              uri:
                result.assets[0].uri,
            },
          ],
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Video                                                                    */
  /* ------------------------------------------------------------------------ */

  const pickVideo =
    async () => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (
        !permission.granted
      ) {
        Alert.alert(
          "Photo library permission needed",
          "Allow photo library access to attach a project video.",
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync(
          {
            mediaTypes: [
              "videos",
            ],

            quality:
              0.8,

            allowsEditing:
              false,
          },
        );

      if (
        !result.canceled &&
        result.assets[0]?.uri
      ) {
        setMedia(
          (current) => [
            ...current,

            {
              id:
                `local-video-${Date.now()}`,

              type:
                "video",

              uri:
                result.assets[0].uri,
            },
          ],
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <Modal
      visible={
        visible
      }
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={
        onClose
      }
    >
      <View style={styles.modalRoot}>
        <ImageBackground
          source={
            UPDATE_BACKGROUND
          }
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          imageStyle={
            styles.backgroundImage
          }
        />

        <View
          style={[
            styles.contentRoot,

            {
              paddingTop:
                Math.max(
                  insets.top,
                  10,
                ),

              paddingBottom:
                Math.max(
                  insets.bottom,
                  12,
                ),
            },
          ]}
        >
        {/* -------------------------------------------------------------- */}
        {/* Header                                                         */}
        {/* -------------------------------------------------------------- */}

        <View
          style={
            styles.header
          }
        >
          <Pressable
            onPress={
              onClose
            }
            disabled={
              posting
            }
            accessibilityRole="button"
            accessibilityLabel="Cancel create update"
            hitSlop={
              10
            }
            style={
              styles.headerAction
            }
          >
            <Text
              style={
                styles.cancel
              }
            >
              Cancel
            </Text>
          </Pressable>

          <Text
            style={
              styles.title
            }
          >
            Create update
          </Text>

          <Pressable
            onPress={() => {
              void handlePost();
            }}
            disabled={
              !canPost
            }
            accessibilityRole="button"
            accessibilityLabel={
              posting
                ? "Posting update"
                : "Post update"
            }
            accessibilityState={{
              disabled:
                !canPost,
            }}
            hitSlop={
              10
            }
            style={[
              styles.headerAction,

              styles.headerActionRight,

              !canPost &&
                styles.postDisabled,
            ]}
          >
            {posting ? (
              <ActivityIndicator
                size="small"
                color={
                  KEPLER_NAVY
                }
              />
            ) : (
              <Text
                style={[
                  styles.post,

                  canPost &&
                    styles.postEnabled,
                ]}
              >
                Post
              </Text>
            )}
          </Pressable>
        </View>

        {/* -------------------------------------------------------------- */}
        {/* Content                                                        */}
        {/* -------------------------------------------------------------- */}

        <ScrollView
          style={
            styles.scroll
          }
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* ------------------------------------------------------------ */}
          {/* Project                                                      */}
          {/* ------------------------------------------------------------ */}

          <Pressable
            onPress={() =>
              setProjectPickerOpen(
                (open) =>
                  !open,
              )
            }
            disabled={
              posting
            }
            accessibilityRole="button"
            accessibilityLabel="Select project"
            style={({
              pressed,
            }) => [
              styles.fieldRow,

              pressed &&
                styles.pressed,
            ]}
          >
            <View>
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Project
              </Text>

              <Text
                style={
                  styles.fieldValue
                }
                numberOfLines={
                  1
                }
              >
                {selectedProject?.name ??
                  "Select project"}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={
                17
              }
              color="#C5CDD8"
            />
          </Pressable>

          {/* ------------------------------------------------------------ */}
          {/* Project Picker                                               */}
          {/* ------------------------------------------------------------ */}

          {projectPickerOpen ? (
            <View
              style={
                styles.projectList
              }
            >
              {projects.map(
                (
                  project,
                ) => {
                  const selected =
                    project.id ===
                    selectedProjectId;

                  return (
                    <Pressable
                      key={
                        project.id
                      }
                      onPress={() => {
                        setSelectedProjectId(
                          project.id,
                        );

                        setProjectPickerOpen(
                          false,
                        );
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${project.name}`}
                      style={({
                        pressed,
                      }) => [
                        styles.projectOption,

                        selected &&
                          styles.projectOptionSelected,

                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      <Text
                        style={
                          styles.projectOptionText
                        }
                        numberOfLines={
                          1
                        }
                      >
                        {
                          project.name
                        }
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
          ) : null}

          {/* ------------------------------------------------------------ */}
          {/* Update Text                                                  */}
          {/* ------------------------------------------------------------ */}

          <TextInput
            style={
              styles.input
            }
            value={
              text
            }
            onChangeText={
              setText
            }
            placeholder="Share an update..."
            placeholderTextColor="#98A2B3"
            multiline
            textAlignVertical="top"
            editable={
              !posting
            }
            accessibilityLabel="Update text"
          />

          {/* ------------------------------------------------------------ */}
          {/* Media                                                        */}
          {/* ------------------------------------------------------------ */}

          {media.length >
          0 ? (
            <View
              style={
                styles.mediaPreview
              }
            >
              {media.map(
                (
                  item,
                ) => (
                  <View
                    key={
                      item.id
                    }
                    style={
                      styles.mediaTile
                    }
                  >
                    {item.type ===
                    "image" ? (
                      <Image
                        source={{
                          uri:
                            item.uri,
                        }}
                        style={
                          styles.mediaImage
                        }
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={
                          styles.videoPlaceholder
                        }
                      >
                        <Ionicons
                          name="play-circle"
                          size={
                            36
                          }
                          color={
                            KEPLER_NAVY
                          }
                        />

                        <Text
                          style={
                            styles.videoLabel
                          }
                        >
                          Video selected
                        </Text>
                      </View>
                    )}

                    <Pressable
                      onPress={() =>
                        setMedia(
                          (
                            current,
                          ) =>
                            current.filter(
                              (
                                entry,
                              ) =>
                                entry.id !==
                                item.id,
                            ),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Remove media"
                      style={
                        styles.removeMedia
                      }
                    >
                      <Ionicons
                        name="close"
                        size={
                          14
                        }
                        color="#FFFFFF"
                      />
                    </Pressable>
                  </View>
                ),
              )}
            </View>
          ) : null}

          {/* ------------------------------------------------------------ */}
          {/* Add To Update                                                */}
          {/* ------------------------------------------------------------ */}

          <Text
            style={
              styles.sectionLabel
            }
          >
            ADD TO UPDATE
          </Text>

          <View
            style={
              styles.addRow
            }
          >
            <AddAction
              icon="image-outline"
              label="Photo / video"
              onPress={
                pickPhoto
              }
              disabled={
                posting
              }
            />

            <AddAction
              icon="business-outline"
              label="Project"
              onPress={() =>
                setProjectPickerOpen(
                  true,
                )
              }
              disabled={
                posting
              }
            />

            <AddAction
              icon="location-outline"
              label="Location"
              disabled
            />
          </View>
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Add Action                                                                 */
/* -------------------------------------------------------------------------- */

function AddAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;

  label: string;

  onPress?: () => void;

  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={
        onPress
      }
      disabled={
        disabled ||
        !onPress
      }
      accessibilityRole="button"
      accessibilityLabel={
        label
      }
      accessibilityState={{
        disabled:
          disabled ||
          !onPress,
      }}
      style={({
        pressed,
      }) => [
        styles.addAction,

        (
          disabled ||
          !onPress
        ) &&
          styles.addActionDisabled,

        pressed &&
          onPress &&
          !disabled &&
          styles.pressed,
      ]}
    >
      <Ionicons
        name={
          icon
        }
        size={
          18
        }
        color={
          disabled ||
          !onPress
            ? "#C5CDD8"
            : KEPLER_NAVY
        }
      />

      <Text
        style={[
          styles.addActionLabel,

          (
            disabled ||
            !onPress
          ) &&
            styles.addActionLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    modalRoot: {
      flex: 1,
      backgroundColor: "#F8FAFC",
      overflow: "hidden",
    },

    backgroundImage: {
      width: "100%",
      height: "100%",
    },

    contentRoot: {
      flex: 1,
    },

    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    header: {
      minHeight:
        52,

      paddingHorizontal:
        16,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      borderBottomWidth:
        StyleSheet.hairlineWidth,

      borderBottomColor:
        "rgba(15,23,42,0.07)",
    },

    headerAction: {
      minWidth:
        64,

      minHeight:
        36,

      justifyContent:
        "center",
    },

    headerActionRight: {
      alignItems:
        "flex-end",
    },

    cancel: {
      ...typography.bodyMedium,

      color:
        "#667085",

      fontSize:
        16,
    },

    title: {
      ...typography.bodyLarge,

      color:
        "#101828",

      fontWeight:
        "600",

      fontSize:
        17,
    },

    post: {
      ...typography.bodyMedium,

      color:
        "#C5CDD8",

      fontWeight:
        "600",

      fontSize:
        16,
    },

    postEnabled: {
      color:
        KEPLER_NAVY,
    },

    postDisabled: {
      opacity:
        1,
    },

    /* ---------------------------------------------------------------------- */
    /* Scroll                                                                 */
    /* ---------------------------------------------------------------------- */

    scroll: {
      flex:
        1,
    },

    scrollContent: {
      paddingHorizontal:
        20,

      paddingTop:
        16,

      paddingBottom:
        28,
    },

    /* ---------------------------------------------------------------------- */
    /* Project                                                                */
    /* ---------------------------------------------------------------------- */

    fieldRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      minHeight:
        52,

      paddingHorizontal:
        14,

      borderRadius:
        16,

      backgroundColor:
        "rgba(255,255,255,0.90)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(15,23,42,0.07)",

      marginBottom:
        10,
    },

    fieldLabel: {
      ...typography.caption,

      color:
        "#667085",

      fontSize:
        12,
    },

    fieldValue: {
      ...typography.bodyMedium,

      color:
        "#101828",

      marginTop:
        2,

      fontWeight:
        "600",
    },

    projectList: {
      marginBottom:
        12,

      borderRadius:
        14,

      overflow:
        "hidden",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(15,23,42,0.08)",
    },

    projectOption: {
      minHeight:
        48,

      paddingHorizontal:
        14,

      justifyContent:
        "center",

      backgroundColor:
        "rgba(255,255,255,0.84)",

      borderBottomWidth:
        StyleSheet.hairlineWidth,

      borderBottomColor:
        "rgba(15,23,42,0.06)",
    },

    projectOptionSelected: {
      backgroundColor:
        "rgba(1,33,105,0.06)",
    },

    projectOptionText: {
      ...typography.bodyMedium,

      color:
        "#101828",
    },

    /* ---------------------------------------------------------------------- */
    /* Input                                                                  */
    /* ---------------------------------------------------------------------- */

    input: {
      ...typography.body,

      minHeight:
        112,

      paddingHorizontal:
        14,

      paddingVertical:
        12,

      borderRadius:
        16,

      backgroundColor:
        "rgba(255,255,255,0.92)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(15,23,42,0.07)",

      color:
        "#101828",

      fontSize:
        15,

      lineHeight:
        21,

      marginBottom:
        10,
    },

    /* ---------------------------------------------------------------------- */
    /* Media                                                                  */
    /* ---------------------------------------------------------------------- */

    mediaPreview: {
      flexDirection:
        "row",

      flexWrap:
        "wrap",

      gap:
        8,

      marginBottom:
        12,
    },

    mediaTile: {
      width:
        96,

      height:
        96,

      borderRadius:
        12,

      overflow:
        "hidden",

      backgroundColor:
        "rgba(15,23,42,0.06)",
    },

    mediaImage: {
      width:
        "100%",

      height:
        "100%",
    },

    videoPlaceholder: {
      flex:
        1,

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        4,

      backgroundColor:
        "rgba(1,33,105,0.06)",
    },

    videoLabel: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontSize:
        11,

      fontWeight:
        "600",
    },

    removeMedia: {
      position:
        "absolute",

      top:
        6,

      right:
        6,

      width:
        22,

      height:
        22,

      borderRadius:
        11,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(15,23,42,0.55)",
    },

    /* ---------------------------------------------------------------------- */
    /* Add to update                                                          */
    /* ---------------------------------------------------------------------- */

    sectionLabel: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontSize:
        10.5,

      letterSpacing:
        1,

      fontWeight:
        "700",

      marginBottom:
        10,
    },

    addRow: {
      flexDirection:
        "row",

      gap:
        8,
    },

    addAction: {
      flex:
        1,

      minHeight:
        72,

      borderRadius:
        14,

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        6,

      backgroundColor:
        "rgba(255,255,255,0.84)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(15,23,42,0.08)",
    },

    addActionDisabled: {
      opacity:
        0.55,
    },

    addActionLabel: {
      ...typography.caption,

      color:
        KEPLER_NAVY,

      fontWeight:
        "600",

      textAlign:
        "center",

      fontSize:
        11,
    },

    addActionLabelDisabled: {
      color:
        "#C5CDD8",
    },

    pressed: {
      opacity:
        0.68,
    },
  });