import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors, typography } from "../../theme/colors";
import {
  addWorkPackageAssignmentIfAbsent,
  createLocalWorkPackageAssignmentId,
  getWorkPackageAssignmentsForProject,
  removeWorkPackageAssignment,
} from "../../store/workPackageAssignments";
import {
  addWorkPackageIfAbsent,
  createLocalWorkPackageId,
  getWorkPackagesForProject,
} from "../../store/workPackages";
import { getProjectMembersForProject } from "../../store/projectMembers";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getRemoteProjectMembers } from "../../services/api/projects";
import {
  publishWorkPackageToCloud,
  resolveCloudProjectMemberId,
} from "../../services/sync/workPackageCloudPublish";
import type { PlanItem } from "../../types/plan";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  buildPlanItemAssignmentMaps,
  persistWorkPackagePlanItems,
  summarizeWorkPackageAssignment,
} from "../../utils/domain/planItemAssignmentContext";
import { resolveAssignmentMemberDisplay } from "./WorkPackageAssignmentsModal";
import {
  type MemberPresentationContext,
} from "../../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../../utils/domain/memberPresentationContext";

function mergeAssignableMembers(
  localMembers: ProjectMember[],
  cloudMembers: ProjectMember[],
): ProjectMember[] {
  const byId = new Map<string, ProjectMember>();

  for (const member of localMembers) {
    byId.set(member.id, member);
  }

  for (const member of cloudMembers) {
    // Cloud ProjectMember.id is canonical for collaboration publish.
    byId.set(member.id, member);
  }

  return [...byId.values()];
}

type ViewMode = "list" | "create" | "edit" | "success";

