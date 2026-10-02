import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthProvider";
import OrbGlow from "../components/visuals/OrbGlow";
import type { MainTabParamList, ProjectWorkspaceTab, RootStackParamList } from "../navigation/types";
import { getProjects } from "../store/projects";
import type { Project } from "../types/project";
import { colors, typography } from "../theme/colors";
import { useKeplerProjectContext } from "../hooks/useKeplerProjectContext";
import {
  buildAttentionAnswer,
  buildLargestVarianceAnswer,
  buildProgressAnswer,
  buildRecentActivityAnswer,
  KEPLER_PROMPTS,
  type KeplerDeterministicResponse,
  type KeplerPromptKind,
} from "../utils/domain/keplerProjectAnswers";
import { getKeplerSelectedProject, setKeplerSelectedProject } from "../utils/domain/keplerProjectSelection";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Capture">,
  NativeStackScreenProps<RootStackParamList>
>;

type StarterAction = {
  kind: KeplerPromptKind;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

type ProjectChoice = Pick<Project, "id" | "name" | "location">;

const STARTER_ACTIONS: readonly StarterAction[] = [
  { kind: "attention", label: KEPLER_PROMPTS[0].label, icon: "checkbox-outline" },
  { kind: "progress", label: KEPLER_PROMPTS[1].label, icon: "bar-chart-outline" },
  { kind: "variance", label: KEPLER_PROMPTS[2].label, icon: "git-compare-outline" },
  { kind: "activity", label: KEPLER_PROMPTS[3].label, icon: "time-outline" },
];

function getGreeting(displayName: string | null | undefined): string {
  const hour = new Date().getHours();
  const daypart = hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 17
      ? "Good afternoon"
      : "Good evening";
  const firstName = displayName?.trim().split(/\s+/).filter(Boolean)[0];
  return firstName ? `${daypart}, ${firstName}` : daypart;
}

export default function KeplerAIScreen({ navigation }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [selectionVisible, setSelectionVisible] = useState(false);
  const [projects, setProjects] = useState<ProjectChoice[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectChoice | null>(() => {
    const selected = getKeplerSelectedProject(user?.uid);
    return selected ? { id: selected.id, name: selected.name, location: selected.location } : null;
  });
  const [answer, setAnswer] = useState<KeplerDeterministicResponse | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const projectContext = useKeplerProjectContext(user?.uid, selectedProject?.id);

  const greeting = useMemo(() => getGreeting(user?.displayName), [user?.displayName]);

  React.useEffect(() => {
    const selected = getKeplerSelectedProject(user?.uid);
    setSelectedProject(selected ? { id: selected.id, name: selected.name, location: selected.location } : null);
    setAnswer(null);
  }, [user?.uid]);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const openProjectSelection = useCallback(() => {
    setProjects([]);
    setProjectLoadError(false);
    setSelectionVisible(true);
    setLoadingProjects(true);

    if (!user?.uid) {
      setLoadingProjects(false);
      setProjectLoadError(true);
      return;
    }

    void getProjects(user.uid)
      .then((localProjects) => setProjects(localProjects.map(({ id, name, location }) => ({ id, name, location }))))
      .catch(() => setProjectLoadError(true))
      .finally(() => setLoadingProjects(false));
  }, [user?.uid]);

  const selectProject = (project: ProjectChoice) => {
    setSelectionVisible(false);
    if (user?.uid) setKeplerSelectedProject({ ...project, ownerUid: user.uid });
    setSelectedProject(project);
    setAnswer(null);
  };

  const openCaptureWorkspace = () => navigation.navigate("CaptureWorkspace");

  const submitStarter = (action: StarterAction) => {
    const context = projectContext.context;
    if (!context || projectContext.loading || projectContext.error || !selectedProject) return;
    const nextAnswer = action.kind === "attention"
      ? buildAttentionAnswer(context.project.id, context.todos)
      : action.kind === "progress"
        ? buildProgressAnswer(context.project.id, context.progressAvailable ? context.progress : null)
        : action.kind === "variance"
          ? buildLargestVarianceAnswer(context.project.id, context.variances, context.varianceLabels, context.varianceAvailable)
          : buildRecentActivityAnswer(context.project.id, context.activity);
    setAnswer(nextAnswer);
  };

  const openAnswerDestination = (destination: KeplerDeterministicResponse["destination"]) => {
    if (!selectedProject) return;
    const initialTab: ProjectWorkspaceTab = destination === "todo"
      ? "todo"
      : destination === "project"
        ? "project"
        : "workProgress";
    navigation.navigate("Project", { projectId: selectedProject.id, initialTab });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.headerTitle}>Kepler AI</Text>
          <Pressable
            style={styles.headerSide}
            disabled
            accessibilityRole="button"
            accessibilityLabel="Conversation history unavailable"
            accessibilityState={{ disabled: true }}
          >
            <Ionicons name="time-outline" size={21} color={colors.text.muted} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (answer) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <Pressable
            style={styles.projectSelector}
            onPress={openProjectSelection}
            accessibilityRole="button"
            accessibilityLabel={selectedProject ? `Change project context, currently ${selectedProject.name}` : "Select project context"}
          >
            <View style={styles.projectSelectorCopy}>
              <Text style={styles.projectEyebrow}>PROJECT CONTEXT</Text>
              <Text style={styles.projectSelectorName} numberOfLines={1}>
                {selectedProject?.name ?? "Select a project"}
              </Text>
              {selectedProject?.location ? <Text style={styles.selectorProjectLocation}>{selectedProject.location}</Text> : null}
            </View>
            <Ionicons name="chevron-down" size={18} color={KEPLER_NAVY} />
          </Pressable>

          <View style={styles.hero}>
            <OrbGlow size={104} animated decorative accessibilityLabel="" />
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.supportingCopy}>
              {selectedProject ? `Ask about ${selectedProject.name}.` : "How can I help with your projects?"}
            </Text>
          </View>

          {selectedProject && projectContext.loading ? (
            <View style={styles.contextStatus} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={KEPLER_NAVY} />
              <Text style={styles.contextStatusText}>Loading project context…</Text>
            </View>
          ) : null}
          {selectedProject && projectContext.error ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorText}>Unable to load project context.</Text>
              <Pressable onPress={projectContext.retry} accessibilityRole="button" accessibilityLabel="Retry loading project context">
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.promptSection}>
            <Text style={styles.sectionTitle}>Explore your project</Text>
            {STARTER_ACTIONS.map((action) => {
              const disabled = !selectedProject || projectContext.loading || projectContext.error;
              return (
                <Pressable
                  key={action.kind}
                  style={({ pressed }) => [
                    styles.promptCard,
                    pressed && !disabled && styles.promptCardPressed,
                    disabled && styles.promptCardUnavailable,
                  ]}
                  disabled={disabled}
                  onPress={() => submitStarter(action)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={{ disabled }}
                >
                  <Ionicons
                    name={action.icon}
                    size={19}
                    color={disabled ? colors.text.muted : KEPLER_NAVY}
                  />
                  <Text style={[styles.promptText, disabled && styles.unavailableText]}>
                    {action.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={17} color="#98A2B3" />
                </Pressable>
              );
            })}
          </View>

          {answer && selectedProject ? (
            <View style={styles.answerCard}>
              <View style={styles.answerIdentity}>
                <View style={styles.answerDot}><Ionicons name="sparkles" size={13} color="#FFFFFF" /></View>
                <Text style={styles.answerIdentityText}>Kepler AI · Project facts</Text>
              </View>
              <Text style={styles.answerPrompt}>{answer.prompt}</Text>
              <Text style={styles.answerTitle}>{answer.title}</Text>
              <Text style={styles.answerSummary}>{answer.summary}</Text>
              {answer.bullets.map((bullet, index) => (
                <View key={`${answer.id}:${index}`} style={styles.answerBulletRow}>
                  <View style={styles.answerBullet} />
                  <Text style={styles.answerBulletText}>{bullet}</Text>
                </View>
              ))}
              <Pressable
                style={styles.answerCta}
                onPress={() => openAnswerDestination(answer.destination)}
                accessibilityRole="button"
                accessibilityLabel={`${answer.ctaLabel} for ${selectedProject.name}`}
              >
                <Text style={styles.answerCtaText}>{answer.ctaLabel}</Text>
                <Ionicons name="arrow-forward" size={15} color={KEPLER_NAVY} />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.composerArea,
            { marginBottom: keyboardVisible ? 6 : Math.max(insets.bottom, 8) + 74 },
          ]}
        >
          <View style={styles.composer}>
            <Pressable
              style={styles.composerAction}
              onPress={openCaptureWorkspace}
              accessibilityRole="button"
              accessibilityLabel="Open field capture options"
              hitSlop={6}
            >
              <Ionicons name="add" size={24} color={KEPLER_NAVY} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask Kepler AI..."
              placeholderTextColor="#98A2B3"
              multiline
              blurOnSubmit={false}
              returnKeyType="default"
              accessibilityLabel="Draft a question for Kepler AI"
            />
            <Pressable
              style={styles.composerAction}
              onPress={openCaptureWorkspace}
              accessibilityRole="button"
              accessibilityLabel="Open Capture for camera options"
              hitSlop={6}
            >
              <Ionicons name="camera-outline" size={20} color={KEPLER_NAVY} />
            </Pressable>
            <Pressable
              style={[styles.composerAction, styles.disabledAction]}
              disabled
              accessibilityRole="button"
              accessibilityLabel="Voice input unavailable"
              accessibilityState={{ disabled: true }}
            >
              <Ionicons name="mic-outline" size={20} color={colors.text.muted} />
            </Pressable>
          </View>
          <Text style={styles.composerNote}>Draft only · Kepler AI chat is coming next</Text>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={selectionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectionVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setSelectionVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close project selection"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose a project</Text>
            <Text style={styles.modalSubtitle}>Owner projects available on this device</Text>
            {loadingProjects ? (
              <ActivityIndicator color={KEPLER_NAVY} style={styles.loader} />
            ) : projects.length ? (
              <ScrollView style={styles.projectList}>
                {projects.map((project) => (
                  <Pressable
                    key={project.id}
                    style={styles.projectRow}
                    onPress={() => selectProject(project)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${project.name}`}
                  >
                    <View style={styles.projectIcon}>
                      <Ionicons name="business-outline" size={19} color={KEPLER_NAVY} />
                    </View>
                    <View style={styles.projectCopy}>
                      <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                      {!!project.location.trim() && (
                        <Text style={styles.projectLocation} numberOfLines={1}>{project.location}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#98A2B3" />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyProjects}>
                {projectLoadError
                  ? "Projects could not be loaded. Please try again."
                  : "No projects are available yet."}
              </Text>
            )}
            <Text style={styles.modalFootnote}>
              Shared projects aren’t available for Kepler project facts yet.
            </Text>
            <Pressable
              style={styles.modalCancel}
              onPress={() => setSelectionVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel project selection"
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const KEPLER_NAVY = "#012169";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#FAFBFD" },
  header: {
    height: 52,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E7EAF0",
    backgroundColor: "#FFFFFF",
  },
  headerSide: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.bodyMedium, color: colors.brand.navy },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  projectSelector: {
    minHeight: 58,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E8EF",
    backgroundColor: "#FFFFFF",
  },
  projectSelectorCopy: { flex: 1, paddingRight: 12 },
  projectEyebrow: { ...typography.metadata, color: colors.text.muted, letterSpacing: 0.6 },
  projectSelectorName: { ...typography.bodyMedium, color: KEPLER_NAVY, marginTop: 1 },
  selectorProjectLocation: { ...typography.metadata, color: colors.text.secondary, marginTop: 1 },
  hero: { alignItems: "center", paddingTop: 22, paddingBottom: 24 },
  greeting: { ...typography.title, color: colors.brand.navy, marginTop: 5, textAlign: "center" },
  supportingCopy: { ...typography.body, color: colors.text.secondary, marginTop: 5, textAlign: "center" },
  promptSection: { width: "100%", maxWidth: 540, alignSelf: "center" },
  sectionTitle: { ...typography.caption, color: colors.text.muted, marginBottom: 10, marginLeft: 2 },
  promptCard: {
    minHeight: 54,
    paddingHorizontal: 14,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E9F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172B4D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    elevation: 1,
  },
  promptCardPressed: { backgroundColor: "#F5F8FC", opacity: 0.88 },
  promptCardUnavailable: { backgroundColor: "#F8F9FB", borderColor: "#ECEFF3" },
  promptText: { ...typography.bodyMedium, color: colors.brand.navy, flex: 1 },
  unavailableText: { color: colors.text.muted },
  contextStatus: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  contextStatusText: { ...typography.caption, color: colors.text.secondary },
  errorPanel: { paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { ...typography.caption, color: colors.text.secondary },
  retryText: { ...typography.bodyMedium, color: KEPLER_NAVY },
  answerCard: { marginTop: 6, marginBottom: 14, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E1E6EE", backgroundColor: "#FFFFFF" },
  answerIdentity: { flexDirection: "row", alignItems: "center", gap: 7 },
  answerDot: { width: 23, height: 23, borderRadius: 12, backgroundColor: KEPLER_NAVY, alignItems: "center", justifyContent: "center" },
  answerIdentityText: { ...typography.metadata, color: KEPLER_NAVY },
  answerPrompt: { ...typography.metadata, color: colors.text.muted, marginTop: 13 },
  answerTitle: { ...typography.bodyMedium, color: colors.text.primary, marginTop: 5 },
  answerSummary: { ...typography.body, color: colors.text.primary, marginTop: 4 },
  answerBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 8, paddingLeft: 2 },
  answerBullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: KEPLER_NAVY, marginTop: 7 },
  answerBulletText: { ...typography.body, color: colors.text.secondary, flex: 1 },
  answerCta: { minHeight: 39, alignSelf: "flex-start", marginTop: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 11, backgroundColor: "#F0F4FA" },
  answerCtaText: { ...typography.caption, color: KEPLER_NAVY },
  composerArea: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, backgroundColor: "#FAFBFD" },
  composer: {
    minHeight: 54,
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#E0E5EC",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172B4D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.075,
    shadowRadius: 9,
    elevation: 3,
  },
  composerAction: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  disabledAction: { opacity: 0.45 },
  input: { ...typography.body, flex: 1, maxHeight: 92, minHeight: 38, paddingVertical: 8, paddingHorizontal: 3, color: colors.text.primary },
  composerNote: { ...typography.metadata, color: colors.text.muted, textAlign: "center", marginTop: 5 },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22 },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,24,40,0.38)" },
  modalCard: { width: "100%", maxWidth: 440, maxHeight: "78%", padding: 20, borderRadius: 20, backgroundColor: "#FFFFFF" },
  modalTitle: { ...typography.sectionTitle, color: colors.brand.navy },
  modalSubtitle: { ...typography.caption, color: colors.text.secondary, marginTop: 4, marginBottom: 13 },
  loader: { marginVertical: 25 },
  projectList: { maxHeight: 330 },
  projectRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E7EAF0" },
  projectIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#F0F4FA", alignItems: "center", justifyContent: "center" },
  projectCopy: { flex: 1 },
  projectName: { ...typography.bodyMedium, color: colors.text.primary },
  projectLocation: { ...typography.metadata, color: colors.text.muted, marginTop: 1 },
  emptyProjects: { ...typography.body, color: colors.text.secondary, textAlign: "center", paddingVertical: 26 },
  modalFootnote: { ...typography.metadata, color: colors.text.muted, marginTop: 10, lineHeight: 15 },
  modalCancel: { minHeight: 44, marginTop: 12, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#F2F4F7" },
  modalCancelText: { ...typography.bodyMedium, color: colors.brand.navy },
});
