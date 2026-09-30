import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { getRemotePlanItemId } from "../store/planItemCloudMappings";
import { getPlanItemById, updatePlanItem } from "../store/planItems";
import { markPlanItemUpdatePending } from "../store/planItemUpdateSyncState";
import { syncPlanItemUpdateToCloud } from "../services/sync/planItemUpdate";
import { syncPlanItemImageToCloud } from "../services/sync/planItemImageSync";
import {
  deletePlanItemImageFile,
  pickPlanItemImage,
  persistPlanItemImage,
  type PickedPlanItemImage,
} from "../services/planItems/planItemImageLocal";
import { markPlanItemImageSyncPending } from "../store/planItemImageSyncState";
import { colors, typography } from "../theme/colors";

const KEPLER_NAVY = "#012169";
const backgroundImage = require("../../assets/bgsignup.png");

type Props = NativeStackScreenProps<RootStackParamList, "EditPlanItem">;

function parseNonNegativeNumber(raw: string): number | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function parsePositiveNumber(raw: string): number | null {
  const value = parseNonNegativeNumber(raw);

  if (value === null || value <= 0) {
    return null;
  }

  return value;
}

function ScreenBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {children}
      </SafeAreaView>
    </ImageBackground>
  );
}

function ScreenHeader({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />
      </Pressable>
      <Text style={styles.topBarTitle}>Edit plan item</Text>
      <View style={styles.topBarPlaceholder} />
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  keyboardType?: "default" | "decimal-pad";
  placeholder?: string;
};

function FormField({
  label,
  value,
  onChangeText,
  editable,
  keyboardType = "default",
  placeholder,
}: FieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        editable={editable}
      />
    </View>
  );
}

