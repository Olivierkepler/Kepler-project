import React, { useCallback, useMemo, useState } from "react";
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
import { getMyDiscoveredProjects } from "../services/api/projects";
import { getProjects } from "../store/projects";
import type { DiscoveredProject } from "../types/discoveredProject";
import type { Project } from "../types/project";
import { colors, typography } from "../theme/colors";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Capture">,
  NativeStackScreenProps<RootStackParamList>
>;

type StarterAction = {
  id: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  destination?: ProjectWorkspaceTab;
};

type ProjectChoice =
  | { id: string; name: string; location: string; source: "local" }
  | {
      id: string;
      name: string;
      location: string;
      source: "shared";
      membershipRole: DiscoveredProject["membership"]["role"];
    };

const STARTER_ACTIONS: readonly StarterAction[] = [
  { id: "attention", title: "What needs my attention?", icon: "checkbox-outline", destination: "todo" },
  { id: "progress", title: "Review project progress", icon: "bar-chart-outline", destination: "workProgress" },
  { id: "variance", title: "Explain the largest variance", icon: "git-compare-outline" },
  { id: "activity", title: "Summarize recent activity", icon: "time-outline", destination: "project" },
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
  const [selectedAction, setSelectedAction] = useState<StarterAction | null>(null);
  const [projects, setProjects] = useState<ProjectChoice[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(false);

  const greeting = useMemo(() => getGreeting(user?.displayName), [user?.displayName]);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const openProjectSelection = useCallback((action: StarterAction) => {
    if (!action.destination) return;
    setSelectedAction(action);
    setProjects([]);
    setProjectLoadError(false);
    setSelectionVisible(true);
    setLoadingProjects(true);

    if (!user?.uid) {
      setLoadingProjects(false);
      setProjectLoadError(true);
      return;
    }

    void Promise.allSettled([
      getProjects(user.uid),
      getMyDiscoveredProjects(),
    ]).then(([localResult, discoveredResult]) => {
      const localProjects = localResult.status === "fulfilled" ? localResult.value : [];
      const discovered = discoveredResult.status === "fulfilled" ? discoveredResult.value : [];
      const localProjectIds = new Set(localProjects.map((project) => project.id));
      const choices: ProjectChoice[] = [
        ...localProjects.map((project) => ({
          id: project.id,
          name: project.name,
          location: project.location,
          source: "local" as const,
        })),
        ...discovered
          .filter((project) => !localProjectIds.has(project.localProjectId))
          .map((project) => ({
            id: project.id,
            name: project.name,
            location: project.location,
            source: "shared" as const,
            membershipRole: project.membership.role,
          })),
      ];
      setProjects(choices);
      setProjectLoadError(
        choices.length === 0 && (localResult.status === "rejected" || discoveredResult.status === "rejected"),
      );
    }).finally(() => setLoadingProjects(false));
  }, [user?.uid]);

  const selectProject = (project: ProjectChoice) => {
    const destination = selectedAction?.destination;
    setSelectionVisible(false);
    if (!destination) return;

    if (project.source === "shared") {
      navigation.navigate("Project", {
        projectId: project.id,
        source: "shared",
        membershipRole: project.membershipRole,
        initialTab: destination,
      });
      return;
    }

    navigation.navigate("Project", {
      projectId: project.id,
      initialTab: destination,
    });
  };

  const openCaptureWorkspace = () => navigation.navigate("CaptureWorkspace");

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
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <OrbGlow size={104} animated decorative accessibilityLabel="" />
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.supportingCopy}>How can I help with your projects?</Text>
          </View>

          <View style={styles.promptSection}>
            <Text style={styles.sectionTitle}>Explore your project</Text>
            {STARTER_ACTIONS.map((action) => {
              const unavailable = !action.destination;
              return (
                <Pressable
                  key={action.id}
                  style={({ pressed }) => [
                    styles.promptCard,
                    pressed && !unavailable && styles.promptCardPressed,
                    unavailable && styles.promptCardUnavailable,
                  ]}
                  disabled={unavailable}
                  onPress={() => openProjectSelection(action)}
                  accessibilityRole="button"
                  accessibilityLabel={unavailable ? `${action.title}, unavailable yet` : action.title}
                  accessibilityState={{ disabled: unavailable }}
                >
                  <Ionicons
                    name={action.icon}
                    size={19}
                    color={unavailable ? colors.text.muted : KEPLER_NAVY}
                  />
                  <Text style={[styles.promptText, unavailable && styles.unavailableText]}>
                    {action.title}
                  </Text>
                  {unavailable ? (
                    <Text style={styles.unavailableLabel}>Coming later</Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={17} color="#98A2B3" />
                  )}
                </Pressable>
              );
            })}
          </View>
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
            <Text style={styles.modalSubtitle}>
              {selectedAction?.title ?? "Open a project"}
            </Text>
            {loadingProjects ? (
              <ActivityIndicator color={KEPLER_NAVY} style={styles.loader} />
            ) : projects.length ? (
              <ScrollView style={styles.projectList}>
                {projects.map((project) => (
                  <Pressable
                    key={`${project.source}:${project.id}`}
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
              Kepler AI chat is not active yet. Choose a project to open its existing workspace.
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
  unavailableLabel: { ...typography.metadata, color: colors.text.muted },
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
