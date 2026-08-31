import React, { useCallback, useMemo, useState } from "react";

import {

  ActivityIndicator,

  Alert,

  FlatList,

  ImageBackground,

  Pressable,

  ScrollView,

  StyleSheet,

  Text,

  View,

} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { useFocusEffect } from "@react-navigation/native";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../auth/AuthProvider";

import PlanCandidateCard, {
  CANDIDATE_TEXT_INDENT,
} from "../components/plan-import/PlanCandidateCard";

import PlanCandidateEditor from "../components/plan-import/PlanCandidateEditor";

import PlanCandidateSource from "../components/plan-import/PlanCandidateSource";

import PlanReviewSummary from "../components/plan-import/PlanReviewSummary";

import PlanReviewToolbar from "../components/plan-import/PlanReviewToolbar";

import type { RootStackParamList } from "../navigation/types";

import {

  batchSelectRemotePlanImportCandidates,

  deleteRemotePlanImportCandidate,

  getRemotePlanImport,

  getRemotePlanImportCandidates,

  markRemotePlanImportReadyForApproval,

  patchRemotePlanImportCandidate,

  processRemotePlanImport,

  type PatchRemotePlanImportCandidateInput,

  type RemotePlanImportCandidate,

  type RemotePlanImportStatus,

} from "../services/api/planImports";

import { syncPlanImportToCloud } from "../services/sync/planImportUpload";

import {

  deletePlanImport,

  getPlanImportById,

  updatePlanImport,

} from "../store/planImports";

import { typography } from "../theme/colors";

import type { PlanImport, PlanImportStatus } from "../types/planImport";

import {

  filterPlanImportCandidates,

  isPlanImportApprovalReady,

  summarizePlanImportReview,

  type PlanImportReviewFilter,

} from "../utils/planImportReview";

type Props = NativeStackScreenProps<RootStackParamList, "PlanImportReview">;

const POLL_INTERVAL_MS = 2500;

const SCREEN_BACKGROUND = require("../../assets/bgproject.png");

const KEPLER_NAVY = "#012169";

const KEPLER_RED = "#E31837";

const TEXT_PRIMARY = "#101828";

const TEXT_SECONDARY = "#667085";

const TEXT_MUTED = "#98A2B3";

const CARD_BACKGROUND = "rgba(255,255,255,0.80)";

const BORDER = "rgba(1,33,105,0.08)";

function fileTypeLabel(type: PlanImport["files"][number]["type"]): string {

  switch (type) {

    case "pdf":

      return "PDF";

    case "image":

      return "IMAGE";

    default:

      return "FILE";

  }

}

function statusLabel(status: PlanImport["status"]): string {

  switch (status) {

    case "uploaded":

      return "Ready for document processing";

    case "uploading":

      return "Upload in progress";

    case "failed":

      return "Failed";

    case "draft":

      return "Draft — not uploaded yet";

    case "processing":

      return "Analyzing documents";

    case "ready_for_review":

      return "Ready for review";

    case "ready_for_approval":

      return "Ready for approval";

    case "approved":

      return "Approved";

    default:

      return status;

  }

}

function statusBadgeTone(status: PlanImport["status"]): {

  backgroundColor: string;

  color: string;

  borderColor: string;

} {

  switch (status) {

    case "failed":

      return {

        backgroundColor: "rgba(227,24,55,0.08)",

        color: KEPLER_RED,

        borderColor: "rgba(227,24,55,0.16)",

      };

    case "approved":

      return {

        backgroundColor: "rgba(1,33,105,0.06)",

        color: TEXT_SECONDARY,

        borderColor: BORDER,

      };

    case "processing":

    case "ready_for_review":

    case "ready_for_approval":

    case "uploaded":

    case "uploading":

    default:

      return {

        backgroundColor: "rgba(1,33,105,0.08)",

        color: KEPLER_NAVY,

        borderColor: "rgba(1,33,105,0.12)",

      };

  }

}

function mapRemoteStatusToLocal(

remoteStatus: RemotePlanImportStatus,

fallback: PlanImportStatus,

): PlanImportStatus {

  switch (remoteStatus) {

    case "uploaded":

      return "uploaded";

    case "uploading":

      return "uploading";

    case "processing":

      return "processing";

    case "ready_for_review":

      return "ready_for_review";

    case "ready_for_approval":

      return "ready_for_approval";

    case "approved":

      return "approved";

    case "failed":

      return "failed";

    default:

      return fallback;

  }

}

function filesLookUploaded(planImport: PlanImport): boolean {

  return (

    planImport.files.length > 0 &&

    planImport.files.every((file) => file.uploadStatus === "uploaded")

  );

}

function resolveSourceFileName(

candidate: RemotePlanImportCandidate,

files: PlanImport["files"],

): string | undefined {

  const localFile = files.find(

    (file) =>

      file.remoteFileId === candidate.sourceFileId ||

      file.id === candidate.sourceFileId,

  );

  return localFile?.name;

}

