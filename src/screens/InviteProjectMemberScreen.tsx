import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { ensureRemoteProject } from "../services/sync/projectBootstrap";
import {
  createProjectInvitation,
  type InvitableRemoteRole,
} from "../services/api/invitations";
import {
  resolveProjectCollaborationContext,
  type ProjectCollaborationContext,
} from "../services/collaboration/projectCollaborationContext";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import { getProjectById } from "../store/projects";
import { colors, typography } from "../theme/colors";
import type { Project } from "../types/project";
import { formatProjectMemberRoleLabel } from "../utils/domain/memberRoleLabels";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "InviteProjectMember"
>;

const INVITABLE_ROLES: readonly {
  role: InvitableRemoteRole;
  label: string;
  description: string;
}[] = [
  {
    role: "project_admin",
    label: formatProjectMemberRoleLabel("project_admin"),
    description: "Manage team and project collaboration.",
  },
  {
    role: "contractor",
    label: formatProjectMemberRoleLabel("contractor"),
    description: "Collaborate as an external contractor.",
  },
  {
    role: "field_member",
    label: formatProjectMemberRoleLabel("field_member"),
    description: "Capture and review field work.",
  },
  {
    role: "viewer",
    label: formatProjectMemberRoleLabel("viewer"),
    description: "Read-only project visibility.",
  },
];

export default function InviteProjectMemberScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const projectId = route.params.projectId;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [collaboration, setCollaboration] = useState<
    ProjectCollaborationContext | null
  >(null);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRemoteRole>("field_member");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setCollaboration(null);
        setRemoteProjectId(null);
        return;
      }

      const currentUserId = user.uid;
      let active = true;

      async function load() {
        const context = await resolveProjectCollaborationContext({
          currentUserId,
          projectId,
        });

        if (!active) {
          return;
        }

        if (!context) {
          setCollaboration(null);
          setProject(null);
          setRemoteProjectId(null);
          return;
        }

        const [found, mappedRemoteId] = await Promise.all([
          getProjectById(context.storageOwnerUid, projectId),
          getRemoteProjectId(context.storageOwnerUid, projectId),
        ]);

        if (!active) {
          return;
        }

        setCollaboration(context);
        setProject(found ?? null);
        setRemoteProjectId(mappedRemoteId ?? null);
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, user?.uid]),
  );

  const handleInvite = async () => {
    if (!collaboration || saving) {
      return;
    }

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }

    if (!remoteProjectId) {
      setError(
        "Cloud sync is required to invite collaborators. Connect this project to the cloud first.",
      );
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await createProjectInvitation(remoteProjectId, {
        email: trimmedEmail,
        role,
      });
      navigation.goBack();
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Unable to create invitation. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConnectProject = async () => {
    if (!collaboration || connecting || remoteProjectId) {
      return;
    }

    setConnectError(null);
    setConnecting(true);

    try {
      const connectedRemoteProjectId = await ensureRemoteProject(
        collaboration.storageOwnerUid,
        projectId,
      );

      if (connectedRemoteProjectId) {
        setRemoteProjectId(connectedRemoteProjectId);
      } else {
        setConnectError(
          "Unable to connect this project to the cloud. Check your connection and try again.",
        );
      }
    } catch {
      setConnectError(
        "Unable to connect this project to the cloud. Check your connection and try again.",
      );
    } finally {
      setConnecting(false);
    }
  };

  if (project === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!project) {
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
          <Text style={styles.title}>Project not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cloudReady = !!remoteProjectId;

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
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>Invite</Text>
          <View style={styles.topBarPlaceholder} />
        </View>

        <Text style={styles.eyebrow}>PROJECT TEAM</Text>
        <Text style={styles.title}>Invite member</Text>
        <Text style={styles.subtitle}>
          {cloudReady
            ? `Invite a collaborator to ${project.name}. They will see this invitation when signed in with the same email. Email delivery is not sent automatically.`
            : `Cloud sync is required to invite collaborators to ${project.name}.`}
        </Text>

        {!cloudReady ? (
          <>
            <Text style={styles.limitationText}>
              Connect this project to the cloud before sending invitations.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.connectAction,
                pressed && styles.connectActionPressed,
              ]}
              onPress={() => {
                void handleConnectProject();
              }}
              disabled={connecting || !collaboration}
              accessibilityRole="button"
              accessibilityLabel="Connect project to cloud"
              accessibilityState={{
                disabled: connecting || !collaboration,
                busy: connecting,
              }}
            >
              {connecting ? (
                <ActivityIndicator size="small" color={colors.brand.navy} />
              ) : (
                <Text style={styles.connectActionIcon}>☁</Text>
              )}
              <Text style={styles.connectActionText}>
                {connecting ? "Connecting…" : "Connect project to cloud"}
              </Text>
            </Pressable>
            {connectError ? (
              <Text style={styles.connectErrorText}>{connectError}</Text>
            ) : null}
          </>
        ) : null}

        <Text style={styles.label}>EMAIL ADDRESS</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.com"
          placeholderTextColor={colors.text.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
          accessibilityLabel="Invitation email"
        />

        <Text style={styles.label}>ROLE</Text>
        {INVITABLE_ROLES.map((option) => {
          const selected = role === option.role;

          return (
            <Pressable
              key={option.role}
              style={[
                styles.roleCard,
                selected && styles.roleCardSelected,
              ]}
              onPress={() => setRole(option.role)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Select role ${option.label}`}
            >
              <Text
                style={[
                  styles.roleLabel,
                  selected && styles.roleLabelSelected,
                ]}
              >
                {option.label}
              </Text>
              <Text style={styles.roleDescription}>
                {option.description}
              </Text>
            </Pressable>
          );
        })}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[
            styles.saveButton,
            (saving || !cloudReady) && styles.saveButtonDisabled,
          ]}
          onPress={() => {
            void handleInvite();
          }}
          disabled={saving || !cloudReady}
          accessibilityRole="button"
          accessibilityLabel="Create invitation"
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              Create invitation
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  topBarPlaceholder: {
    width: 42,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.text.muted,
  },
  title: {
    ...typography.display,
    color: colors.text.primary,
    marginTop: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 8,
    marginBottom: 22,
  },
  limitationText: {
    ...typography.caption,
    color: colors.delta,
    marginBottom: 2,
  },
  connectAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    marginBottom: 14,
  },
  connectActionPressed: {
    opacity: 0.7,
  },
  connectActionIcon: {
    color: colors.brand.navy,
    fontSize: 17,
    lineHeight: 19,
  },
  connectActionText: {
    ...typography.bodyMedium,
    color: colors.brand.navy,
  },
  connectErrorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: -8,
    marginBottom: 14,
  },
  label: {
    ...typography.caption,
    color: colors.text.muted,
    marginBottom: 8,
  },
  input: {
    ...typography.bodyLarge,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text.primary,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  roleCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  roleCardSelected: {
    borderColor: colors.brand.blue,
    backgroundColor: "#F5FAFE",
  },
  roleLabel: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  roleLabelSelected: {
    color: colors.brand.blue,
  },
  roleDescription: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 4,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 8,
    marginBottom: 4,
  },
  saveButton: {
    marginTop: 18,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
});
