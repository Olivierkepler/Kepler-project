import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import {
  createRemoteEvidence,
  requestEvidenceUploadUrl,
} from "../services/api/evidence";
import { persistEvidencePhoto } from "../services/evidence/persistPhoto";
import { runCloudSyncCycle } from "../services/sync/cloudSyncCycle";
import { addEvidence } from "../store/evidence";
import { markEvidenceUploadPending } from "../store/evidenceUploadSyncState";
import { getDeltaById } from "../store/deltas";
import { getMeasurementById } from "../store/measurements";
import { getProjectById } from "../store/projects";
import type { Evidence } from "../types/evidence";
import type { Project } from "../types/project";
import { typography } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "AddEvidence">;

type ContextKind = "project" | "measurement" | "delta" | "invalid";

function createEvidenceId(): string {
  return `evidence-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function contentTypeFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

export default function AddEvidenceScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const {
    projectId,
    mode,
    measurementId,
    deltaId,
    returnToAgentRunId,
    source = "local",
  } = route.params;
  const isShared = source === "shared";

  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [contextKind, setContextKind] = useState<ContextKind | "loading">(
    "loading",
  );
  const [contextError, setContextError] = useState<string | null>(null);
  const [resolvedMeasurementId, setResolvedMeasurementId] = useState<
    string | null
  >(null);
  const [resolvedDeltaId, setResolvedDeltaId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finishSave = () => {
    if (returnToAgentRunId) {
      navigation.navigate("AgentRunDetail", {
        projectId,
        agentRunId: returnToAgentRunId,
        awaitingResume: true,
      });
      return;
    }

    navigation.goBack();
  };

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setContextKind("invalid");
        setContextError("Not signed in.");
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        setContextKind("loading");
        setProject(undefined);
        setResolvedMeasurementId(null);
        setResolvedDeltaId(null);
        setContextError(null);

        if (isShared) {
          if (!deltaId || measurementId) {
            if (!active) {
              return;
            }
            setProject(null);
            setContextKind("invalid");
            setContextError(
              "Shared evidence capture requires a Delta context.",
            );
            return;
          }

          if (!active) {
            return;
          }

          setProject({
            id: projectId,
            name: "Shared project",
            location: "",
            status: "active",
            progress: 0,
            openDeltas: 0,
            assignedTasks: 0,
          });
          setResolvedMeasurementId(null);
          setResolvedDeltaId(deltaId);
          setContextKind("delta");
          return;
        }

        const found = await getProjectById(ownerUid, projectId);

        if (!active) {
          return;
        }

        if (!found) {
          setProject(null);
          setContextKind("invalid");
          setContextError("Project not found.");
          return;
        }

        if (measurementId && deltaId) {
          setProject(found);
          setContextKind("invalid");
          setContextError(
            "Evidence cannot link to both a Measurement and a Delta.",
          );
          return;
        }

        if (measurementId) {
          const measurement = await getMeasurementById(ownerUid, measurementId);

          if (!active) {
            return;
          }

          if (!measurement || measurement.projectId !== projectId) {
            setProject(found);
            setContextKind("invalid");
            setContextError("Measurement not found.");
            return;
          }

          setResolvedMeasurementId(measurement.id);
          setResolvedDeltaId(null);
          setContextKind("measurement");
          setProject(found);
          return;
        }

        if (deltaId) {
          const delta = await getDeltaById(ownerUid, deltaId);

          if (!active) {
            return;
          }

          if (!delta || delta.projectId !== projectId) {
            setProject(found);
            setContextKind("invalid");
            setContextError("Delta not found.");
            return;
          }

          setResolvedMeasurementId(null);
          setResolvedDeltaId(delta.id);
          setContextKind("delta");
          setProject(found);
          return;
        }

        setResolvedMeasurementId(null);
        setResolvedDeltaId(null);
        setContextKind("project");
        setProject(found);
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, measurementId, deltaId, user?.uid, isShared]),
  );

  const relationshipFields = (): {
    measurementId: string | null;
    deltaId: string | null;
  } | null => {
    if (contextKind === "measurement") {
      if (!resolvedMeasurementId) {
        return null;
      }

      return { measurementId: resolvedMeasurementId, deltaId: null };
    }

    if (contextKind === "delta") {
      if (!resolvedDeltaId) {
        return null;
      }

      return { measurementId: null, deltaId: resolvedDeltaId };
    }

    if (contextKind === "project") {
      return { measurementId: null, deltaId: null };
    }

    return null;
  };

  const pickFromCamera = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setError("Camera access is required to take a photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setSourceUri(result.assets[0].uri);
  };

  const pickFromLibrary = async () => {
    setError(null);
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError("Photo library access is required to choose a photo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setSourceUri(result.assets[0].uri);
  };

  const handleSaveNote = async () => {
    if (!user?.uid || saving) {
      return;
    }

    const links = relationshipFields();

    if (!links) {
      setError("Evidence context is not ready.");
      return;
    }

    const trimmed = note.trim();

    if (!trimmed) {
      setError("Enter a note before saving.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      if (isShared) {
        if (!links.deltaId) {
          setError("Delta context is required.");
          return;
        }
        await createRemoteEvidence(projectId, {
          localEvidenceId: createEvidenceId(),
          type: "note",
          note: trimmed,
          createdAt: new Date().toISOString(),
          localMeasurementId: null,
          localDeltaId: links.deltaId,
        });
        finishSave();
        return;
      }

      const evidence: Evidence = {
        id: createEvidenceId(),
        projectId,
        type: "note",
        note: trimmed,
        photoUri: null,
        createdAt: new Date().toISOString(),
        measurementId: links.measurementId,
        deltaId: links.deltaId,
      };

      await addEvidence(user.uid, evidence);

      try {
        await markEvidenceUploadPending(user.uid, projectId, evidence.id);
      } catch {
        // Local evidence already saved; lifecycle can retry later if pending marked.
      }

      void runCloudSyncCycle(user.uid);
      finishSave();
    } catch {
      setError("Unable to save note.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!user?.uid || saving) {
      return;
    }

    const links = relationshipFields();

    if (!links) {
      setError("Evidence context is not ready.");
      return;
    }

    if (!sourceUri) {
      setError("Take or choose a photo before saving.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      if (isShared) {
        if (!links.deltaId) {
          setError("Delta context is required.");
          return;
        }

        const evidenceId = createEvidenceId();
        const contentType = contentTypeFromUri(sourceUri);
        const upload = await requestEvidenceUploadUrl(projectId, {
          localEvidenceId: evidenceId,
          contentType,
          localDeltaId: links.deltaId,
        });

        const photoResponse = await fetch(sourceUri);
        const photoBlob = await photoResponse.blob();
        const putResponse = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: photoBlob,
        });
        if (!putResponse.ok) {
          throw new Error("upload_failed");
        }

        await createRemoteEvidence(projectId, {
          localEvidenceId: evidenceId,
          type: "photo",
          note: note.trim(),
          createdAt: new Date().toISOString(),
          objectPath: upload.objectPath,
          contentType: upload.contentType,
          localMeasurementId: null,
          localDeltaId: links.deltaId,
        });
        finishSave();
        return;
      }

      const evidenceId = createEvidenceId();
      const persistentUri = await persistEvidencePhoto(
        user.uid,
        evidenceId,
        sourceUri,
      );

      const evidence: Evidence = {
        id: evidenceId,
        projectId,
        type: "photo",
        note: note.trim(),
        photoUri: persistentUri,
        createdAt: new Date().toISOString(),
        measurementId: links.measurementId,
        deltaId: links.deltaId,
      };

      await addEvidence(user.uid, evidence);

      try {
        await markEvidenceUploadPending(user.uid, projectId, evidence.id);
      } catch {
        // Local evidence already saved; lifecycle can retry later if pending marked.
      }

      void runCloudSyncCycle(user.uid);
      finishSave();
    } catch {
      setError("Unable to save photo evidence.");
      Alert.alert(
        "Photo not saved",
        "The image could not be stored on this device.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (project === undefined || contextKind === "loading") {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!project || contextKind === "invalid") {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <View style={styles.topBar}>
            <Pressable
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>
            {contextError ?? "Project not found."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const contextLabel =
    contextKind === "measurement"
      ? "Measurement evidence"
      : contextKind === "delta"
        ? "Delta evidence"
        : "Project evidence";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={10}
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>
          {mode === "note" ? "ADD NOTE" : "ADD PHOTO"}
        </Text>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.contextLabel}>{contextLabel}</Text>

        {mode === "photo" ? (
          <View style={styles.photoActions}>
            <Pressable style={styles.secondaryButton} onPress={pickFromCamera}>
              <Text style={styles.secondaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={pickFromLibrary}>
              <Text style={styles.secondaryButtonText}>Choose Photo</Text>
            </Pressable>
          </View>
        ) : null}

        {mode === "photo" && sourceUri ? (
          <Image
            source={{ uri: sourceUri }}
            style={styles.preview}
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.fieldLabel}>
          {mode === "note" ? "NOTE" : "CAPTION (OPTIONAL)"}
        </Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder={
            mode === "note" ? "Describe what you observed" : "Optional note"
          }
          placeholderTextColor="#667384"
          multiline
          textAlignVertical="top"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={() => {
            void (mode === "note" ? handleSaveNote() : handleSavePhoto());
          }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#0B0F14" />
          ) : (
            <Text style={styles.saveButtonText}>Save Evidence</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B0F14",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  content: {
    paddingBottom: 40,
  },

  topBar: {
    paddingTop: 16,
    marginBottom: 18,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    alignItems: "center",
    justifyContent: "center",
  },

  backButtonText: {
    color: "#FFFFFF",
    ...typography.title,
  },

  eyebrow: {
    color: "#F4A623",
    ...typography.caption,
  },

  title: {
    color: "#FFFFFF",
    ...typography.display,
    marginTop: 8,
  },

  contextLabel: {
    color: "#8F9BA8",
    ...typography.button,
    fontFamily: "Poppins_400Regular",
    marginTop: 6,
    marginBottom: 18,
  },

  photoActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  secondaryButton: {
    width: "48%",
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  secondaryButtonText: {
    color: "#FFFFFF",
    ...typography.button,
  },

  preview: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: "#151C25",
  },

  fieldLabel: {
    color: "#748093",
    ...typography.caption,
    marginBottom: 8,
  },

  input: {
    minHeight: 110,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.bodyLarge,
    marginBottom: 16,
  },

  errorText: {
    color: "#F07167",
    ...typography.button,
    fontFamily: "Poppins_400Regular",
    marginBottom: 12,
  },

  saveButton: {
    backgroundColor: "#F4A623",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: "#0B0F14",
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
  },
});