export default function PlanImportReviewScreen({ route, navigation }: Props) {

  const { user } = useAuth();

  const { projectId, importId, historicalView = false } = route.params;

  const [planImport, setPlanImport] = useState<PlanImport | null | undefined>(

    undefined,

  );

  const [candidates, setCandidates] = useState<RemotePlanImportCandidate[]>(

    [],

  );

  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [removing, setRemoving] = useState(false);

  const [retrying, setRetrying] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);

  const [filter, setFilter] = useState<PlanImportReviewFilter>("all");

  const [bulkBusy, setBulkBusy] = useState(false);

  const [selectBusyId, setSelectBusyId] = useState<string | null>(null);

  const [looksGoodBusyId, setLooksGoodBusyId] = useState<string | null>(null);

  const [editorCandidate, setEditorCandidate] =

    useState<RemotePlanImportCandidate | null>(null);

  const [editorSaving, setEditorSaving] = useState(false);

  const [editorRemoving, setEditorRemoving] = useState(false);

  const [sourceCandidate, setSourceCandidate] =

    useState<RemotePlanImportCandidate | null>(null);

  const [expandedCandidateId, setExpandedCandidateId] = useState<
    string | null
  >(null);

  const [continuing, setContinuing] = useState(false);

  const applyRemoteSnapshot = useCallback(

    async (

      ownerUid: string,

      current: PlanImport,

      remote: Awaited<ReturnType<typeof getRemotePlanImport>>["import"],

    ): Promise<PlanImport> => {

      const nextStatus = mapRemoteStatusToLocal(remote.status, current.status);

      const updated = await updatePlanImport(ownerUid, importId, {

        status: nextStatus,

        errorMessage: remote.errorMessage ?? null,

        files: current.files.map((file) => {

          const remoteFile = remote.files.find(

            (item) => item.localFileId === file.id,

          );

          return {

            ...file,

            remoteFileId: remoteFile?.id ?? file.remoteFileId,

            storagePath: remoteFile?.storagePath ?? file.storagePath,

            uploadStatus: remoteFile?.uploadStatus ?? file.uploadStatus,

          };

        }),

      });

      return updated ?? { ...current, status: nextStatus };

    },

    [importId],

  );

  const loadCandidates = useCallback(async (current: PlanImport) => {

    if (!current.remoteProjectId || !current.remoteImportId) {

      setCandidates([]);

      return;

    }

    setCandidatesLoading(true);

    try {

      const response = await getRemotePlanImportCandidates(

        current.remoteProjectId,

        current.remoteImportId,

      );

      setCandidates(response.candidates);

    } catch {

      setCandidates([]);

    } finally {

      setCandidatesLoading(false);

    }

  }, []);

  const isReviewWorkspaceStatus = (status: PlanImportStatus) =>

    status === "ready_for_review" || status === "ready_for_approval";

  useFocusEffect(

    useCallback(() => {

      if (!user?.uid) {

        setPlanImport(null);

        setCandidates([]);

        return;

      }

      let active = true;

      async function load() {

        const found = await getPlanImportById(user!.uid, importId);

        if (!active) {

          return;

        }

        if (found && found.projectId !== projectId) {

          setPlanImport(null);

          setCandidates([]);

          return;

        }

        if (!found) {

          setPlanImport(null);

          setCandidates([]);

          return;

        }

        let current = found;

        if (

          current.remoteProjectId &&

          current.remoteImportId &&

          (current.status === "uploaded" ||

            current.status === "uploading" ||

            current.status === "failed" ||

            current.status === "processing" ||

            current.status === "ready_for_review" ||

            current.status === "ready_for_approval" ||

            current.status === "approved")

        ) {

          try {

            const remote = await getRemotePlanImport(

              current.remoteProjectId,

              current.remoteImportId,

            );

            if (!active) {

              return;

            }

            current = await applyRemoteSnapshot(

              user!.uid,

              current,

              remote.import,

            );

          } catch {

// Fall back to local record when remote fetch fails.

          }

        }

        if (!active) {

          return;

        }

// Approved imports are historical — open confirmation/success screen

// unless the user explicitly asked to view reviewed suggestions.

        if (current.status === "approved" && !historicalView) {

          setPlanImport(current);

          navigation.replace("PlanImportApproval", {

            projectId,

            importId,

          });

          return;

        }

        setPlanImport(current);

        if (

          isReviewWorkspaceStatus(current.status) ||

          (current.status === "approved" && historicalView)

        ) {

          await loadCandidates(current);

        } else {

          setCandidates([]);

        }

      }

      void load();

      return () => {

        active = false;

      };

    }, [

      user?.uid,

      importId,

      projectId,

      historicalView,

      applyRemoteSnapshot,

      loadCandidates,

      navigation,

    ]),

  );