type Props = {
  visible: boolean;
  projectId: string;
  ownerUid: string;
  canMutate: boolean;
  planItems: PlanItem[];
  initialWorkPackageId?: string | null;
  highlightPlanItemId?: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

function formatQuantity(value: number, unit: string): string {
  if (unit === "ea") {
    return `${value} ${unit.toUpperCase()}`;
  }

  return `${value.toFixed(2)} ${unit.toUpperCase()}`;
}

export default function OrganizeWorkModal({
  visible,
  projectId,
  ownerUid,
  canMutate,
  planItems,
  initialWorkPackageId = null,
  highlightPlanItemId = null,
  onClose,
  onUpdated,
}: Props) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [assignments, setAssignments] = useState<WorkPackageAssignment[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [presentationContext, setPresentationContext] =
    useState<MemberPresentationContext>();

  const [view, setView] = useState<ViewMode>("list");
  const [selectedWorkPackageId, setSelectedWorkPackageId] = useState<
    string | null
  >(null);
  const [selectedPlanItemIds, setSelectedPlanItemIds] = useState<string[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    null,
  );
  const [createName, setCreateName] = useState("");

  const [successSummary, setSuccessSummary] = useState<{
    workPackageId: string;
    workPackageName: string;
    itemsAdded: number;
  } | null>(null);

  const sortedPlanItems = useMemo(
    () =>
      planItems
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [planItems],
  );

  const planItemIds = useMemo(
    () => sortedPlanItems.map((item) => item.id),
    [sortedPlanItems],
  );

  const assignmentMaps = useMemo(
    () =>
      buildPlanItemAssignmentMaps(
        planItemIds,
        workPackages,
        assignments,
        members,
        projectId,
      ),
    [assignments, members, planItemIds, projectId, workPackages],
  );

  const assignmentsByWorkPackage = useMemo(() => {
    const map = new Map<string, WorkPackageAssignment[]>();

    for (const assignment of assignments) {
      const list = map.get(assignment.workPackageId) ?? [];
      list.push(assignment);
      map.set(assignment.workPackageId, list);
    }

    return map;
  }, [assignments]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );

  const selectedWorkPackage = useMemo(
    () =>
      workPackages.find((item) => item.id === selectedWorkPackageId) ?? null,
    [selectedWorkPackageId, workPackages],
  );

  const reload = useCallback(async () => {
    if (!ownerUid.trim()) {
      setWorkPackages([]);
      setAssignments([]);
      setMembers([]);
      return;
    }

    setLoading(true);

    try {
      const [packages, packageAssignments, projectMembers, remoteProjectId] =
        await Promise.all([
          getWorkPackagesForProject(ownerUid, projectId),
          getWorkPackageAssignmentsForProject(ownerUid, projectId),
          getProjectMembersForProject(ownerUid, projectId),
          getRemoteProjectId(ownerUid, projectId),
        ]);

      let cloudMembers: ProjectMember[] = [];

      if (remoteProjectId) {
        try {
          const remoteMembers = await getRemoteProjectMembers(remoteProjectId);
          cloudMembers = remoteMembers.map((member) => ({
            id: member.id,
            projectId,
            userId: member.userId,
            role: member.role,
            status: member.status,
            invitedBy: member.invitedBy,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt,
          }));
        } catch {
          // Local members remain available when cloud member list fails.
          cloudMembers = [];
        }
      }

      const mergedMembers = mergeAssignableMembers(projectMembers, cloudMembers);

      setWorkPackages(packages);
      setAssignments(packageAssignments);
      setMembers(mergedMembers);

      const nextContext = await fetchMemberPresentationContext({
        members: mergedMembers,
      });
      setPresentationContext(nextContext);
    } finally {
      setLoading(false);
    }
  }, [ownerUid, projectId]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    void reload();
  }, [reload, visible]);

  useEffect(() => {
    if (!visible) {
      setView("list");
      setSelectedWorkPackageId(null);
      setSelectedPlanItemIds([]);
      setSelectedMemberId(null);
      setCreateName("");
      setSuccessSummary(null);
      return;
    }

    if (initialWorkPackageId) {
      setSelectedWorkPackageId(initialWorkPackageId);
      setView("edit");
    } else {
      setView("list");
    }
  }, [initialWorkPackageId, visible]);

  useEffect(() => {
    if (!visible || view !== "edit" || !selectedWorkPackage) {
      return;
    }

    const initialIds = new Set(selectedWorkPackage.planItemIds);

    if (highlightPlanItemId) {
      initialIds.add(highlightPlanItemId);
    }

    setSelectedPlanItemIds([...initialIds]);

    const summary = summarizeWorkPackageAssignment(
      selectedWorkPackage,
      assignmentsByWorkPackage.get(selectedWorkPackage.id) ?? [],
      members,
      projectId,
    );

    setSelectedMemberId(summary.primaryAssignment?.projectMemberId ?? null);
  }, [
    assignmentsByWorkPackage,
    highlightPlanItemId,
    members,
    projectId,
    selectedWorkPackage,
    view,
    visible,
  ]);

  const openEdit = (workPackageId: string) => {
    setSelectedWorkPackageId(workPackageId);
    setView("edit");
  };

  const togglePlanItem = (planItemId: string) => {
    setSelectedPlanItemIds((current) =>
      current.includes(planItemId)
        ? current.filter((id) => id !== planItemId)
        : [...current, planItemId],
    );
  };

  const handleCreateWorkPackage = async () => {
    if (!canMutate || saving) {
      return;
    }

    const name = createName.trim();

    if (!name) {
      Alert.alert("Name required", "Enter a work package name.");
      return;
    }

    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const workPackage: WorkPackage = {
        id: createLocalWorkPackageId(),
        projectId,
        name,
        status: "draft",
        planItemIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const created = await addWorkPackageIfAbsent(ownerUid, workPackage);

      if (!created) {
        throw new Error("Unable to create work package.");
      }

      await reload();
      setCreateName("");
      setSelectedWorkPackageId(workPackage.id);
      setView("edit");
    } catch (createError) {
      Alert.alert(
        "Unable to create",
        createError instanceof Error
          ? createError.message
          : "Unable to create work package.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canMutate || saving || !selectedWorkPackage) {
      return;
    }

    setSaving(true);

    try {
      const previousIds = new Set(selectedWorkPackage.planItemIds);
      const nextIds = selectedPlanItemIds;
      const itemsAdded = nextIds.filter((id) => !previousIds.has(id)).length;

      await persistWorkPackagePlanItems(
        ownerUid,
        selectedWorkPackage.id,
        nextIds,
        workPackages,
      );

      const packageAssignments =
        assignmentsByWorkPackage.get(selectedWorkPackage.id) ?? [];

      for (const assignment of packageAssignments) {
        if (assignment.status === "cancelled") {
          continue;
        }

        const keepSelected =
          selectedMemberId != null &&
          assignment.projectMemberId === selectedMemberId;

        if (!keepSelected) {
          await removeWorkPackageAssignment(ownerUid, assignment.id);
        }
      }

      if (selectedMemberId) {
        const existingForMember = packageAssignments.some(
          (assignment) =>
            assignment.projectMemberId === selectedMemberId &&
            assignment.status !== "cancelled",
        );

        if (!existingForMember) {
          const nowIso = new Date().toISOString();
          const assignment = {
            id: createLocalWorkPackageAssignmentId(),
            projectId,
            workPackageId: selectedWorkPackage.id,
            projectMemberId: selectedMemberId,
            status: "assigned" as const,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          const created = await addWorkPackageAssignmentIfAbsent(
            ownerUid,
            assignment,
          );

          if (!created) {
            throw new Error(
              "That member is already assigned to this work package.",
            );
          }
        }
      }

      const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);
      const desiredCloudProjectMemberIds: string[] = [];

      if (selectedMemberId && remoteProjectId) {
        const selectedMember = members.find(
          (member) => member.id === selectedMemberId,
        );
        desiredCloudProjectMemberIds.push(
          resolveCloudProjectMemberId({
            selectedMemberId,
            remoteProjectId,
            memberUserId: selectedMember?.userId ?? null,
          }),
        );
      }

      const publishResult = await publishWorkPackageToCloud({
        ownerUid,
        localProjectId: projectId,
        localWorkPackage: {
          id: selectedWorkPackage.id,
          name: selectedWorkPackage.name,
          description: selectedWorkPackage.description,
          status: selectedWorkPackage.status,
          planItemIds: nextIds,
        },
        desiredCloudProjectMemberIds,
      });

      if (!publishResult.ok) {
        Alert.alert(
          "Saved locally",
          `Cloud collaboration sync failed: ${publishResult.error}. Field members will not see this assignment until sync succeeds.`,
        );
      }

      await reload();
      onUpdated?.();

      setSuccessSummary({
        workPackageId: selectedWorkPackage.id,
        workPackageName: selectedWorkPackage.name,
        itemsAdded,
      });
      setView("success");
    } catch (saveError) {
      Alert.alert(
        "Unable to save",
        saveError instanceof Error
          ? saveError.message
          : "Unable to save work package.",
      );
    } finally {
      setSaving(false);
    }
  };

  const renderHeader = (title: string, onBack?: () => void) => (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={styles.headerBack}
        >
          <Ionicons name="chevron-back" size={22} color="#344054" />
        </Pressable>
      ) : (
        <View style={styles.headerBackPlaceholder} />
      )}

      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close organize work"
        hitSlop={8}
        style={styles.headerClose}
      >
        <Ionicons name="close" size={22} color="#667085" />
      </Pressable>
    </View>
  );

  const renderList = () => (
    <>
      {renderHeader("Organize work")}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.summaryEyebrow}>
          {sortedPlanItems.length}{" "}
          {sortedPlanItems.length === 1 ? "Plan Item" : "Plan Items"}
        </Text>

        <Text style={styles.summaryLine}>
          {assignmentMaps.assignedPlanItemCount} assigned ·{" "}
          {assignmentMaps.unassignedPlanItemCount} unassigned
        </Text>

        {canMutate ? (
          <Pressable
            onPress={() => setView("create")}
            accessibilityRole="button"
            accessibilityLabel="Create work package"
            style={styles.primaryOutlineButton}
          >
            <Ionicons name="add" size={18} color="#1D3A6B" />
            <Text style={styles.primaryOutlineButtonText}>
              Create work package
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionLabel}>Existing work packages</Text>

        {loading ? (
          <ActivityIndicator color="#475467" style={styles.loader} />
        ) : workPackages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No work packages yet.</Text>
            <Text style={styles.emptyBody}>
              Group Plan Items into a work package, then assign responsibility.
            </Text>
          </View>
        ) : (
          workPackages.map((item) => {
            const summary = summarizeWorkPackageAssignment(
              item,
              assignmentsByWorkPackage.get(item.id) ?? [],
              members,
              projectId,
            );

            return (
              <Pressable
                key={item.id}
                onPress={() => openEdit(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${summary.assigneeLabel}, ${summary.planItemCount} items`}
                style={({ pressed }) => [
                  styles.listRow,
                  pressed && styles.listRowPressed,
                ]}
              >
                <View style={styles.listRowContent}>
                  <Text style={styles.listRowTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.listRowMeta}>
                    {summary.assigneeLabel} · {summary.planItemCount}{" "}
                    {summary.planItemCount === 1 ? "item" : "items"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C5CBD3" />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </>
  );

  const renderCreate = () => (
    <>
      {renderHeader("Create work package", () => setView("list"))}

      <View style={styles.body}>
        <Text style={styles.fieldLabel}>Work package name</Text>
        <TextInput
          value={createName}
          onChangeText={setCreateName}
          placeholder="Electrical Rough-In"
          placeholderTextColor="#98A2B3"
          style={styles.textInput}
          autoFocus
          accessibilityLabel="Work package name"
        />

        <Pressable
          onPress={() => {
            void handleCreateWorkPackage();
          }}
          disabled={!canMutate || saving}
          accessibilityRole="button"
          accessibilityLabel="Create work package"
          accessibilityState={{ disabled: !canMutate || saving, busy: saving }}
          style={({ pressed }) => [
            styles.saveButton,
            (!canMutate || saving) && styles.saveButtonDisabled,
            pressed && canMutate && !saving && styles.saveButtonPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Create work package</Text>
          )}
        </Pressable>
      </View>
    </>
  );

  const renderEdit = () => {
    if (!selectedWorkPackage) {
      return renderList();
    }

    return (
      <>
        {renderHeader(selectedWorkPackage.name, () => setView("list"))}

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Select Plan Items</Text>

          {sortedPlanItems.map((item) => {
            const checked = selectedPlanItemIds.includes(item.id);

            return (
              <Pressable
                key={item.id}
                onPress={() => togglePlanItem(item.id)}
                accessibilityRole="checkbox"
                accessibilityLabel={`${item.label}, ${formatQuantity(item.plannedValue, item.unit)}`}
                accessibilityState={{ checked }}
                style={({ pressed }) => [
                  styles.checkRow,
                  pressed && styles.checkRowPressed,
                ]}
              >
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? "#3B6FCF" : "#C5CBD3"}
                />
                <Text style={styles.checkLabel} numberOfLines={2}>
                  {item.label}
                </Text>
                <Text style={styles.checkQuantity}>
                  {formatQuantity(item.plannedValue, item.unit)}
                </Text>
              </Pressable>
            );
          })}

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            Assigned to
          </Text>

          {activeMembers.length === 0 ? (
            <Text style={styles.helperText}>
              No eligible project members are available to assign yet.
            </Text>
          ) : (
            activeMembers.map((member) => {
              const selected = selectedMemberId === member.id;
              const display = resolveAssignmentMemberDisplay(
                projectId,
                member.id,
                members,
                presentationContext,
              );

              return (
                <Pressable
                  key={member.id}
                  onPress={() =>
                    setSelectedMemberId(selected ? null : member.id)
                  }
                  accessibilityRole="radio"
                  accessibilityLabel={`Assign to ${display.label}, ${display.roleLabel}`}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.memberRow,
                    selected && styles.memberRowSelected,
                    pressed && styles.memberRowPressed,
                  ]}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {display.initial}
                    </Text>
                  </View>
                  <View style={styles.memberContent}>
                    <Text style={styles.memberLabel}>{display.label}</Text>
                    <Text style={styles.memberRole}>{display.roleLabel}</Text>
                  </View>
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selected ? "#3B6FCF" : "#C5CBD3"}
                  />
                </Pressable>
              );
            })
          )}

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={!canMutate || saving}
            accessibilityRole="button"
            accessibilityLabel="Save to work package"
            accessibilityState={{ disabled: !canMutate || saving, busy: saving }}
            style={({ pressed }) => [
              styles.saveButton,
              styles.saveButtonSpaced,
              (!canMutate || saving) && styles.saveButtonDisabled,
              pressed && canMutate && !saving && styles.saveButtonPressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save to work package</Text>
            )}
          </Pressable>
        </ScrollView>
      </>
    );
  };

  const renderSuccess = () => {
    if (!successSummary) {
      return renderList();
    }

    const addedLine =
      successSummary.itemsAdded > 0
        ? `${successSummary.itemsAdded} ${
            successSummary.itemsAdded === 1 ? "item" : "items"
          } added to\n${successSummary.workPackageName}`
        : `Work package updated\n${successSummary.workPackageName}`;

    return (
      <>
        {renderHeader("Organize work")}

        <View style={styles.successBody}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={28} color="#3B6FCF" />
          </View>

          <Text style={styles.successTitle}>Work package updated</Text>
          <Text style={styles.successSubtitle}>{addedLine}</Text>

          <Pressable
            onPress={() => openEdit(successSummary.workPackageId)}
            accessibilityRole="button"
            accessibilityLabel={`View work package ${successSummary.workPackageName}`}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>View work package</Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={styles.saveButton}
          >
            <Text style={styles.saveButtonText}>Done</Text>
          </Pressable>
        </View>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          { paddingTop: Math.max(insets.top, 12) },
        ]}
      >
        {view === "list"
          ? renderList()
          : view === "create"
            ? renderCreate()
            : view === "edit"
              ? renderEdit()
              : renderSuccess()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EAECF0",
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBackPlaceholder: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    ...typography.title,
    flex: 1,
    color: "#101828",
    textAlign: "center",
  },
  headerClose: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    paddingBottom: 32,
  },
  summaryEyebrow: {
    ...typography.metadata,
    color: "#98A2B3",
    letterSpacing: 0.4,
  },
  summaryLine: {
    ...typography.bodyMedium,
    color: "#344054",
    marginTop: 6,
    marginBottom: 18,
  },
  sectionLabel: {
    ...typography.metadata,
    color: "#667085",
    letterSpacing: 0.4,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionLabelSpaced: {
    marginTop: 22,
  },
  primaryOutlineButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 22,
  },
  primaryOutlineButtonText: {
    ...typography.button,
    color: "#1D3A6B",
  },
  listRow: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAECF0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  listRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  listRowContent: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  listRowTitle: {
    ...typography.bodyMedium,
    color: "#101828",
  },
  listRowMeta: {
    ...typography.caption,
    color: "#667085",
    marginTop: 4,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAECF0",
    padding: 16,
    backgroundColor: "#FAFBFC",
  },
  emptyTitle: {
    ...typography.bodyMedium,
    color: "#344054",
  },
  emptyBody: {
    ...typography.caption,
    color: "#667085",
    marginTop: 6,
  },
  loader: {
    marginVertical: 24,
  },
  fieldLabel: {
    ...typography.caption,
    color: "#667085",
    marginBottom: 8,
  },
  textInput: {
    ...typography.body,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#101828",
    backgroundColor: "#FFFFFF",
  },
  checkRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EAECF0",
  },
  checkRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  checkLabel: {
    ...typography.body,
    color: "#101828",
    flex: 1,
    minWidth: 0,
  },
  checkQuantity: {
    ...typography.caption,
    color: "#667085",
    flexShrink: 0,
  },
  helperText: {
    ...typography.caption,
    color: "#667085",
    marginBottom: 8,
  },
  memberRow: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAECF0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  memberRowSelected: {
    borderColor: "#BFD0EA",
    backgroundColor: "#F5F8FD",
  },
  memberRowPressed: {
    opacity: 0.92,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2F6",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: {
    ...typography.bodyMedium,
    color: "#344054",
  },
  memberContent: {
    flex: 1,
    minWidth: 0,
  },
  memberLabel: {
    ...typography.bodyMedium,
    color: "#101828",
  },
  memberRole: {
    ...typography.caption,
    color: "#667085",
    marginTop: 2,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.navy,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveButtonSpaced: {
    marginTop: 20,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonPressed: {
    opacity: 0.92,
  },
  saveButtonText: {
    ...typography.button,
    color: "#FFFFFF",
    padding: 12,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    width: "100%",
  },
  secondaryButtonText: {
    ...typography.button,
    color: "#344054",
  },
  successBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    ...typography.title,
    color: "#101828",
    textAlign: "center",
  },
  successSubtitle: {
    ...typography.body,
    color: "#667085",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 22,
  },
});
