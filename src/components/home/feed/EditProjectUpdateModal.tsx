import React, { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { typography } from "../../../theme/colors";
import type { RemoteFeedPost } from "../../../services/api/feedPosts";
import { updateRemoteFeedPost } from "../../../services/api/feedPosts";

const KEPLER_NAVY = "#012169";
const MAX_TEXT_LENGTH = 2500;

type Props = {
  visible: boolean;
  post: RemoteFeedPost | null;
  onClose: () => void;
  onSaved: (post: RemoteFeedPost) => void;
  resolveMediaReadUrl?: (
    mediaId: string,
  ) => Promise<string | null>;
};

export default function EditProjectUpdateModal({
  visible,
  post,
  onClose,
  onSaved,
  resolveMediaReadUrl,
}: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaUris, setMediaUris] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!visible || !post) {
      return;
    }

    setText(post.text);
    setLocationLabel(post.locationLabel ?? "");
  }, [post, visible]);

  useEffect(() => {
    if (!visible || !post || !resolveMediaReadUrl) {
      setMediaUris({});
      return;
    }

    let active = true;

    void (async () => {
      const entries = await Promise.all(
        post.media.map(async (item) => {
          const uri = await resolveMediaReadUrl(item.id);
          return [item.id, uri ?? ""] as const;
        }),
      );

      if (active) {
        setMediaUris(Object.fromEntries(entries));
      }
    })();

    return () => {
      active = false;
    };
  }, [post, resolveMediaReadUrl, visible]);

  const canSave = useMemo(() => {
    if (!post || saving) {
      return false;
    }

    const trimmed = text.trim();
    const hasMedia = post.media.length > 0;

    if (trimmed.length === 0 && !hasMedia) {
      return false;
    }

    if (trimmed.length > MAX_TEXT_LENGTH) {
      return false;
    }

    const nextLocation =
      locationLabel.trim().length > 0
        ? locationLabel.trim()
        : null;
    const currentLocation = post.locationLabel ?? null;

    return (
      trimmed !== post.text.trim() ||
      nextLocation !== currentLocation
    );
  }, [locationLabel, post, saving, text]);

  const handleSave = async () => {
    if (!post || !canSave || saving) {
      return;
    }

    setSaving(true);

    try {
      const updated = await updateRemoteFeedPost(
        post.projectId,
        post.id,
        {
          text: text.trim(),
          locationLabel:
            locationLabel.trim().length > 0
              ? locationLabel.trim()
              : null,
          expectedUpdatedAt: post.updatedAt,
        },
      );

      onSaved(updated);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Project update could not be saved.";

      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (!post) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!saving) {
          onClose();
        }
      }}
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel edit"
            hitSlop={10}
            style={styles.headerAction}
          >
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>

          <Text style={styles.title}>Edit update</Text>

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel={saving ? "Saving update" : "Save update"}
            style={styles.headerAction}
          >
            {saving ? (
              <ActivityIndicator color={KEPLER_NAVY} />
            ) : (
              <Text
                style={[
                  styles.save,
                  !canSave && styles.saveDisabled,
                ]}
              >
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Project</Text>
          <Text style={styles.readOnlyValue}>
            {post.projectName}
          </Text>

          <Text style={styles.label}>Update</Text>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            editable={!saving}
            multiline
            placeholder="Share a project update"
            placeholderTextColor="#98A2B3"
            maxLength={MAX_TEXT_LENGTH}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.locationInput}
            value={locationLabel}
            onChangeText={setLocationLabel}
            editable={!saving}
            placeholder="Optional location"
            placeholderTextColor="#98A2B3"
          />

          {post.media.length > 0 ? (
            <View style={styles.mediaSection}>
              <Text style={styles.label}>Attachments</Text>
              <Text style={styles.mediaHint}>
                Existing media cannot be changed in this version.
              </Text>
              <View style={styles.mediaRow}>
                {post.media.map((item) => (
                  <View key={item.id} style={styles.mediaThumbWrap}>
                    {mediaUris[item.id] ? (
                      <Image
                        source={{ uri: mediaUris[item.id] }}
                        style={styles.mediaThumb}
                      />
                    ) : (
                      <View style={styles.mediaPlaceholder}>
                        <Ionicons
                          name={
                            item.type === "video"
                              ? "videocam-outline"
                              : "image-outline"
                          }
                          size={20}
                          color="#667085"
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4E7EC",
  },
  headerAction: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: {
    ...typography.body,
    color: "#667085",
  },
  title: {
    ...typography.sectionTitle,
    color: KEPLER_NAVY,
  },
  save: {
    ...typography.button,
    color: KEPLER_NAVY,
  },
  saveDisabled: {
    opacity: 0.4,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 8,
  },
  label: {
    ...typography.caption,
    color: "#667085",
    marginTop: 8,
  },
  readOnlyValue: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
  },
  textInput: {
    ...typography.body,
    minHeight: 120,
    color: "#101828",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  locationInput: {
    ...typography.body,
    color: "#101828",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mediaSection: {
    marginTop: 8,
    gap: 8,
  },
  mediaHint: {
    ...typography.caption,
    color: "#98A2B3",
  },
  mediaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mediaThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F2F4F7",
  },
  mediaThumb: {
    width: "100%",
    height: "100%",
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