// Poll while processing only; stop once ready_for_review / ready_for_approval.

  useFocusEffect(

    useCallback(() => {

      if (

        !user?.uid ||

        planImport?.status !== "processing" ||

        !planImport.remoteProjectId ||

        !planImport.remoteImportId

      ) {

        return;

      }

      let active = true;

      const remoteProjectId = planImport.remoteProjectId;

      const remoteImportId = planImport.remoteImportId;

      const poll = async () => {

        const latest = await getPlanImportById(user.uid, importId);

        if (!active || !latest) {

          return;

        }

        try {

          const remote = await getRemotePlanImport(

            remoteProjectId,

            remoteImportId,

          );

          if (!active) {

            return;

          }

          const updated = await applyRemoteSnapshot(

            user.uid,

            latest,

            remote.import,

          );

          if (!active) {

            return;

          }

          setPlanImport(updated);

          if (isReviewWorkspaceStatus(updated.status)) {

            await loadCandidates(updated);

          } else if (updated.status !== "processing") {

            setCandidates([]);

          }

        } catch {

// Keep polling through transient errors.

        }

      };

      const timer = setInterval(() => {

        void poll();

      }, POLL_INTERVAL_MS);

      return () => {

        active = false;

        clearInterval(timer);

      };

    }, [

      user?.uid,

      importId,

      planImport?.status,

      planImport?.remoteProjectId,

      planImport?.remoteImportId,

      applyRemoteSnapshot,

      loadCandidates,

    ]),

  );

  const summary = useMemo(

    () => summarizePlanImportReview(candidates),

    [candidates],

  );

  const readiness = useMemo(

    () => isPlanImportApprovalReady(candidates),

    [candidates],

  );

  const filteredCandidates = useMemo(

    () => filterPlanImportCandidates(candidates, filter),

    [candidates, filter],

  );

  const replaceCandidate = useCallback((next: RemotePlanImportCandidate) => {

    setCandidates((current) =>

      current.map((item) => (item.id === next.id ? next : item)),

    );

  }, []);

  const mergeCandidates = useCallback((nextList: RemotePlanImportCandidate[]) => {

    setCandidates((current) => {

      if (nextList.length === 0) {

        return current;

      }

      const byId = new Map(nextList.map((item) => [item.id, item]));

      return current.map((item) => byId.get(item.id) ?? item);

    });

  }, []);

  const handleBackToPlan = () => {

    navigation.navigate("Project", {

      projectId,

    });

  };

  const handleAnalyzeDocuments = async () => {

    if (

      !user?.uid ||

      !planImport?.remoteProjectId ||

      !planImport.remoteImportId ||

      analyzing

    ) {

      return;

    }

    setAnalyzing(true);

    try {

      const result = await processRemotePlanImport(

        planImport.remoteProjectId,

        planImport.remoteImportId,

      );

      const remoteStatus = mapRemoteStatusToLocal(

        result.import.status,

        "processing",

      );

      const nextStatus =

        remoteStatus === "uploaded" ? "processing" : remoteStatus;

      const updated = await updatePlanImport(user.uid, importId, {

        status: nextStatus,

        errorMessage: result.import.errorMessage ?? null,

      });

      setPlanImport(updated);

      if (isReviewWorkspaceStatus(nextStatus) && updated) {

        await loadCandidates(updated);

      } else {

        setCandidates([]);

      }

    } catch (error) {

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to start document analysis.";

      Alert.alert("Analysis failed", message);

    } finally {

      setAnalyzing(false);

    }

  };

  const handleRetryUpload = async () => {

    if (!user?.uid || !planImport || retrying) {

      return;

    }

    setRetrying(true);

    try {

      const result = await syncPlanImportToCloud(

        user.uid,

        projectId,

        planImport.id,

      );

      const refreshed = await getPlanImportById(user.uid, planImport.id);

      setPlanImport(refreshed);

      if (!result.synced) {

        Alert.alert(

          "Retry failed",

          result.errorMessage ?? "Unable to complete upload.",

        );

      }

    } finally {

      setRetrying(false);

    }

  };

  const handleRemoveImport = () => {

    if (!user?.uid || removing || !planImport) {

      return;

    }

    if (planImport.status === "approved") {

      Alert.alert(

        "Cannot remove",

        "Approved imports are kept as provenance for created Plan Items.",

      );

      return;

    }

    Alert.alert(

      "Remove import",

      "Remove this document import from this device? Cloud objects are not deleted in this phase. No Plan Items will be changed.",

      [

        { text: "Cancel", style: "cancel" },

        {

          text: "Remove",

          style: "destructive",

          onPress: () => {

            void (async () => {

              setRemoving(true);

              try {

                await deletePlanImport(user.uid, importId);

                navigation.navigate("Project", { projectId });

              } catch {

                Alert.alert(

                  "Unable to remove",

                  "The import could not be removed. Please try again.",

                );

              } finally {

                setRemoving(false);

              }

            })();

          },

        },

      ],

    );

  };

  const requireRemoteIds = () => {

    if (!planImport?.remoteProjectId || !planImport.remoteImportId) {

      Alert.alert(

        "Unavailable",

        "This import is not linked to the cloud yet.",

      );

      return null;

    }

    return {

      remoteProjectId: planImport.remoteProjectId,

      remoteImportId: planImport.remoteImportId,

    };

  };

  const handleToggleSelected = async (candidate: RemotePlanImportCandidate) => {

    const remote = requireRemoteIds();

    if (!remote || selectBusyId) {

      return;

    }

    const previous = candidate;

    const optimistic: RemotePlanImportCandidate = {

      ...candidate,

      selected: !candidate.selected,

    };

    replaceCandidate(optimistic);

    setSelectBusyId(candidate.id);

    try {

      const response = await patchRemotePlanImportCandidate(

        remote.remoteProjectId,

        remote.remoteImportId,

        candidate.id,

        {

          selected: optimistic.selected,

          expectedUpdatedAt: candidate.updatedAt,

        },

      );

      replaceCandidate(response.candidate);

    } catch (error) {

      replaceCandidate(previous);

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to update selection.";

      Alert.alert("Selection failed", message);

    } finally {

      setSelectBusyId(null);

    }

  };

  const handleBulkSelect = async (selected: boolean) => {

    const remote = requireRemoteIds();

    if (!remote || bulkBusy || candidates.length === 0) {

      return;

    }

    const previous = candidates;

    const candidateIds = candidates.map((item) => item.id);

    setCandidates((current) =>

      current.map((item) => ({ ...item, selected })),

    );

    setBulkBusy(true);

    try {

      const response = await batchSelectRemotePlanImportCandidates(

        remote.remoteProjectId,

        remote.remoteImportId,

        candidateIds,

        selected,

      );

      mergeCandidates(response.candidates);

    } catch (error) {

      setCandidates(previous);

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to update selections.";

      Alert.alert("Bulk update failed", message);

    } finally {

      setBulkBusy(false);

    }

  };

  const handleLooksGood = async (candidate: RemotePlanImportCandidate) => {

    const remote = requireRemoteIds();

    if (!remote || looksGoodBusyId) {

      return;

    }

    setLooksGoodBusyId(candidate.id);

    try {

      const response = await patchRemotePlanImportCandidate(

        remote.remoteProjectId,

        remote.remoteImportId,

        candidate.id,

        {

          reviewStatus: "reviewed",

          expectedUpdatedAt: candidate.updatedAt,

        },

      );

      replaceCandidate(response.candidate);

    } catch (error) {

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to mark as reviewed.";

      Alert.alert("Update failed", message);

    } finally {

      setLooksGoodBusyId(null);

    }

  };

  const handleSaveEdit = async (patch: PatchRemotePlanImportCandidateInput) => {

    const remote = requireRemoteIds();

    if (!remote || !editorCandidate || editorRemoving) {

      return;

    }

    setEditorSaving(true);

    try {

      const response = await patchRemotePlanImportCandidate(

        remote.remoteProjectId,

        remote.remoteImportId,

        editorCandidate.id,

        patch,

      );

      replaceCandidate(response.candidate);

      setEditorCandidate(null);

    } catch (error) {

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to save suggestion.";

      Alert.alert("Save failed", message);

    } finally {

      setEditorSaving(false);

    }

  };

  const handleRemoveEdit = async () => {

    const remote = requireRemoteIds();

    if (!remote || !editorCandidate || editorSaving || editorRemoving) {

      return;

    }

    const candidateId = editorCandidate.id;

    setEditorRemoving(true);

    try {

      await deleteRemotePlanImportCandidate(

        remote.remoteProjectId,

        remote.remoteImportId,

        candidateId,

      );

      setEditorCandidate(null);

      setExpandedCandidateId((current) =>

        current === candidateId ? null : current,

      );

      if (planImport) {

        await loadCandidates(planImport);

      }

    } catch (error) {

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to remove suggestion.";

      Alert.alert("Remove failed", message);

    } finally {

      setEditorRemoving(false);

    }

  };

  const handleContinueToApproval = async () => {

    const remote = requireRemoteIds();

    if (!remote || !user?.uid || continuing) {

      return;

    }

    if (!readiness.ready) {

      Alert.alert(

        "Not ready",

        readiness.reasons[0] ?? "Finish reviewing selected suggestions.",

      );

      return;

    }

    setContinuing(true);

    try {

      const result = await markRemotePlanImportReadyForApproval(

        remote.remoteProjectId,

        remote.remoteImportId,

      );

      const updated = await updatePlanImport(user.uid, importId, {

        status: mapRemoteStatusToLocal(

          result.import.status,

          "ready_for_approval",

        ),

        errorMessage: result.import.errorMessage ?? null,

      });

      setPlanImport(updated);

      setCandidates(result.candidates);

      navigation.navigate("PlanImportApproval", {

        projectId,

        importId,

      });

    } catch (error) {

      const message =

        error instanceof Error && error.message.trim()

          ? error.message

          : "Unable to continue to approval.";

      Alert.alert("Continue failed", message);

    } finally {

      setContinuing(false);

    }

  };

  if (planImport === undefined) {

    return (

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>

        <ImageBackground

source={SCREEN_BACKGROUND}

style={styles.background}

resizeMode="cover"

        >

          <View style={styles.centered}>

            <ActivityIndicator color={KEPLER_NAVY} />

            <Text style={styles.loadingText}>Loading import…</Text>

          </View>

        </ImageBackground>

      </SafeAreaView>

    );

  }

  if (!planImport) {

    return (

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>

        <ImageBackground

source={SCREEN_BACKGROUND}

style={styles.background}

resizeMode="cover"

        >

          <View style={styles.topBar}>

            <Pressable

style={({ pressed }) => [

                styles.backButton,

pressed && styles.backButtonPressed,

              ]}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Go back"

hitSlop={8}

            >

              <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />

            </Pressable>

            <Text style={styles.topBarTitle}>Generate plan</Text>

            <View style={styles.topBarSpacer} />

          </View>

          <View style={styles.centeredState}>

            <View style={styles.missingIcon}>

              <Ionicons

name="folder-open-outline"

size={24}

color={KEPLER_NAVY}

              />

            </View>

            <Text style={styles.eyebrow}>IMPORT WORKSPACE</Text>

            <Text style={styles.title}>Import not found</Text>

            <Text style={styles.bodyCentered}>

              This import may have been removed or is no longer available on

              this device.

            </Text>

            <Pressable

style={styles.primaryButton}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Back to Plan"

            >

              <Text style={styles.primaryButtonText}>Back to Plan</Text>

            </Pressable>

          </View>

        </ImageBackground>

      </SafeAreaView>

    );

  }

  const isUploaded = planImport.status === "uploaded";

  const isProcessing = planImport.status === "processing";

  const isFailed = planImport.status === "failed";

  const isHistoricalApproved =

    planImport.status === "approved" && historicalView;

  const isReviewWorkspace =

    isReviewWorkspaceStatus(planImport.status) || isHistoricalApproved;

  const canRetryProcess =

    planImport.status === "failed" &&

    !!planImport.remoteProjectId &&

    !!planImport.remoteImportId &&

    filesLookUploaded(planImport);

  const canRetryUpload =

    planImport.status === "draft" ||

    (planImport.status === "failed" && !canRetryProcess);

  const badgeTone = statusBadgeTone(planImport.status);

  const hasPrimaryAction = isUploaded || canRetryProcess || canRetryUpload;

  if (isReviewWorkspace) {

    const listHeader = (

      <View style={styles.reviewHeader}>

        <View style={styles.reviewIntroRow}>

          <Text style={styles.eyebrow}>AI PLAN GENERATION</Text>

          <View

style={[

              styles.statusBadge,

              {

                backgroundColor: badgeTone.backgroundColor,

                borderColor: badgeTone.borderColor,

              },

            ]}

          >

            <Text style={[styles.statusBadgeText, { color: badgeTone.color }]}>

              {isHistoricalApproved

                ? "APPROVED · HISTORICAL"

                : statusLabel(planImport.status).toUpperCase()}

            </Text>

          </View>

        </View>

        <Text style={styles.title}>

          {isHistoricalApproved

            ? "Reviewed suggestions"

            : "Review generated plan"}

        </Text>

        <Text style={styles.body}>

          {isHistoricalApproved

            ? "These suggestions were reviewed before Plan Items were created. They are historical and no longer editable."

            : "Review, edit, and select the suggestions that should become part of the project baseline."}

        </Text>

        {planImport.errorMessage ? (

          <View style={styles.errorBanner}>

            <Ionicons

name="alert-circle-outline"

size={18}

color={KEPLER_RED}

            />

            <View style={styles.errorBannerText}>

              <Text style={styles.errorBannerTitle}>Import needs attention</Text>

              <Text style={styles.errorBannerBody}>

                {planImport.errorMessage}

              </Text>

            </View>

          </View>

        ) : null}

        {candidatesLoading ? (

          <View style={styles.candidatesLoading}>

            <ActivityIndicator color={KEPLER_NAVY} />

          </View>

        ) : candidates.length === 0 ? (

          <View style={styles.emptyState}>

            <View style={styles.emptyIcon}>

              <Ionicons

name="document-text-outline"

size={22}

color={KEPLER_NAVY}

              />

            </View>

            <Text style={styles.emptyTitle}>No measurable items found</Text>

            <Text style={styles.emptyBody}>

              Kepler did not identify measurable plan candidates in these

              documents.

            </Text>

          </View>

        ) : (

          <>

            <View style={styles.summaryWrap}>

              <PlanReviewSummary

metrics={{

                  total: summary.total,

                  selected: summary.selected,

                  reviewed: summary.reviewed,

                  needsAttention: summary.needsAttention,

                }}

              />

            </View>

            <View style={styles.toolbarWrap}>

              <View style={styles.toolbarHeadingRow}>
                <View style={styles.toolbarHeadingText}>
                  <Text style={styles.toolbarEyebrow}>REVIEW QUEUE</Text>
                  <Text style={styles.toolbarTitle}>Plan suggestions</Text>
                </View>

                <View style={styles.toolbarCountBadge}>
                  <Text style={styles.toolbarCountBadgeText}>
                    {filteredCandidates.length}
                  </Text>
                </View>
              </View>

              <PlanReviewToolbar
                filter={filter}
                onFilterChange={setFilter}
                onSelectAll={() => {
                  if (!isHistoricalApproved) {
                    void handleBulkSelect(true);
                  }
                }}
                onDeselectAll={() => {
                  if (!isHistoricalApproved) {
                    void handleBulkSelect(false);
                  }
                }}
                bulkBusy={bulkBusy || isHistoricalApproved}
              />

            </View>

            {filteredCandidates.length === 0 ? (

              <Text style={styles.filterEmpty}>

                No suggestions match this filter.

              </Text>

            ) : null}

          </>

        )}

      </View>

    );

    const listFooter =

      candidates.length === 0 && !candidatesLoading ? (

        <View style={styles.reviewFooter}>

          <Pressable

style={styles.primaryButton}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Back to Plan"

          >

            <Text style={styles.primaryButtonText}>Back to Plan</Text>

          </Pressable>

          {!isHistoricalApproved ? (

            <Pressable

style={styles.destructiveButton}

onPress={handleRemoveImport}

disabled={removing}

accessibilityRole="button"

accessibilityLabel="Remove import"

            >

              {removing ? (

                <ActivityIndicator color={KEPLER_RED} />

              ) : (

                <Text style={styles.destructiveButtonText}>Remove import</Text>

              )}

            </Pressable>

          ) : null}

        </View>

      ) : candidates.length > 0 ? (

        <View style={styles.reviewFooter}>

          {isHistoricalApproved ? (

            <Pressable

style={styles.primaryButton}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="View Plan"

            >

              <Text style={styles.primaryButtonText}>View Plan</Text>

            </Pressable>

          ) : (

            <>

              {!readiness.ready ? (

                <View style={styles.readinessHintRow}>

                  <Ionicons

name="information-circle-outline"

size={16}

color={TEXT_SECONDARY}

                  />

                  <Text style={styles.readinessHint}>

                    {readiness.reasons[0] ??

                      "Finish reviewing selected suggestions to continue."}

                  </Text>

                </View>

              ) : null}

              <Pressable

style={[

                  styles.primaryButton,

                  !readiness.ready || continuing

                    ? styles.primaryButtonDisabled

                    : null,

                ]}

onPress={() => {

                  void handleContinueToApproval();

                }}

disabled={!readiness.ready || continuing}

accessibilityRole="button"

accessibilityLabel="Continue to approval"

accessibilityState={{

                  disabled: !readiness.ready || continuing,

                }}

              >

                {continuing ? (

                  <ActivityIndicator color="#FFFFFF" />

                ) : (

                  <Text style={styles.primaryButtonText}>

                    Continue to approval

                  </Text>

                )}

              </Pressable>

              <Pressable

style={styles.secondaryButton}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Back to Plan"

              >

                <Text style={styles.secondaryButtonText}>Back to Plan</Text>

              </Pressable>

            </>

          )}

        </View>

      ) : null;

    return (

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>

        <ImageBackground

source={SCREEN_BACKGROUND}

style={styles.background}

resizeMode="cover"

        >

          <View style={styles.topBar}>

            <Pressable

style={({ pressed }) => [

                styles.backButton,

                pressed && styles.backButtonPressed,

              ]}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Go back"

hitSlop={8}

            >

              <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />

            </Pressable>

            <Text style={styles.topBarTitle}>Review generated plan</Text>

            <View style={styles.topBarSpacer} />

          </View>

          <FlatList

data={

              candidatesLoading || candidates.length === 0

                ? []

                : filteredCandidates

            }

keyExtractor={(item) => item.id}

contentContainerStyle={styles.reviewListContent}

ListHeaderComponent={listHeader}

ListFooterComponent={listFooter}

renderItem={({ item }) => (

              <PlanCandidateCard

candidate={item}

sourceFileName={resolveSourceFileName(item, planImport.files)}

selectBusy={selectBusyId === item.id || isHistoricalApproved}

looksGoodBusy={

                    looksGoodBusyId === item.id || isHistoricalApproved

                  }

expanded={expandedCandidateId === item.id}

onToggleExpanded={() => {
                  setExpandedCandidateId((current) =>
                    current === item.id ? null : item.id,
                  );
                }}

onToggleSelected={() => {

                    if (!isHistoricalApproved) {

                      void handleToggleSelected(item);

                    }

                  }}

onEdit={() => {

                    if (!isHistoricalApproved) {

                      setEditorCandidate(item);

                    }

                  }}

onViewSource={() => setSourceCandidate(item)}

onLooksGood={() => {

                    if (!isHistoricalApproved) {

                      void handleLooksGood(item);

                    }

                  }}

                />

            )}

ItemSeparatorComponent={() => <View style={styles.candidateSeparator} />}

showsVerticalScrollIndicator={false}

          />

          <PlanCandidateEditor

visible={editorCandidate != null}

candidate={editorCandidate}

saving={editorSaving}

removing={editorRemoving}

onClose={() => {

              if (!editorSaving && !editorRemoving) {

                setEditorCandidate(null);

              }

            }}

onSave={(patch) => {

              void handleSaveEdit(patch);

            }}

onRemove={

              isHistoricalApproved

                ? undefined

                : () => {

                    void handleRemoveEdit();

                  }

            }

          />

          <PlanCandidateSource

visible={sourceCandidate != null}

candidate={sourceCandidate}

sourceFileName={

              sourceCandidate

                ? resolveSourceFileName(sourceCandidate, planImport.files)

                : undefined

            }

onClose={() => setSourceCandidate(null)}

          />

        </ImageBackground>

      </SafeAreaView>

    );

  }

  return (

    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>

      <ImageBackground

source={SCREEN_BACKGROUND}

style={styles.background}

resizeMode="cover"

      >

        <View style={styles.topBar}>

          <Pressable

style={({ pressed }) => [

              styles.backButton,

pressed && styles.backButtonPressed,

            ]}

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Go back"

hitSlop={8}

          >

            <Ionicons name="chevron-back" size={24} color={KEPLER_NAVY} />

          </Pressable>

          <Text style={styles.topBarTitle}>Generate plan</Text>

          <View style={styles.topBarSpacer} />

        </View>

        <ScrollView

style={styles.scroll}

contentContainerStyle={styles.container}

showsVerticalScrollIndicator={false}

        >

          <Text style={styles.eyebrow}>DOCUMENT IMPORT</Text>

          <Text style={styles.title}>

            {isProcessing

              ? "Analyzing documents"

              : isUploaded

                ? "Documents ready"

                : isFailed

                  ? "Import needs attention"

                  : "Document import"}

          </Text>

          <Text style={styles.body}>

            {isProcessing

              ? "Kepler is extracting measurable quantities, units, and plan candidates."

              : isUploaded

                ? `${planImport.files.length} document${planImport.files.length === 1 ? " is" : "s are"} securely stored and ready for analysis.`

                : `${planImport.files.length} project document${planImport.files.length === 1 ? "" : "s"} selected.`}

          </Text>

          <View

style={[

              styles.statusBadge,

              styles.statusBadgeSolo,

              {

                backgroundColor: badgeTone.backgroundColor,

                borderColor: badgeTone.borderColor,

              },

            ]}

          >

            <Text style={[styles.statusBadgeText, { color: badgeTone.color }]}>

              {statusLabel(planImport.status).toUpperCase()}

            </Text>

          </View>

          {planImport.errorMessage ? (

            <View style={styles.errorBanner}>

              <Ionicons

name="alert-circle-outline"

size={18}

color={KEPLER_RED}

              />

              <View style={styles.errorBannerText}>

                <Text style={styles.errorBannerTitle}>Import needs attention</Text>

                <Text style={styles.errorBannerBody}>

                  {planImport.errorMessage}

                </Text>

              </View>

            </View>

          ) : null}

          <Text style={styles.sectionLabel}>Source documents</Text>

          <View style={styles.fileList}>

            <View
              pointerEvents="none"
              style={styles.sectionTopAccent}
            >
              <View style={styles.sectionTopAccentBlue} />
              <View style={styles.sectionTopAccentRed} />
            </View>

            {planImport.files.map((file, index) => (

              <View

key={file.id}

style={[

                  styles.fileRow,

index === planImport.files.length - 1

                    ? styles.fileRowLast

                    : null,

                ]}

              >

                <Ionicons

name={

file.type === "pdf"

                      ? "document-text-outline"

                      : "image-outline"

                  }

size={18}

color={KEPLER_NAVY}

                />

                <View style={styles.fileText}>

                  <Text style={styles.fileName} numberOfLines={2}>

                    {file.name}

                  </Text>

                </View>

                <View style={styles.fileTypeBadge}>

                  <Text style={styles.fileTypeBadgeText}>

                    {fileTypeLabel(file.type)}

                  </Text>

                </View>

              </View>

            ))}

          </View>

          {isProcessing ? (

            <View style={styles.analysisCard}>

              <View
                pointerEvents="none"
                style={styles.sectionTopAccent}
              >
                <View style={styles.sectionTopAccentBlue} />
                <View style={styles.sectionTopAccentRed} />
              </View>

              <View style={styles.processingIcon}>
                <ActivityIndicator size="small" color={KEPLER_NAVY} />
              </View>

              <Text style={styles.analysisEyebrow}>AI PROCESSING</Text>

              <Text style={styles.analysisTitle}>
                Analyzing project documents
              </Text>

              <Text style={styles.analysisBody}>
                Kepler is extracting measurable quantities, units, and plan
                candidates.
              </Text>

              <View style={styles.analysisHintRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={TEXT_MUTED}
                />
                <Text style={styles.analysisHint}>
                  You can leave this screen and return later.
                </Text>
              </View>

            </View>

          ) : null}

          {isUploaded ? (

            <Pressable

style={styles.primaryButton}

onPress={() => {

                void handleAnalyzeDocuments();

              }}

disabled={analyzing}

accessibilityRole="button"

accessibilityLabel="Analyze documents"

            >

              {analyzing ? (

                <ActivityIndicator color="#FFFFFF" />

              ) : (

                <View style={styles.primaryButtonContent}>

                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />

                  <Text style={styles.primaryButtonText}>

                    Analyze documents

                  </Text>

                </View>

              )}

            </Pressable>

          ) : null}

          {canRetryProcess ? (

            <Pressable

style={styles.primaryButton}

onPress={() => {

                void handleAnalyzeDocuments();

              }}

disabled={analyzing}

accessibilityRole="button"

accessibilityLabel="Try analysis again"

            >

              {analyzing ? (

                <ActivityIndicator color="#FFFFFF" />

              ) : (

                <Text style={styles.primaryButtonText}>Try analysis again</Text>

              )}

            </Pressable>

          ) : null}

          {canRetryUpload ? (

            <Pressable

style={

                hasPrimaryAction && (isUploaded || canRetryProcess)

                  ? styles.secondaryButton

                  : styles.primaryButton

              }

onPress={() => {

                void handleRetryUpload();

              }}

disabled={retrying}

accessibilityRole="button"

accessibilityLabel="Retry upload"

            >

              {retrying ? (

                <ActivityIndicator

color={

                    hasPrimaryAction && (isUploaded || canRetryProcess)

                      ? KEPLER_NAVY

                      : "#FFFFFF"

                  }

                />

              ) : (

                <Text

style={

                    hasPrimaryAction && (isUploaded || canRetryProcess)

                      ? styles.secondaryButtonText

                      : styles.primaryButtonText

                  }

                >

                  Retry upload

                </Text>

              )}

            </Pressable>

          ) : null}

          <Pressable

style={

              hasPrimaryAction || isProcessing

                ? styles.secondaryButton

                : styles.primaryButton

            }

onPress={handleBackToPlan}

accessibilityRole="button"

accessibilityLabel="Back to Plan"

          >

            <Text

style={

                hasPrimaryAction || isProcessing

                  ? styles.secondaryButtonText

                  : styles.primaryButtonText

              }

            >

              Back to Plan

            </Text>

          </Pressable>

          <Pressable

style={styles.destructiveButton}

onPress={handleRemoveImport}

disabled={removing}

accessibilityRole="button"

accessibilityLabel="Remove import"

          >

            {removing ? (

              <ActivityIndicator color={KEPLER_RED} />

            ) : (

              <Text style={styles.destructiveButtonText}>Remove import</Text>

            )}

          </Pressable>

        </ScrollView>

      </ImageBackground>

    </SafeAreaView>

  );

}

