import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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
  createSharedRemoteMeasurement,
  type RemoteMeasurement,
} from "../services/api/measurements";
import {
  getRemotePlanItemsForProject,
  type RemotePlanItem,
} from "../services/api/planItems";
import { getMyDiscoveredProjects } from "../services/api/projects";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { uploadSharedEvidencePhoto } from "../services/api/sharedFieldContribution";
import { colors, typography } from "../theme/colors";
import { feetAndInchesToFeet } from "../utils/calculations/units";

type Props = NativeStackScreenProps<RootStackParamList, "SharedCapture">;

function createLocalMeasurementId(): string {
  return `measurement-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createLocalEvidenceId(): string {
  return `evidence-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function isLengthFtPlanItem(item: RemotePlanItem): boolean {
  return item.type === "length" && item.unit === "ft";
}

function mapContributionError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to save field contribution.";
  }

  if (error.message === "Unable to reach the authenticated API.") {
    return "Network unavailable. Shared field capture requires an online connection.";
  }

  return error.message;
}

export default function SharedCaptureScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { remoteProjectId, membershipRole } = route.params;

  const [planItems, setPlanItems] = useState<RemotePlanItem[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [workPackageByPlanItemId, setWorkPackageByPlanItemId] = useState<
    Map<string, string>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"network" | "unavailable" | null>(
    null,
  );
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<string | null>(
    null,
  );
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [savedMeasurement, setSavedMeasurement] =
    useState<RemoteMeasurement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const eligiblePlanItems = useMemo(
    () => planItems.filter(isLengthFtPlanItem),
    [planItems],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setLoadError(null);

        try {
          const [items, discovered, workPackages] = await Promise.all([
            getRemotePlanItemsForProject(remoteProjectId),
            getMyDiscoveredProjects().catch(() => []),
            getRemoteWorkPackagesForProject(remoteProjectId).catch(() => []),
          ]);
          if (!active) {
            return;
          }
          setPlanItems(items);
          const discoveredMatch = discovered.find(
            (item) => item.id === remoteProjectId,
          );
          setProjectName(discoveredMatch?.name?.trim() || null);

          const wpMap = new Map<string, string>();
          for (const workPackage of workPackages) {
            for (const planItemId of workPackage.planItemIds) {
              if (!wpMap.has(planItemId)) {
                wpMap.set(planItemId, workPackage.name);
              }
            }
          }
          setWorkPackageByPlanItemId(wpMap);
        } catch (error) {
          if (!active) {
            return;
          }
          setPlanItems([]);
          if (
            error instanceof Error &&
            (error.message === "Project not found." ||
              error.message.includes("no longer available"))
          ) {
            setLoadError("unavailable");
          } else {
            setLoadError("network");
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [remoteProjectId, retryToken]),
  );

  useEffect(() => {
    if (eligiblePlanItems.length === 1) {
      setSelectedPlanItemId(eligiblePlanItems[0].id);
      return;
    }

    setSelectedPlanItemId((current) => {
      if (
        current &&
        eligiblePlanItems.some((item) => item.id === current)
      ) {
        return current;
      }
      return null;
    });
  }, [eligiblePlanItems]);

  const selectedPlanItem = selectedPlanItemId
    ? eligiblePlanItems.find((item) => item.id === selectedPlanItemId)
    : undefined;

  const selectedWorkPackageName = selectedPlanItem
    ? workPackageByPlanItemId.get(selectedPlanItem.id)
    : undefined;

  const totalFeet = useMemo(() => {
    const ft = Number(feet || 0);
    const inch = Number(inches || 0);
    return feetAndInchesToFeet(ft, inch);
  }, [feet, inches]);

  const pickPhoto = async (source: "camera" | "library") => {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access to attach a field photo.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
        setPhotoError(null);
      }
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo library permission needed",
        "Allow photo library access to attach a field photo.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      setPhotoError(null);
    }
  };

  const uploadPhotoForMeasurement = async (
    measurement: RemoteMeasurement,
    uri: string,
  ): Promise<boolean> => {
    try {
      await uploadSharedEvidencePhoto({
        remoteProjectId,
        localEvidenceId: createLocalEvidenceId(),
        localMeasurementId: measurement.localMeasurementId,
        photoUri: uri,
        note: "",
        createdAt: new Date().toISOString(),
      });
      setPhotoError(null);
      return true;
    } catch (error) {
      setPhotoError(mapContributionError(error));
      return false;
    }
  };

  const finishSuccess = () => {
    Alert.alert(
      "Submitted for review",
      "Your measurement was submitted and is pending owner review.",
      [
        {
          text: "OK",
          onPress: () => {
            navigation.navigate("Project", {
              projectId: remoteProjectId,
              source: "shared",
              membershipRole,
            });
          },
        },
      ],
    );
  };

  const saveContribution = async () => {
    if (saving || !user?.uid) {
      return;
    }

    const ft = Number(feet || 0);
    const inch = Number(inches || 0);

    if (
      !Number.isFinite(ft) ||
      !Number.isFinite(inch) ||
      ft < 0 ||
      inch < 0 ||
      inch >= 12 ||
      feetAndInchesToFeet(ft, inch) <= 0
    ) {
      Alert.alert(
        "Invalid measurement",
        "Enter a valid length before saving.",
      );
      return;
    }

    if (!selectedPlanItem) {
      Alert.alert(
        "Select a plan item",
        "Choose which assigned plan item this measurement is against.",
      );
      return;
    }

    setSaving(true);
    setPhotoError(null);

    try {
      let measurement = savedMeasurement;

      if (!measurement) {
        measurement = await createSharedRemoteMeasurement(remoteProjectId, {
          localMeasurementId: createLocalMeasurementId(),
          planItemId: selectedPlanItem.id,
          type: selectedPlanItem.type,
          label: selectedPlanItem.label,
          value: feetAndInchesToFeet(ft, inch),
          unit: selectedPlanItem.unit,
          createdAt: new Date().toISOString(),
        });
        setSavedMeasurement(measurement);
      }

      if (photoUri) {
        const photoOk = await uploadPhotoForMeasurement(measurement, photoUri);
        if (!photoOk) {
          Alert.alert(
            "Measurement saved",
            "Photo could not be uploaded. You can retry the photo without re-saving the measurement.",
          );
          return;
        }
      }

      finishSuccess();
    } catch (error) {
      const message = mapContributionError(error);
      if (
        message.includes("no longer available") ||
        message === "Project not found."
      ) {
        Alert.alert("Unavailable", message, [
          {
            text: "OK",
            onPress: () => {
              navigation.navigate("Project", {
                projectId: remoteProjectId,
                source: "shared",
                membershipRole,
              });
            },
          },
        ]);
        return;
      }

      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  const retryPhotoOnly = async () => {
    if (!savedMeasurement || !photoUri || saving) {
      return;
    }

    setSaving(true);
    try {
      const photoOk = await uploadPhotoForMeasurement(
        savedMeasurement,
        photoUri,
      );
      if (photoOk) {
        finishSuccess();
      } else {
        Alert.alert(
          "Photo upload failed",
          photoError ?? "Photo could not be uploaded.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.blue} />
          <Text style={styles.stateText}>Loading assigned plan items…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.title}>
            {loadError === "unavailable"
              ? "This shared project is no longer available."
              : "Unable to load assigned work."}
          </Text>
          {loadError === "network" ? (
            <Pressable
              style={styles.retryButton}
              onPress={() => setRetryToken((value) => value + 1)}
              accessibilityRole="button"
              accessibilityLabel="Retry loading assigned plan items"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (eligiblePlanItems.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.eyebrow}>SHARED FIELD CAPTURE</Text>
          <Text style={styles.title}>No work assigned yet</Text>
          <Text style={styles.body}>
            No work has been assigned to you yet.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>

          <Text style={styles.eyebrow}>SHARED FIELD CAPTURE</Text>
          <Text style={styles.title}>Record field measurement</Text>
          <Text style={styles.body}>
            Contributions save directly to the cloud project. Online only.
          </Text>

          <View style={styles.contextCard}>
            <Text style={styles.contextLabel}>PROJECT</Text>
            <Text style={styles.contextValue} numberOfLines={2}>
              {projectName ?? "Shared project"}
            </Text>
            {selectedWorkPackageName ? (
              <>
                <Text style={styles.contextLabel}>WORK PACKAGE</Text>
                <Text style={styles.contextValue} numberOfLines={2}>
                  {selectedWorkPackageName}
                </Text>
              </>
            ) : null}
            {selectedPlanItem ? (
              <>
                <Text style={styles.contextLabel}>PLAN ITEM</Text>
                <Text style={styles.contextValue} numberOfLines={2}>
                  {selectedPlanItem.label}
                </Text>
              </>
            ) : (
              <Text style={styles.contextHint}>
                Select a plan item below to continue.
              </Text>
            )}
          </View>

          <Text style={styles.sectionLabel}>PLAN ITEM</Text>
          {eligiblePlanItems.map((item) => {
            const selected = item.id === selectedPlanItemId;
            return (
              <Pressable
                key={item.id}
                style={[styles.planCard, selected && styles.planCardSelected]}
                onPress={() => {
                  if (!savedMeasurement) {
                    setSelectedPlanItemId(item.id);
                  }
                }}
                disabled={!!savedMeasurement}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select plan item ${item.label}`}
              >
                <Text style={styles.planLabel} numberOfLines={2}>
                  {item.label}
                </Text>
                <Text style={styles.planMeta}>
                  {item.type} · {item.unit}
                </Text>
              </Pressable>
            );
          })}

          <Text style={styles.sectionLabel}>MEASUREMENT (FT)</Text>
          <View style={styles.row}>
            <View style={styles.inputHalf}>
              <Text style={styles.fieldLabel}>Feet</Text>
              <TextInput
                style={styles.input}
                value={feet}
                onChangeText={setFeet}
                keyboardType="numeric"
                editable={!savedMeasurement && !saving}
                accessibilityLabel="Feet"
              />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.fieldLabel}>Inches</Text>
              <TextInput
                style={styles.input}
                value={inches}
                onChangeText={setInches}
                keyboardType="numeric"
                editable={!savedMeasurement && !saving}
                accessibilityLabel="Inches"
              />
            </View>
          </View>
          <Text style={styles.preview}>
            Total: {totalFeet.toFixed(2)} ft
          </Text>

          <Text style={styles.sectionLabel}>PHOTO (OPTIONAL)</Text>
          <View style={styles.photoActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                void pickPhoto("camera");
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Take field photo"
            >
              <Text style={styles.secondaryButtonText}>Camera</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                void pickPhoto("library");
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Choose photo from library"
            >
              <Text style={styles.secondaryButtonText}>Library</Text>
            </Pressable>
          </View>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.previewImage}
              accessibilityLabel="Selected field photo preview"
            />
          ) : null}
          {photoError ? (
            <Text style={styles.errorText}>{photoError}</Text>
          ) : null}

          {savedMeasurement && photoError ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                void retryPhotoOnly();
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Retry photo upload"
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Retry photo upload</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                void saveContribution();
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={
                savedMeasurement
                  ? "Upload photo and finish"
                  : "Save shared field measurement"
              }
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {savedMeasurement
                    ? "Upload photo and finish"
                    : photoUri
                      ? "Save measurement + photo"
                      : "Save measurement"}
                </Text>
              )}
            </Pressable>
          )}

          {savedMeasurement && !photoUri ? (
            <Pressable
              style={styles.doneLink}
              onPress={finishSuccess}
              accessibilityRole="button"
              accessibilityLabel="Done without photo"
            >
              <Text style={styles.doneLinkText}>Done without photo</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 8,
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.text.muted,
    marginBottom: 8,
  },
  title: {
    ...typography.display,
    color: colors.text.primary,
    marginBottom: 8,
  },
  body: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: 20,
  },
  contextCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 18,
    gap: 4,
  },
  contextLabel: {
    ...typography.metadata,
    marginTop: 8,
    color: colors.text.muted,
  },
  contextValue: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flexShrink: 1,
  },
  contextHint: {
    ...typography.caption,
    marginTop: 8,
    color: colors.text.secondary,
  },
  stateText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  sectionLabel: {
    ...typography.metadata,
    marginTop: 8,
    marginBottom: 10,
    color: colors.text.muted,
  },
  planCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 10,
    minHeight: 56,
  },
  planCardSelected: {
    borderColor: colors.brand.blue,
    backgroundColor: "#EAF5FC",
  },
  planLabel: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  planMeta: {
    ...typography.caption,
    marginTop: 4,
    color: colors.text.secondary,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: 6,
  },
  input: {
    ...typography.bodyLarge,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    minHeight: 48,
  },
  preview: {
    ...typography.caption,
    marginTop: 10,
    marginBottom: 8,
    color: colors.text.secondary,
  },
  photoActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.brand.blue,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: colors.border,
  },
  primaryButton: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  doneLink: {
    marginTop: 16,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  doneLinkText: {
    ...typography.bodyMedium,
    color: colors.text.secondary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  retryButtonText: {
    ...typography.button,
    color: colors.text.primary,
  },
});
