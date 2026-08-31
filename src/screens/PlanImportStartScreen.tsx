import React, { useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Ionicons from "@expo/vector-icons/Ionicons";

import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { useAuth } from "../auth/AuthProvider";

import type { RootStackParamList } from "../navigation/types";

import {
  createLocalPlanImportFileId,
  createPlanImport,
} from "../store/planImports";

import {
  syncPlanImportToCloud,
  type PlanImportUploadProgress,
} from "../services/sync/planImportUpload";

import { typography } from "../theme/colors";

import type {
  PlanImportFile,
  PlanImportFileType,
} from "../types/planImport";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "PlanImportStart"
>;

type SelectedFile = PlanImportFile;

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";

const BORDER = "rgba(1,33,105,0.10)";
const CARD_BACKGROUND = "rgba(255,255,255,0.82)";

const SCREEN_BACKGROUND = require("../../assets/bgproject.png");

/* -------------------------------------------------------------------------- */
/* File constraints                                                           */
/* -------------------------------------------------------------------------- */

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

/**
 * Matches backend PLAN_IMPORT_MAX_FILE_BYTES.
 */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const MAX_FILES = 10;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function classifyMimeType(
  mimeType?: string,
  name?: string,
): PlanImportFileType {
  const mime = (mimeType ?? "").toLowerCase();
  const lowerName = (name ?? "").toLowerCase();

  if (
    mime === "application/pdf" ||
    lowerName.endsWith(".pdf")
  ) {
    return "pdf";
  }

  if (
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png")
  ) {
    return "image";
  }

  return "other";
}

function isAcceptedFile(
  mimeType?: string,
  name?: string,
): boolean {
  return classifyMimeType(mimeType, name) !== "other";
}

function formatFileSize(
  size?: number,
): string {
  if (
    size == null ||
    !Number.isFinite(size) ||
    size < 0
  ) {
    return "Size unknown";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(
    size /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function fileTypeLabel(
  type: PlanImportFileType,
): string {
  switch (type) {
    case "pdf":
      return "PDF";

    case "image":
      return "Image";

    default:
      return "File";
  }
}

type IncomingFile = {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

function generatePhotoFileName(
  sequence: number,
  mimeType?: string,
): string {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(
      now.getMonth() + 1,
    ).padStart(2, "0"),
    String(
      now.getDate(),
    ).padStart(2, "0"),
  ].join("-");

  const ext =
    (mimeType ?? "").toLowerCase() ===
    "image/png"
      ? "png"
      : "jpg";

  return `photo-${datePart}-${String(
    sequence,
  ).padStart(3, "0")}.${ext}`;
}

async function resolveFileSize(
  uri: string,
  knownSize?: number,
): Promise<number | null> {
  if (
    typeof knownSize === "number" &&
    Number.isFinite(knownSize) &&
    knownSize > 0
  ) {
    return knownSize;
  }

  try {
    const file = new File(uri);

    if (!file.exists) {
      return null;
    }

    const info = file.info();

    if (
      typeof info.size === "number" &&
      Number.isFinite(info.size) &&
      info.size > 0
    ) {
      return info.size;
    }
  } catch {
    // Fall through.
  }

  return null;
}

function mergeIncomingFiles(
  existing: SelectedFile[],
  incoming: IncomingFile[],
): {
  nextFiles: SelectedFile[];
  error: string | null;
  rejected: string[];
} {
  const next: SelectedFile[] = [];
  const rejected: string[] = [];

  for (const asset of incoming) {
    const name =
      asset.name?.trim() ||
      "Untitled";

    if (
      !isAcceptedFile(
        asset.mimeType,
        name,
      )
    ) {
      rejected.push(name);
      continue;
    }

    if (
      typeof asset.size !==
        "number" ||
      !Number.isFinite(asset.size)
    ) {
      rejected.push(
        `${name} (size unknown)`,
      );
      continue;
    }

    if (
      asset.size >
      MAX_FILE_BYTES
    ) {
      rejected.push(
        `${name} (over 25 MB)`,
      );
      continue;
    }

    if (asset.size <= 0) {
      rejected.push(
        `${name} (empty)`,
      );
      continue;
    }

    const duplicate =
      existing.some(
        (file) =>
          file.uri ===
          asset.uri,
      );

    const duplicateInBatch =
      next.some(
        (file) =>
          file.uri ===
          asset.uri,
      );

    if (
      duplicate ||
      duplicateInBatch
    ) {
      continue;
    }

    next.push({
      id:
        createLocalPlanImportFileId(),

      name,

      mimeType:
        asset.mimeType,

      uri:
        asset.uri,

      size:
        asset.size,

      type:
        classifyMimeType(
          asset.mimeType,
          name,
        ),

      uploadStatus:
        "pending",
    });
  }

  if (
    existing.length +
      next.length >
    MAX_FILES
  ) {
    const allowed =
      Math.max(
        0,
        MAX_FILES -
          existing.length,
      );

    return {
      nextFiles: [
        ...existing,
        ...next.slice(
          0,
          allowed,
        ),
      ],

      error:
        `You can upload at most ${MAX_FILES} files per import.`,

      rejected,
    };
  }

  let error: string | null =
    null;

  if (
    rejected.length > 0
  ) {
    error =
      `Unsupported or invalid file${
        rejected.length === 1
          ? ""
          : "s"
      } skipped: ${rejected.join(
        ", ",
      )}. Use PDF, JPG, JPEG, or PNG up to 25 MB.`;
  }

  if (next.length === 0) {
    return {
      nextFiles:
        existing,

      error,

      rejected,
    };
  }

  return {
    nextFiles: [
      ...existing,
      ...next,
    ],

    error,

    rejected,
  };
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function PlanImportStartScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();

  const {
    projectId,
  } = route.params;

  const [
    files,
    setFiles,
  ] =
    useState<
      SelectedFile[]
    >([]);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    progress,
    setProgress,
  ] =
    useState<
      PlanImportUploadProgress | null
    >(null);

  const selectedCountLabel =
    useMemo(() => {
      if (
        files.length === 0
      ) {
        return "No files selected";
      }

      return `${files.length} file${
        files.length === 1
          ? ""
          : "s"
      } selected`;
    }, [
      files.length,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Choose files                                                             */
  /* ------------------------------------------------------------------------ */

  const handleChooseFiles =
    async () => {
      setError(null);

      try {
        const result =
          await DocumentPicker.getDocumentAsync(
            {
              type: [
                ...ACCEPTED_MIME_TYPES,
              ],

              multiple: true,

              copyToCacheDirectory:
                true,
            },
          );

        if (result.canceled) {
          return;
        }

        const incoming:
          IncomingFile[] =
          [];

        for (
          const asset of
          result.assets
        ) {
          const size =
            await resolveFileSize(
              asset.uri,
              asset.size,
            );

          incoming.push({
            uri:
              asset.uri,

            name:
              asset.name,

            mimeType:
              asset.mimeType,

            size:
              size ??
              undefined,
          });
        }

        const merged =
          mergeIncomingFiles(
            files,
            incoming,
          );

        setFiles(
          merged.nextFiles,
        );

        if (merged.error) {
          setError(
            merged.error,
          );
        }
      } catch {
        setError(
          "Unable to open the file picker. Please try again.",
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Choose photos                                                            */
  /* ------------------------------------------------------------------------ */

  const handleChoosePhotos =
    async () => {
      setError(null);

      const remaining =
        MAX_FILES -
        files.length;

      if (remaining <= 0) {
        setError(
          `You can upload at most ${MAX_FILES} files per import.`,
        );

        return;
      }

      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (
          !permission.granted
        ) {
          setError(
            "Photo access is required to choose images from your library.",
          );

          return;
        }

        const result =
          await ImagePicker.launchImageLibraryAsync(
            {
              mediaTypes: [
                "images",
              ],

              allowsMultipleSelection:
                true,

              selectionLimit:
                remaining,

              quality:
                1,

              allowsEditing:
                false,
            },
          );

        if (result.canceled) {
          return;
        }

        const incoming:
          IncomingFile[] =
          [];

        let photoSequence =
          files.filter(
            (file) =>
              file.type ===
              "image",
          ).length;

        for (
          const asset of
          result.assets
        ) {
          if (
            asset.type ===
              "video" ||
            asset.type ===
              "pairedVideo"
          ) {
            continue;
          }

          photoSequence += 1;

          const mimeType =
            asset.mimeType ??
            (
              asset.fileName
                ?.toLowerCase()
                .endsWith(
                  ".png",
                )
                ? "image/png"
                : "image/jpeg"
            );

          const name =
            asset.fileName?.trim() ||
            generatePhotoFileName(
              photoSequence,
              mimeType,
            );

          const size =
            await resolveFileSize(
              asset.uri,
              asset.fileSize,
            );

          incoming.push({
            uri:
              asset.uri,

            name,

            mimeType,

            size:
              size ??
              undefined,
          });
        }

        const merged =
          mergeIncomingFiles(
            files,
            incoming,
          );

        setFiles(
          merged.nextFiles,
        );

        if (merged.error) {
          setError(
            merged.error,
          );
        }
      } catch {
        setError(
          "Unable to open the photo library. Please try again.",
        );
      }
    };

  /* ------------------------------------------------------------------------ */
  /* Remove                                                                   */
  /* ------------------------------------------------------------------------ */

  const handleRemoveFile =
    (
      fileId: string,
    ) => {
      setFiles(
        (prev) =>
          prev.filter(
            (file) =>
              file.id !==
              fileId,
          ),
      );
    };

  /* ------------------------------------------------------------------------ */
  /* Continue                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleContinue =
    async () => {
      if (!user?.uid) {
        setError(
          "You must be signed in to continue.",
        );

        return;
      }

      if (
        files.length === 0
      ) {
        setError(
          "Choose at least one PDF or image file to continue.",
        );

        return;
      }

      if (
        files.length >
        MAX_FILES
      ) {
        setError(
          `You can upload at most ${MAX_FILES} files per import.`,
        );

        return;
      }

      if (submitting) {
        return;
      }

      setSubmitting(true);

      setError(null);

      setProgress({
        phase:
          "preparing",

        message:
          "Preparing upload",
      });

      let localImportId:
        string | null =
        null;

      try {
        const planImport =
          await createPlanImport(
            user.uid,
            projectId,
            files,
          );

        localImportId =
          planImport.id;

        const result =
          await syncPlanImportToCloud(
            user.uid,
            projectId,
            planImport.id,
            (
              nextProgress,
            ) => {
              setProgress(
                nextProgress,
              );
            },
          );

        if (!result.synced) {
          const message =
            result.errorMessage ??
            "Upload failed. You can retry from the import review screen.";

          setError(message);

          // Prefer one inline failure banner; avoid duplicating the same
          // message in the progress card while the decision Alert is shown.
          setProgress(null);

          Alert.alert(
            "Upload failed",
            message,
            [
              {
                text:
                  "Review import",

                onPress:
                  () => {
                    navigation.replace(
                      "PlanImportReview",
                      {
                        projectId,

                        importId:
                          planImport.id,
                      },
                    );
                  },
              },

              {
                text:
                  "Stay here",

                style:
                  "cancel",
              },
            ],
          );

          return;
        }

        navigation.replace(
          "PlanImportReview",
          {
            projectId,

            importId:
              planImport.id,
          },
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to save this import. Please try again.";

        setError(message);

        setProgress({
          phase:
            "failed",

          message,
        });

        Alert.alert(
          "Import failed",
          message,
        );

        if (localImportId) {
          // Local draft retained.
        }
      } finally {
        setSubmitting(false);
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
          SCREEN_BACKGROUND
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
          keyboardDismissMode={
            Platform.OS ===
            "ios"
              ? "interactive"
              : "on-drag"
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* -------------------------------------------------------------- */}
          {/* Header                                                         */}
          {/* -------------------------------------------------------------- */}

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
              hitSlop={
                8
              }
            >
              <Ionicons
                name="chevron-back"
                size={
                  23
                }
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
              Generate from files
            </Text>

            <View
              style={
                styles.topBarSpacer
              }
            />
          </View>

          {/* -------------------------------------------------------------- */}
          {/* Intro                                                          */}
          {/* -------------------------------------------------------------- */}

          <View
            style={
              styles.intro
            }
          >
            <View
              style={
                styles.introText
              }
            >
              <View
                style={
                  styles.eyebrowRow
                }
              >
                <Text
                  style={
                    styles.eyebrow
                  }
                >
                  AI PLAN GENERATION
                </Text>

                <View
                  style={
                    styles.aiBadge
                  }
                >
                  <Text
                    style={
                      styles.aiBadgeText
                    }
                  >
                    ASSISTED
                  </Text>
                </View>
              </View>

              <Text
                style={
                  styles.title
                }
              >
                Build a baseline from project documents
              </Text>

              <Text
                style={
                  styles.subtitle
                }
              >
                Add drawings, PDFs, or field photos. Kepler will prepare plan
                items for your review.
              </Text>
            </View>
          </View>

          {/* -------------------------------------------------------------- */}
          {/* Source actions                                                 */}
          {/* -------------------------------------------------------------- */}

          <View
            style={
              styles.sourceSection
            }
          >
            {/* Kepler accent */}

            <View
              pointerEvents="none"
              style={
                styles.sectionTopAccent
              }
            >
              <View
                style={
                  styles.sectionTopAccentBlue
                }
              />

              <View
                style={
                  styles.sectionTopAccentRed
                }
              />
            </View>

            <View
              style={
                styles.sectionHeadingRow
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Add source material
              </Text>

              <Text
                style={
                  styles.limitLabel
                }
              >
                UP TO 10 FILES
              </Text>
            </View>

            <View
              style={
                styles.actionStack
              }
            >
              <Pressable
                style={({
                  pressed,
                }) => [
                  styles.actionCard,

                  pressed &&
                    styles.actionCardPressed,
                ]}
                onPress={() => {
                  void handleChoosePhotos();
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose photos from library"
              >
                <View
                  style={[
                    styles.actionIconWrap,
                    styles.photoIconWrap,
                  ]}
                >
                  <Ionicons
                    name="images-outline"
                    size={
                      21
                    }
                    color={
                      KEPLER_NAVY
                    }
                  />
                </View>

                <View
                  style={
                    styles.actionBody
                  }
                >
                  <Text
                    style={
                      styles.actionTitle
                    }
                  >
                    Choose photos
                  </Text>

                  <Text
                    style={
                      styles.actionDescription
                    }
                  >
                    Select drawings or site photos from your library
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={
                    18
                  }
                  color={
                    TEXT_MUTED
                  }
                />
              </Pressable>

              <Pressable
                style={({
                  pressed,
                }) => [
                  styles.actionCard,

                  pressed &&
                    styles.actionCardPressed,
                ]}
                onPress={() => {
                  void handleChooseFiles();
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose project files"
              >
                <View
                  style={[
                    styles.actionIconWrap,
                    styles.fileIconWrap,
                  ]}
                >
                  <Ionicons
                    name="folder-open-outline"
                    size={
                      21
                    }
                    color={
                      KEPLER_NAVY
                    }
                  />
                </View>

                <View
                  style={
                    styles.actionBody
                  }
                >
                  <Text
                    style={
                      styles.actionTitle
                    }
                  >
                    Choose files
                  </Text>

                  <Text
                    style={
                      styles.actionDescription
                    }
                  >
                    PDF, JPG, JPEG or PNG · 25 MB max each
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={
                    18
                  }
                  color={
                    TEXT_MUTED
                  }
                />
              </Pressable>
            </View>
          </View>

          {/* -------------------------------------------------------------- */}
          {/* Selected files                                                */}
          {/* -------------------------------------------------------------- */}

          <View
            style={
              styles.filesSection
            }
          >
            {/* Kepler accent */}

            <View
              pointerEvents="none"
              style={
                styles.sectionTopAccent
              }
            >
              <View
                style={
                  styles.sectionTopAccentBlue
                }
              />

              <View
                style={
                  styles.sectionTopAccentRed
                }
              />
            </View>

            <View
              style={
                styles.sectionHeader
              }
            >
              <View
                style={
                  styles.sectionHeaderText
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Selected files
                </Text>

                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Review the upload queue before continuing.
                </Text>
              </View>

              <View
                style={
                  styles.countBadge
                }
              >
                <Text
                  style={
                    styles.countBadgeText
                  }
                >
                  {files.length}/{MAX_FILES}
                </Text>
              </View>
            </View>

            {files.length ===
            0 ? (
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
                    name="documents-outline"
                    size={
                      22
                    }
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
                  No documents added
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Add at least one PDF or image to generate a starting baseline.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.fileList
                }
              >
                {files.map(
                  (
                    file,
                  ) => (
                    <View
                      key={
                        file.id
                      }
                      style={
                        styles.fileCard
                      }
                    >
                      <View
                        style={
                          styles.fileIcon
                        }
                      >
                        <Ionicons
                          name={
                            file.type ===
                            "pdf"
                              ? "document-text-outline"
                              : "image-outline"
                          }
                          size={
                            20
                          }
                          color={
                            KEPLER_NAVY
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.fileBody
                        }
                      >
                        <Text
                          style={
                            styles.fileName
                          }
                          numberOfLines={
                            2
                          }
                        >
                          {
                            file.name
                          }
                        </Text>

                        <View
                          style={
                            styles.fileMetaRow
                          }
                        >
                          <Text
                            style={
                              styles.fileMeta
                            }
                          >
                            {
                              fileTypeLabel(
                                file.type,
                              )
                            }
                          </Text>

                          <View
                            style={
                              styles.metaDot
                            }
                          />

                          <Text
                            style={
                              styles.fileMeta
                            }
                          >
                            {
                              formatFileSize(
                                file.size,
                              )
                            }
                          </Text>

                          <View
                            style={
                              styles.pendingBadge
                            }
                          >
                            <Text
                              style={
                                styles.pendingBadgeText
                              }
                            >
                              READY
                            </Text>
                          </View>
                        </View>
                      </View>

                      <Pressable
                        style={({
                          pressed,
                        }) => [
                          styles.removeButton,

                          pressed &&
                            styles.removeButtonPressed,
                        ]}
                        onPress={() =>
                          handleRemoveFile(
                            file.id,
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${file.name}`}
                        hitSlop={
                          8
                        }
                      >
                        <Ionicons
                          name="close"
                          size={
                            17
                          }
                          color={
                            TEXT_SECONDARY
                          }
                        />
                      </Pressable>
                    </View>
                  ),
                )}
              </View>
            )}
          </View>

          {/* -------------------------------------------------------------- */}
          {/* Error                                                         */}
          {/* -------------------------------------------------------------- */}

          {error ? (
            <View
              style={
                styles.errorBanner
              }
              accessibilityRole="alert"
            >
              <Ionicons
                name="alert-circle-outline"
                size={
                  17
                }
                color={
                  KEPLER_RED
                }
              />

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

          {/* -------------------------------------------------------------- */}
          {/* Progress                                                      */}
          {/* -------------------------------------------------------------- */}

          {progress ? (
            <View
              style={[
                styles.progressCard,

                progress.phase ===
                  "failed" &&
                  styles.progressCardFailed,
              ]}
              accessibilityRole="text"
              accessibilityLabel={
                progress.message
              }
            >
              {submitting ? (
                <ActivityIndicator
                  size="small"
                  color={
                    KEPLER_NAVY
                  }
                />
              ) : (
                <Ionicons
                  name={
                    progress.phase ===
                    "failed"
                      ? "alert-circle-outline"
                      : "cloud-upload-outline"
                  }
                  size={
                    17
                  }
                  color={
                    progress.phase ===
                    "failed"
                      ? KEPLER_RED
                      : KEPLER_NAVY
                  }
                />
              )}

              <Text
                style={[
                  styles.progressText,

                  progress.phase ===
                    "failed" &&
                    styles.progressTextFailed,
                ]}
              >
                {
                  progress.message
                }
              </Text>
            </View>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Upload                                                        */}
          {/* -------------------------------------------------------------- */}

          <Pressable
            style={({
              pressed,
            }) => [
              styles.continueButton,

              pressed &&
                !submitting &&
                files.length >
                  0 &&
                styles.continueButtonPressed,

              (
                submitting ||
                files.length ===
                  0
              ) &&
                styles.continueButtonDisabled,
            ]}
            onPress={() => {
              void handleContinue();
            }}
            disabled={
              submitting ||
              files.length ===
                0
            }
            accessibilityRole="button"
            accessibilityLabel="Upload documents"
            accessibilityState={{
              disabled:
                submitting ||
                files.length ===
                  0,

              busy:
                submitting,
            }}
          >
            {submitting ? (
              <View
                style={
                  styles.uploadingContent
                }
              >
                <ActivityIndicator
                  color="#FFFFFF"
                  size="small"
                />

                <Text
                  style={
                    styles.continueButtonText
                  }
                >
                  Uploading…
                </Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={
                    19
                  }
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.continueButtonText
                  }
                >
                  Upload documents
                </Text>
              </>
            )}
          </Pressable>

          <View
            style={
              styles.securityNote
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={
                15
              }
              color={
                TEXT_MUTED
              }
            />

            <Text
              style={
                styles.footnote
              }
            >
              Documents are uploaded securely. Kepler analyzes them and proposes
              plan items for review before anything enters the baseline.
            </Text>
          </View>
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
      flex:
        1,
    },

    content: {
      paddingHorizontal:
        18,

      paddingTop:
        2,

      paddingBottom:
        42,
    },

    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    topBar: {
      minHeight:
        56,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",
    },

    backButton: {
      width:
        40,

      height:
        40,

      borderRadius:
        20,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(255,255,255,0.72)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        BORDER,
    },

    backButtonPressed: {
      opacity:
        0.7,

      transform: [
        {
          scale:
            0.95,
        },
      ],
    },

    topBarTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    topBarSpacer: {
      width:
        40,
    },

    /* ---------------------------------------------------------------------- */
    /* Intro                                                                  */
    /* ---------------------------------------------------------------------- */

    intro: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        13,

      marginTop:
        6,

      marginBottom:
        20,
    },

    introText: {
      flex:
        1,

      minWidth:
        0,
    },

    eyebrowRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      flexWrap:
        "wrap",

      gap:
        7,
    },

    eyebrow: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",

      letterSpacing:
        1.05,
    },

    aiBadge: {
      paddingHorizontal:
        7,

      paddingVertical:
        3,

      borderRadius:
        999,

      backgroundColor:
        "rgba(227,24,55,0.06)",
    },

    aiBadgeText: {
      ...typography.metadata,

      color:
        KEPLER_RED,

      fontSize:
        9,

      fontWeight:
        "700",

      letterSpacing:
        0.7,
    },

    title: {
      ...typography.title,

      color:
        TEXT_PRIMARY,

      marginTop:
        5,

      maxWidth:
        330,
    },

    subtitle: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      marginTop:
        6,

      lineHeight:
        18,

      maxWidth:
        340,
    },

    /* ---------------------------------------------------------------------- */
    /* Shared Kepler section accent                                           */
    /* ---------------------------------------------------------------------- */

    sectionTopAccent: {
      position:
        "absolute",

      top:
        0,

      left:
        0,

      right:
        0,

      height:
        2,

      flexDirection:
        "row",

      zIndex:
        2,
    },

    sectionTopAccentBlue: {
      flex:
        1,

      backgroundColor:
        KEPLER_NAVY,
    },

    sectionTopAccentRed: {
      width:
        34,

      backgroundColor:
        KEPLER_RED,
    },

    /* ---------------------------------------------------------------------- */
    /* Source selection                                                       */
    /* ---------------------------------------------------------------------- */

    sourceSection: {
      paddingHorizontal:
        15,

      paddingTop:
        17,

      paddingBottom:
        15,

      backgroundColor:
        CARD_BACKGROUND,

      borderRadius:
        18,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.08)",

      overflow:
        "hidden",

      position:
        "relative",
    },

    sectionHeadingRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap:
        12,

      marginBottom:
        12,
    },

    sectionTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    sectionDescription: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      marginTop:
        3,
    },

    limitLabel: {
      ...typography.metadata,

      color:
        TEXT_MUTED,

      fontSize:
        9,

      fontWeight:
        "700",

      letterSpacing:
        0.7,
    },

    actionStack: {
      gap:
        10,
    },

    actionCard: {
      minHeight:
        74,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        12,

      paddingHorizontal:
        13,

      paddingVertical:
        12,

      borderRadius:
        15,

      backgroundColor:
        "rgba(255,255,255,0.74)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        BORDER,
    },

    actionCardPressed: {
      opacity:
        0.86,

      transform: [
        {
          scale:
            0.99,
        },
      ],
    },

    actionIconWrap: {
      width:
        44,

      height:
        44,

      borderRadius:
        14,

      alignItems:
        "center",

      justifyContent:
        "center",

      borderWidth:
        StyleSheet.hairlineWidth,

      flexShrink:
        0,
    },

    photoIconWrap: {
      backgroundColor:
        "rgba(1,33,105,0.055)",

      borderColor:
        "rgba(1,33,105,0.10)",
    },

    fileIconWrap: {
      backgroundColor:
        "rgba(1,33,105,0.04)",

      borderColor:
        "rgba(1,33,105,0.08)",
    },

    actionBody: {
      flex:
        1,

      minWidth:
        0,
    },

    actionTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    actionDescription: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      marginTop:
        2,

      lineHeight:
        17,
    },

    /* ---------------------------------------------------------------------- */
    /* Selected files section                                                 */
    /* ---------------------------------------------------------------------- */

    filesSection: {
      marginTop:
        16,

      paddingHorizontal:
        15,

      paddingTop:
        17,

      paddingBottom:
        15,

      backgroundColor:
        "rgba(255,255,255,0.64)",

      borderRadius:
        18,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.07)",

      overflow:
        "hidden",

      position:
        "relative",
    },

    sectionHeader: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      justifyContent:
        "space-between",

      gap:
        12,

      marginBottom:
        13,
    },

    sectionHeaderText: {
      flex:
        1,

      minWidth:
        0,
    },

    countBadge: {
      minWidth:
        48,

      minHeight:
        28,

      paddingHorizontal:
        9,

      borderRadius:
        999,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1,33,105,0.065)",

      flexShrink:
        0,
    },

    countBadgeText: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontWeight:
        "700",
    },

    /* ---------------------------------------------------------------------- */
    /* Empty                                                                  */
    /* ---------------------------------------------------------------------- */

    emptyState: {
      alignItems:
        "center",

      paddingHorizontal:
        18,

      paddingVertical:
        22,
    },

    emptyIcon: {
      width:
        48,

      height:
        48,

      borderRadius:
        15,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(1,33,105,0.055)",

      marginBottom:
        10,
    },

    emptyTitle: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "700",
    },

    emptyText: {
      ...typography.caption,

      color:
        TEXT_SECONDARY,

      textAlign:
        "center",

      maxWidth:
        285,

      marginTop:
        5,

      lineHeight:
        18,
    },

    /* ---------------------------------------------------------------------- */
    /* File list                                                              */
    /* ---------------------------------------------------------------------- */

    fileList: {
      gap:
        8,
    },

    fileCard: {
      minHeight:
        68,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        11,

      paddingHorizontal:
        12,

      paddingVertical:
        11,

      backgroundColor:
        "rgba(255,255,255,0.82)",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.075)",
    },

    fileIcon: {
      width:
        40,

      height:
        40,

      borderRadius:
        12,

      backgroundColor:
        "rgba(1,33,105,0.055)",

      alignItems:
        "center",

      justifyContent:
        "center",

      flexShrink:
        0,
    },

    fileBody: {
      flex:
        1,

      minWidth:
        0,
    },

    fileName: {
      ...typography.bodyMedium,

      color:
        TEXT_PRIMARY,

      fontWeight:
        "600",
    },

    fileMetaRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      flexWrap:
        "wrap",

      gap:
        6,

      marginTop:
        4,
    },

    fileMeta: {
      ...typography.caption,

      color:
        TEXT_MUTED,
    },

    metaDot: {
      width:
        3,

      height:
        3,

      borderRadius:
        999,

      backgroundColor:
        "rgba(152,162,179,0.75)",
    },

    pendingBadge: {
      paddingHorizontal:
        6,

      paddingVertical:
        2,

      borderRadius:
        999,

      backgroundColor:
        "rgba(1,33,105,0.055)",
    },

    pendingBadgeText: {
      ...typography.metadata,

      color:
        KEPLER_NAVY,

      fontSize:
        8,

      fontWeight:
        "700",

      letterSpacing:
        0.6,
    },

    removeButton: {
      width:
        34,

      height:
        34,

      borderRadius:
        17,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(248,250,252,0.80)",

      flexShrink:
        0,
    },

    removeButtonPressed: {
      opacity:
        0.65,

      transform: [
        {
          scale:
            0.94,
        },
      ],
    },

    /* ---------------------------------------------------------------------- */
    /* Error                                                                  */
    /* ---------------------------------------------------------------------- */

    errorBanner: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        8,

      marginTop:
        14,

      paddingHorizontal:
        13,

      paddingVertical:
        11,

      backgroundColor:
        "rgba(227,24,55,0.055)",

      borderLeftWidth:
        2,

      borderLeftColor:
        KEPLER_RED,
    },

    errorText: {
      ...typography.caption,

      flex:
        1,

      color:
        "#B42318",

      fontWeight:
        "600",

      lineHeight:
        17,
    },

    /* ---------------------------------------------------------------------- */
    /* Progress                                                               */
    /* ---------------------------------------------------------------------- */

    progressCard: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        8,

      marginTop:
        12,

      paddingHorizontal:
        13,

      paddingVertical:
        11,

      backgroundColor:
        "rgba(1,33,105,0.05)",

      borderLeftWidth:
        2,

      borderLeftColor:
        KEPLER_NAVY,
    },

    progressCardFailed: {
      backgroundColor:
        "rgba(227,24,55,0.05)",

      borderLeftColor:
        KEPLER_RED,
    },

    progressText: {
      ...typography.caption,

      flex:
        1,

      color:
        KEPLER_NAVY,

      fontWeight:
        "600",
    },

    progressTextFailed: {
      color:
        "#B42318",
    },

    /* ---------------------------------------------------------------------- */
    /* Continue                                                               */
    /* ---------------------------------------------------------------------- */

    continueButton: {
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

      borderRadius:
        14,

      backgroundColor:
        KEPLER_NAVY,

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width:
          0,

        height:
          7,
      },

      shadowOpacity:
        0.18,

      shadowRadius:
        14,

      elevation:
        4,
    },

    continueButtonPressed: {
      opacity:
        0.9,

      transform: [
        {
          scale:
            0.99,
        },
      ],
    },

    continueButtonDisabled: {
      opacity:
        0.5,
    },

    continueButtonText: {
      ...typography.bodyMedium,

      color:
        "#FFFFFF",

      fontWeight:
        "700",
    },

    uploadingContent: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        9,
    },

    /* ---------------------------------------------------------------------- */
    /* Security note                                                          */
    /* ---------------------------------------------------------------------- */

    securityNote: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      justifyContent:
        "center",

      gap:
        6,

      marginTop:
        11,

      paddingHorizontal:
        12,
    },

    footnote: {
      ...typography.metadata,

      flex:
        1,

      color:
        TEXT_MUTED,

      lineHeight:
        15,
    },
  });