export default function EditPlanItemScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId, planItemId } = route.params;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [typeLabel, setTypeLabel] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [label, setLabel] = useState("");
  const [plannedValueText, setPlannedValueText] = useState("");
  const [unitCostText, setUnitCostText] = useState("");
  const [productionRateText, setProductionRateText] = useState("");
  const [laborHoursText, setLaborHoursText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [originalImageUri, setOriginalImageUri] = useState<string | null>(null);
  const [currentImageUri, setCurrentImageUri] = useState<string | null>(null);
  const [imageDirty, setImageDirty] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedImageContentType, setSelectedImageContentType] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setLoading(false);
        setNotFound(true);
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        setLoading(true);
        const item = await getPlanItemById(ownerUid, planItemId);

        if (!active) {
          return;
        }

        if (!item || item.projectId !== projectId) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setTypeLabel(item.type);
        setUnitLabel(item.unit);
        setLabel(item.label);
        setPlannedValueText(String(item.plannedValue));
        setUnitCostText(String(item.unitCost));
        setProductionRateText(String(item.productionRatePerDay));
        setLaborHoursText(String(item.laborHoursPerUnit));
        setOriginalImageUri(item.imageUri ?? null);
        setCurrentImageUri(item.imageUri ?? null);
        setImageDirty(false);
        setImageError(null);
        setSelectedImageContentType(null);
        setNotFound(false);
        setLoading(false);
      }

      void load();

      return () => {
        active = false;
      };
    }, [planItemId, projectId, user?.uid]),
  );

  const handleSave = async () => {
    if (!user?.uid || saving) {
      return;
    }

    const trimmedLabel = label.trim();
    const plannedValue = parseNonNegativeNumber(plannedValueText);
    const unitCost = parseNonNegativeNumber(unitCostText);
    const productionRatePerDay = parsePositiveNumber(productionRateText);
    const laborHoursPerUnit = parseNonNegativeNumber(laborHoursText);

    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }

    if (plannedValue === null) {
      setError("Planned value must be a number ≥ 0.");
      return;
    }

    if (unitCost === null) {
      setError("Unit cost must be a number ≥ 0.");
      return;
    }

    if (productionRatePerDay === null) {
      setError("Production rate per day must be a number > 0.");
      return;
    }

    if (laborHoursPerUnit === null) {
      setError("Labor hours per unit must be a number ≥ 0.");
      return;
    }

    setError(null);
    setSaving(true);

    let newDurableImageUri: string | null = null;
    let localUpdated = false;
    const ownerUid = user.uid;
    try {
      let nextImageUri = originalImageUri;

      // Required local save phase. Only failures here mean the edit itself
      // could not be saved on this device.
      try {
        if (imageDirty && currentImageUri && currentImageUri !== originalImageUri) {
          newDurableImageUri = await persistPlanItemImage(
            ownerUid,
            projectId,
            planItemId,
            currentImageUri,
            selectedImageContentType ?? "image/jpeg",
          );
          nextImageUri = newDurableImageUri;
        } else if (imageDirty && !currentImageUri) {
          nextImageUri = null;
        }

        const updated = await updatePlanItem(ownerUid, planItemId, {
          label: trimmedLabel,
          plannedValue,
          unitCost,
          productionRatePerDay,
          laborHoursPerUnit,
          ...(imageDirty ? { imageUri: nextImageUri } : {}),
        });

        if (!updated || updated.projectId !== projectId) {
          if (newDurableImageUri) {
            void deletePlanItemImageFile(
              ownerUid,
              projectId,
              planItemId,
              newDurableImageUri,
            );
          }
          setError("Plan item not found.");
          return;
        }
        localUpdated = true;
      } catch {
        if (newDurableImageUri && !localUpdated) {
          void deletePlanItemImageFile(
            ownerUid,
            projectId,
            planItemId,
            newDurableImageUri,
          );
        }
        setError("Unable to save plan item.");
        return;
      }

      // Sync bookkeeping is best-effort. The local edit above is already
      // committed and must not be reported as a failed save.
      let syncBookkeepingFailed = false;
      if (imageDirty) {
        try {
          await markPlanItemImageSyncPending(
            ownerUid,
            projectId,
            planItemId,
            nextImageUri ? "upload" : "remove",
          );

          if (originalImageUri && originalImageUri !== nextImageUri) {
            void deletePlanItemImageFile(
              ownerUid,
              projectId,
              planItemId,
              originalImageUri,
            );
          }

          void syncPlanItemImageToCloud(ownerUid, projectId, planItemId)
            .then((result) => {
              if (!result.synced) {
                Alert.alert("Saved on this device", "Plan Item image sync is pending.");
              }
            })
            .catch(() => undefined);
        } catch {
          // Without this queue record, automatic image retry is not guaranteed.
          syncBookkeepingFailed = true;
        }
      }

      try {
        const remotePlanItemId = await getRemotePlanItemId(
          ownerUid,
          projectId,
          planItemId,
        );

        if (remotePlanItemId) {
          await markPlanItemUpdatePending(ownerUid, projectId, planItemId);
          void syncPlanItemUpdateToCloud(ownerUid, projectId, planItemId)
            .then((result) => {
              if (!result.synced) {
                Alert.alert("Saved on this device", "Cloud update is pending.");
              }
            })
            .catch(() => undefined);
          }
      } catch {
        syncBookkeepingFailed = true;
      }

      if (syncBookkeepingFailed) {
        Alert.alert(
          "Saved on this device",
          "Your changes were saved locally, but cloud synchronization could not be queued.",
        );
      }

      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={KEPLER_NAVY} />
        </View>
      </ScreenBackground>
    );
  }

  if (notFound) {
    return (
      <ScreenBackground>
        <View style={styles.container}>
          <ScreenHeader onBack={() => navigation.goBack()} />
          <View style={styles.notFoundBlock}>
            <View style={styles.notFoundIcon}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color={KEPLER_NAVY}
              />
            </View>
            <Text style={styles.notFoundTitle}>Plan item not found</Text>
            <Text style={styles.notFoundBody}>
              This item may have been removed or is no longer available.
            </Text>
          </View>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          <ScreenHeader onBack={() => navigation.goBack()} />

          <Text style={styles.eyebrow}>PLAN ITEM</Text>
          <Text style={styles.introTitle}>Edit planning assumptions</Text>
          <Text style={styles.introBody}>
            Update this item&apos;s planning values. Changes are saved locally
            and synchronized with Kepler Cloud.
          </Text>

          <View style={styles.typeUnitStrip}>
            <Text style={styles.typeUnitLabel}>TYPE / UNIT</Text>
            <View style={styles.typeUnitValues}>
              <Text style={styles.typeUnitType}>
                {typeLabel.toUpperCase()}
              </Text>
              <Text style={styles.typeUnitValue}>{unitLabel.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.imageSection}>
            <View style={styles.imagePreviewWrap}>
              {currentImageUri ? (
                <Image
                  source={{ uri: currentImageUri }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={26} color="#98A2B3" />
                </View>
              )}
            </View>
            <View style={styles.imageTextBlock}>
              <Text style={styles.imageTitle}>Plan Item image</Text>
              <Text style={styles.imageSubtitle}>Optional</Text>
              <View style={styles.imageActions}>
                <Pressable
                  onPress={() => {
                    void pickPlanItemImage().then((picked: PickedPlanItemImage | null) => {
                      if (picked) {
                        setCurrentImageUri(picked.uri);
                        setSelectedImageContentType(picked.contentType);
                        setImageDirty(true);
                        setImageError(null);
                      }
                    }).catch((pickError: unknown) => {
                      setImageError(pickError instanceof Error ? pickError.message : "Unable to select image.");
                    });
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={currentImageUri ? "Change Plan Item image" : "Add Plan Item image"}
                >
                  <Text style={styles.imageActionText}>{currentImageUri ? "Change" : "Add image"}</Text>
                </Pressable>
                {currentImageUri ? (
                  <Pressable
                    onPress={() => {
                      setCurrentImageUri(null);
                      setSelectedImageContentType(null);
                      setImageDirty(true);
                      setImageError(null);
                    }}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Remove Plan Item image"
                  >
                    <Text style={styles.imageRemoveText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              {imageError ? <Text style={styles.imageError}>{imageError}</Text> : null}
            </View>
          </View>

          <FormField
            label="Label"
            value={label}
            onChangeText={setLabel}
            placeholder="Label"
            editable={!saving}
          />

          <Text style={styles.sectionTitle}>PLANNING</Text>

          <View style={styles.fieldPair}>
            <View style={styles.fieldHalf}>
              <FormField
                label="Planned quantity"
                value={plannedValueText}
                onChangeText={setPlannedValueText}
                keyboardType="decimal-pad"
                placeholder="0"
                editable={!saving}
              />
            </View>
            <View style={styles.fieldHalf}>
              <FormField
                label="Unit cost ($)"
                value={unitCostText}
                onChangeText={setUnitCostText}
                keyboardType="decimal-pad"
                placeholder="0"
                editable={!saving}
              />
            </View>
          </View>

          <View style={styles.fieldPair}>
            <View style={styles.fieldHalf}>
              <FormField
                label="Production / day"
                value={productionRateText}
                onChangeText={setProductionRateText}
                keyboardType="decimal-pad"
                placeholder="0"
                editable={!saving}
              />
            </View>
            <View style={styles.fieldHalf}>
              <FormField
                label="Labor hours / unit"
                value={laborHoursText}
                onChangeText={setLaborHoursText}
                keyboardType="decimal-pad"
                placeholder="0"
                editable={!saving}
              />
            </View>
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={colors.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={() => {
              void handleSave();
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save changes</Text>
            )}
          </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "transparent",
  },

  content: {
    paddingBottom: 48,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    marginBottom: 18,
  },

  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },

  topBarTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 16,
    fontWeight: "600",
  },

  topBarPlaceholder: {
    width: 44,
  },

  eyebrow: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 11.5,
    letterSpacing: 0.8,
    fontWeight: "600",
    textTransform: "uppercase",
    opacity: 0.85,
  },

  introTitle: {
    ...typography.sectionTitle,
    color: "#101828",
    fontSize: 21,
    fontWeight: "600",
    marginTop: 6,
    letterSpacing: -0.3,
  },

  introBody: {
    ...typography.body,
    color: "#667085",
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 20,
  },

  typeUnitStrip: {
    backgroundColor: "rgba(255,255,255,0.74)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.07)",
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },

  imageSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.08)",
    borderRadius: 14,
  },
  imagePreviewWrap: { width: 62, height: 62, borderRadius: 31, overflow: "hidden", marginRight: 13, backgroundColor: "#EEF2F6" },
  imagePreview: { width: 62, height: 62 },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  imageTextBlock: { flex: 1, minWidth: 0 },
  imageTitle: { ...typography.bodyMedium, color: "#101828", fontWeight: "600" },
  imageSubtitle: { ...typography.caption, color: "#98A2B3", marginTop: 2 },
  imageActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 7 },
  imageActionText: { ...typography.caption, color: KEPLER_NAVY, fontWeight: "600" },
  imageRemoveText: { ...typography.caption, color: "#667085" },
  imageError: { ...typography.caption, color: colors.danger, marginTop: 4 },

  typeUnitLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 11.5,
    letterSpacing: 0.6,
    fontWeight: "600",
    marginBottom: 8,
  },

  typeUnitValues: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  typeUnitType: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    minWidth: 0,
  },

  typeUnitValue: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 0,
  },

  sectionTitle: {
    ...typography.caption,
    color: "#667085",
    fontSize: 11.5,
    letterSpacing: 0.8,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 4,
  },

  fieldBlock: {
    marginBottom: 16,
  },

  fieldPair: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 2,
  },

  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },

  fieldLabel: {
    ...typography.caption,
    color: "#475467",
    fontSize: 12.5,
    fontWeight: "500",
    marginBottom: 7,
  },

  input: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.10)",
    borderRadius: 14,
    color: "#101828",
    ...typography.body,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },

  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    minWidth: 0,
  },

  notFoundBlock: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },

  notFoundIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,33,105,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.10)",
    marginBottom: 14,
  },

  notFoundTitle: {
    ...typography.sectionTitle,
    color: "#101828",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },

  notFoundBody: {
    ...typography.body,
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 280,
  },

  saveButton: {
    marginTop: 12,
    backgroundColor: KEPLER_NAVY,
    borderRadius: 15,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
