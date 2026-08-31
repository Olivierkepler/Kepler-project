import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { getRemotePlanItemId } from "../store/planItemCloudMappings";
import { getPlanItemById, updatePlanItem } from "../store/planItems";
import { markPlanItemUpdatePending } from "../store/planItemUpdateSyncState";
import { syncPlanItemUpdateToCloud } from "../services/sync/planItemUpdate";
import { typography } from "../theme/colors";

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

    try {
      const ownerUid = user.uid;
      const updated = await updatePlanItem(ownerUid, planItemId, {
        label: trimmedLabel,
        plannedValue,
        unitCost,
        productionRatePerDay,
        laborHoursPerUnit,
      });

      if (!updated || updated.projectId !== projectId) {
        setError("Plan item not found.");
        return;
      }

      const remotePlanItemId = await getRemotePlanItemId(
        ownerUid,
        projectId,
        planItemId,
      );

      // Local save already succeeded. Mark pending + best-effort cloud without
      // blocking navigation on network latency.
      if (remotePlanItemId) {
        await markPlanItemUpdatePending(ownerUid, projectId, planItemId);
        void syncPlanItemUpdateToCloud(
          ownerUid,
          projectId,
          planItemId,
        ).then((result) => {
          if (!result.synced) {
            Alert.alert(
              "Saved on this device",
              "Cloud update is pending.",
            );
          }
        });
      }

      navigation.goBack();
    } catch {
      setError("Unable to save plan item.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (notFound) {
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
            <Text style={styles.topBarTitle}>Edit Plan Item</Text>
            <View style={styles.topBarPlaceholder} />
          </View>
          <Text style={styles.emptyText}>Plan item not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>Edit Plan Item</Text>
          <View style={styles.topBarPlaceholder} />
        </View>

        <Text style={styles.readOnlyLabel}>TYPE / UNIT (READ-ONLY)</Text>
        <Text style={styles.readOnlyValue}>
          {typeLabel} · {unitLabel}
        </Text>

        <Text style={styles.label}>LABEL</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Label"
          placeholderTextColor="#667085"
          editable={!saving}
        />

        <Text style={styles.label}>PLANNED VALUE</Text>
        <TextInput
          style={styles.input}
          value={plannedValueText}
          onChangeText={setPlannedValueText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#667085"
          editable={!saving}
        />

        <Text style={styles.label}>UNIT COST</Text>
        <TextInput
          style={styles.input}
          value={unitCostText}
          onChangeText={setUnitCostText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#667085"
          editable={!saving}
        />

        <Text style={styles.label}>PRODUCTION RATE / DAY</Text>
        <TextInput
          style={styles.input}
          value={productionRateText}
          onChangeText={setProductionRateText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#667085"
          editable={!saving}
        />

        <Text style={styles.label}>LABOR HOURS / UNIT</Text>
        <TextInput
          style={styles.input}
          value={laborHoursText}
          onChangeText={setLaborHoursText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#667085"
          editable={!saving}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text style={styles.saveButtonText}>Save Plan Item</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    marginBottom: 24,
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

  topBarTitle: {
    color: "#FFFFFF",
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
  },

  topBarPlaceholder: {
    width: 42,
  },

  readOnlyLabel: {
    color: "#748093",
    ...typography.caption,
    marginBottom: 6,
  },

  readOnlyValue: {
    color: "#8F9BA8",
    ...typography.body,
    marginBottom: 18,
  },

  label: {
    color: "#748093",
    ...typography.caption,
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    color: "#FFFFFF",
    ...typography.bodyLarge,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },

  errorText: {
    color: "#F07167",
    ...typography.button,
    fontFamily: "Poppins_400Regular",
    marginBottom: 12,
  },

  emptyText: {
    color: "#7F8A98",
    ...typography.body,
  },

  saveButton: {
    marginTop: 8,
    backgroundColor: "#F4A623",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: "#111111",
    ...typography.bodyMedium,
  },
});