const styles = StyleSheet.create({

  safeArea: {

    flex: 1,

    backgroundColor: "#F8FAFC",

  },

  background: {

    flex: 1,

    width: "100%",

    height: "100%",

  },

  scroll: {

    flex: 1,

  },

  topBar: {

    minHeight: 56,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    paddingHorizontal: 18,

  },

  backButton: {

    width: 40,

    height: 40,

    alignItems: "center",

    justifyContent: "center",

  },

  backButtonPressed: {

    opacity: 0.72,

  },

  topBarTitle: {

    ...typography.bodyMedium,

    color: TEXT_PRIMARY,

    fontWeight: "700",

  },

  topBarSpacer: {

    width: 40,

  },

  container: {

    paddingHorizontal: 18,

    paddingTop: 6,

    paddingBottom: 40,

  },

  reviewListContent: {

    paddingHorizontal: 18,

    paddingTop: 6,

    paddingBottom: 48,

  },

  reviewHeader: {

    marginBottom: 8,

  },

  reviewIntroRow: {

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 10,

  },

  summaryWrap: {

    marginTop: 16,

  },

  toolbarWrap: {

    marginTop: 14,

    marginBottom: 8,

    gap: 10,

  },

  toolbarInner: {

    paddingHorizontal: 0,

  },

  toolbarHeadingRow: {

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 12,

    marginBottom: 10,

  },

  toolbarHeadingText: {

    flex: 1,

    minWidth: 0,

  },

  toolbarEyebrow: {

    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",

    letterSpacing: 0.9,

  },

  toolbarTitle: {

    ...typography.bodyMedium,

    color: TEXT_PRIMARY,

    fontWeight: "700",

    marginTop: 2,

  },

  toolbarCountBadge: {

    minWidth: 30,

    height: 28,

    paddingHorizontal: 8,

    borderRadius: 999,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(1,33,105,0.065)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

    flexShrink: 0,

  },

  toolbarCountBadgeText: {

    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",

  },

  cardWrap: {

    marginBottom: 0,

  },

  candidateSeparator: {

    height: StyleSheet.hairlineWidth,

    backgroundColor: "rgba(1,33,105,0.10)",

    marginLeft: CANDIDATE_TEXT_INDENT,

  },

  reviewFooter: {

    marginTop: 8,

    paddingBottom: 8,

  },

  centered: {

    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    gap: 12,

    paddingHorizontal: 24,

  },

  centeredState: {

    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: 28,

  },

  loadingText: {

    ...typography.body,

    color: TEXT_SECONDARY,

  },

  missingIcon: {

    width: 52,

    height: 52,

    borderRadius: 16,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(1,33,105,0.06)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

    marginBottom: 14,

  },

  eyebrow: {

    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",

    letterSpacing: 1.1,

  },

  title: {

    ...typography.title,

    color: TEXT_PRIMARY,

    marginTop: 8,

  },

  body: {

    ...typography.body,

    color: TEXT_SECONDARY,

    marginTop: 8,

    lineHeight: 22,

  },

  bodyCentered: {

    ...typography.body,

    color: TEXT_SECONDARY,

    marginTop: 8,

    textAlign: "center",

    lineHeight: 22,

  },

  statusBadge: {

    borderWidth: StyleSheet.hairlineWidth,

    borderRadius: 999,

    paddingHorizontal: 10,

    paddingVertical: 5,

    flexShrink: 1,

  },

  statusBadgeSolo: {

    alignSelf: "flex-start",

    marginTop: 14,

  },

  statusBadgeText: {

    ...typography.metadata,

    fontWeight: "700",

    letterSpacing: 0.6,

  },

  sectionLabel: {

    ...typography.caption,

    color: TEXT_MUTED,

    fontWeight: "700",

    marginTop: 20,

    marginBottom: 8,

  },

  errorBanner: {

    marginTop: 14,

    flexDirection: "row",

    alignItems: "flex-start",

    gap: 10,

    paddingVertical: 12,

    paddingHorizontal: 12,

    backgroundColor: "rgba(227,24,55,0.04)",

    borderLeftWidth: 2,

    borderLeftColor: KEPLER_RED,

    borderRadius: 12,

  },

  errorBannerText: {

    flex: 1,

    minWidth: 0,

  },

  errorBannerTitle: {

    ...typography.bodyMedium,

    color: KEPLER_RED,

    fontWeight: "700",

  },

  errorBannerBody: {

    ...typography.caption,

    color: TEXT_SECONDARY,

    marginTop: 3,

    lineHeight: 18,

  },

  sectionTopAccent: {

    position: "absolute",

    top: 0,

    left: 0,

    right: 0,

    height: 2,

    flexDirection: "row",

    zIndex: 2,

  },

  sectionTopAccentBlue: {

    flex: 1,

    backgroundColor: KEPLER_NAVY,

  },

  sectionTopAccentRed: {

    width: 34,

    backgroundColor: KEPLER_RED,

  },

  fileList: {

    backgroundColor: CARD_BACKGROUND,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

    borderRadius: 18,

    overflow: "hidden",

    position: "relative",

    paddingTop: 2,

  },

  fileRow: {

    flexDirection: "row",

    alignItems: "center",

    gap: 12,

    paddingHorizontal: 14,

    paddingVertical: 12,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: "rgba(1,33,105,0.08)",

  },

  fileRowLast: {

    borderBottomWidth: 0,

  },

  fileText: {

    flex: 1,

    minWidth: 0,

  },

  fileName: {

    ...typography.bodyMedium,

    color: TEXT_PRIMARY,

  },

  fileTypeBadge: {

    paddingHorizontal: 8,

    paddingVertical: 3,

    borderRadius: 999,

    backgroundColor: "rgba(1,33,105,0.06)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

  },

  fileTypeBadgeText: {

    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",

    letterSpacing: 0.5,

  },

  analysisCard: {

    marginTop: 18,

    backgroundColor: "rgba(255,255,255,0.72)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

    borderRadius: 18,

    paddingVertical: 22,

    paddingHorizontal: 18,

    alignItems: "center",

    overflow: "hidden",

    position: "relative",

  },

  processingIcon: {

    width: 44,

    height: 44,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(1,33,105,0.055)",

    marginBottom: 4,

  },

  analysisEyebrow: {

    ...typography.metadata,

    color: KEPLER_NAVY,

    fontWeight: "700",

    letterSpacing: 1.1,

    marginTop: 2,

  },

  analysisTitle: {

    ...typography.sectionTitle,

    color: TEXT_PRIMARY,

    textAlign: "center",

    marginTop: 4,

  },

  analysisBody: {

    ...typography.body,

    color: TEXT_SECONDARY,

    textAlign: "center",

    lineHeight: 22,

    maxWidth: 310,

    marginTop: 4,

  },

  analysisHintRow: {

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 5,

    marginTop: 10,

  },

  analysisHint: {

    ...typography.caption,

    color: TEXT_MUTED,

    textAlign: "center",

  },

  candidatesLoading: {

    paddingVertical: 24,

    alignItems: "center",

  },

  emptyState: {

    marginTop: 20,

    alignItems: "center",

    paddingVertical: 18,

    paddingHorizontal: 12,

  },

  emptyIcon: {

    width: 48,

    height: 48,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(1,33,105,0.06)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

    marginBottom: 12,

  },

  emptyTitle: {

    ...typography.bodyMedium,

    color: TEXT_PRIMARY,

    fontWeight: "700",

    textAlign: "center",

  },

  emptyBody: {

    ...typography.caption,

    color: TEXT_SECONDARY,

    textAlign: "center",

    marginTop: 6,

    lineHeight: 18,

    maxWidth: 300,

  },

  filterEmpty: {

    ...typography.body,

    color: TEXT_MUTED,

    marginTop: 8,

    marginBottom: 8,

  },

  readinessHintRow: {

    flexDirection: "row",

    alignItems: "flex-start",

    gap: 8,

    marginBottom: 10,

    paddingHorizontal: 4,

  },

  readinessHint: {

    ...typography.caption,

    color: TEXT_SECONDARY,

    flex: 1,

    lineHeight: 18,

  },

  primaryButton: {

    marginTop: 18,

    minHeight: 52,

    borderRadius: 16,

    backgroundColor: KEPLER_NAVY,

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: 16,

  },

  primaryButtonContent: {

    flexDirection: "row",

    alignItems: "center",

    gap: 8,

  },

  primaryButtonDisabled: {

    opacity: 0.45,

  },

  primaryButtonText: {

    ...typography.bodyMedium,

    color: "#FFFFFF",

    fontWeight: "700",

  },

  secondaryButton: {

    marginTop: 12,

    minHeight: 48,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(255,255,255,0.55)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: BORDER,

    paddingHorizontal: 16,

  },

  secondaryButtonText: {

    ...typography.button,

    color: KEPLER_NAVY,

    fontWeight: "700",

  },

  destructiveButton: {

    marginTop: 12,

    minHeight: 48,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(255,255,255,0.45)",

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: "rgba(227,24,55,0.12)",

    paddingHorizontal: 16,

  },

  destructiveButtonText: {

    ...typography.button,

    color: KEPLER_RED,

    fontWeight: "700",

  },

});