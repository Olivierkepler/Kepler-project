import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  AppState,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

import {
  useFocusEffect,
  type CompositeScreenProps,
} from "@react-navigation/native";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth, UserDisplayNameSyncError } from "../auth/AuthProvider";

import KeplerLogo from "../components/branding/KeplerLogo1";
import UserAvatar from "../components/user/UserAvatar";

import type {
  MainTabParamList,
  RootStackParamList,
} from "../navigation/types";

import { bootstrapDemoDeltas } from "../services/api/deltas";

import { bootstrapDemoMeasurements } from "../services/api/measurements";

import { bootstrapDemoPlanItems } from "../services/api/planItems";

import {
  bootstrapDemoProject,
  getRemoteProjects,
} from "../services/api/projects";

import { retryPendingDeltaReviews } from "../services/sync/deltaReview";

import { retryPendingDeltaUploads } from "../services/sync/deltaUpload";

import { retryPendingMeasurementUploads } from "../services/sync/measurementUpload";

import { getPendingDeltaReviewsForUser } from "../store/deltaReviewSyncState";

import { getPendingDeltaUploadsForUser } from "../store/deltaUploadSyncState";

import { getPendingMeasurementUploadsForUser } from "../store/measurementUploadSyncState";

import {colors, typography} from "../theme/colors";
import { updateSignedInUserDisplayName } from "../services/userProfile/userDisplayName";
import { getOwnUserProfile } from "../services/api/userProfiles";
import {
  pickUserAvatarImage,
  removeOwnUserAvatar,
  uploadUserAvatarFromUri,
} from "../services/userProfile/userAvatar";
import {
  MAX_USER_DISPLAY_NAME_LENGTH,
  normalizeUserDisplayName,
} from "../types/userProfile";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Profile">,
  NativeStackScreenProps<RootStackParamList>
>;

const SCREEN_BACKGROUND = require("../../assets/bgsignup.png");

/** Same deep navy as ProjectPlan floating "+" add button. */
const KEPLER_NAVY = "#012169";

type ProfileActionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  emphasisSubtitle?: boolean;
  subdued?: boolean;
};

function ProfileActionRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
  loading = false,
  danger = false,
  emphasisSubtitle = false,
  subdued = false,
}: ProfileActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionRow,
        pressed && !disabled && styles.actionRowPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View
        style={[
          styles.actionIcon,
          danger && styles.actionIconDanger,
          subdued && styles.actionIconSubdued,
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={
            danger
              ? colors.danger
              : subdued
                ? "#667085"
                : KEPLER_NAVY
          }
        />
      </View>

      <View style={styles.actionContent}>
        <Text
          style={[
            styles.actionTitle,
            danger && styles.actionTitleDanger,
            subdued && styles.actionTitleSubdued,
          ]}
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            style={[
              styles.actionSubtitle,
              emphasisSubtitle && styles.actionSubtitleEmphasis,
              subdued && styles.actionSubtitleSubdued,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            danger
              ? colors.danger
              : KEPLER_NAVY
          }
        />
      ) : (
        <Ionicons
          name="chevron-forward"
          size={17}
          color="#C5CDD8"
        />
      )}
    </Pressable>
  );
}

function BrandAccent() {
  return (
    <View
      pointerEvents="none"
      style={styles.brandAccent}
    >
      <View style={styles.brandAccentBlue} />
      <View style={styles.brandAccentRed} />
    </View>
  );
}

export default function ProfileScreen({
  navigation,
}: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [testingApi, setTestingApi] =
    useState(false);

  const [bootstrapping, setBootstrapping] =
    useState(false);

  const [
    bootstrappingPlanItems,
    setBootstrappingPlanItems,
  ] = useState(false);

  const [
    bootstrappingMeasurements,
    setBootstrappingMeasurements,
  ] = useState(false);

  const [
    bootstrappingDeltas,
    setBootstrappingDeltas,
  ] = useState(false);

  const [
    retryingPending,
    setRetryingPending,
  ] = useState(false);

  const [
    retryingMeasurementUploads,
    setRetryingMeasurementUploads,
  ] = useState(false);

  const [
    retryingDeltaUploads,
    setRetryingDeltaUploads,
  ] = useState(false);

  const [
    pendingReviewCount,
    setPendingReviewCount,
  ] = useState(0);

  const [
    pendingMeasurementCount,
    setPendingMeasurementCount,
  ] = useState(0);

  const [
    pendingDeltaUploadCount,
    setPendingDeltaUploadCount,
  ] = useState(0);

  const [signingOut, setSigningOut] =
    useState(false);

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState<string | null>(null);
  const [avatarProfileRefreshing, setAvatarProfileRefreshing] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const avatarOperationGenerationRef = useRef(0);

  const displayName =
    user?.displayName?.trim() ||
    user?.email?.trim() ||
    "Unknown user";

  const busy =
    testingApi ||
    bootstrapping ||
    bootstrappingPlanItems ||
    bootstrappingMeasurements ||
    bootstrappingDeltas ||
    retryingPending ||
    retryingMeasurementUploads ||
    retryingDeltaUploads ||
    signingOut ||
    savingName;

  const avatarBusy = avatarUploading || avatarRemoving;

  const refreshProfileAvatar = useCallback(async (): Promise<boolean> => {
    if (!user?.uid) {
      setAvatarUrl(null);
      setAvatarLoadError(null);
      return false;
    }

    try {
      const profile = await getOwnUserProfile();
      setAvatarUrl(profile.avatarUrl);
      setAvatarLoadError(null);
      return true;
    } catch {
      setAvatarLoadError("Unable to load profile photo");
      return false;
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadProfileAvatar() {
        if (!active) {
          return;
        }
        await refreshProfileAvatar();
      }

      void loadProfileAvatar();

      return () => {
        active = false;
      };
    }, [refreshProfileAvatar]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground =
        appStateRef.current === "inactive" ||
        appStateRef.current === "background";

      if (wasBackground && nextState === "active" && user?.uid) {
        void refreshProfileAvatar();
      }

      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, [refreshProfileAvatar, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadPendingCount() {
        if (!user?.uid) {
          if (active) {
            setPendingReviewCount(0);
            setPendingMeasurementCount(0);
            setPendingDeltaUploadCount(0);
          }

          return;
        }

        const [
          pendingReviews,
          pendingMeasurements,
          pendingDeltaUploads,
        ] = await Promise.all([
          getPendingDeltaReviewsForUser(
            user.uid,
          ),
          getPendingMeasurementUploadsForUser(
            user.uid,
          ),
          getPendingDeltaUploadsForUser(
            user.uid,
          ),
        ]);

        if (active) {
          setPendingReviewCount(
            pendingReviews.length,
          );

          setPendingMeasurementCount(
            pendingMeasurements.length,
          );

          setPendingDeltaUploadCount(
            pendingDeltaUploads.length,
          );
        }
      }

      void loadPendingCount();

      return () => {
        active = false;
      };
    }, [user?.uid]),
  );

  const handleTestApi = async () => {
    setTestingApi(true);

    try {
      const remoteProjects =
        await getRemoteProjects();

      Alert.alert(
        "API connection successful",
        `${remoteProjects.length} remote project${
          remoteProjects.length === 1
            ? ""
            : "s"
        } found.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to reach the authenticated API.";

      Alert.alert(
        "API connection failed",
        message,
      );
    } finally {
      setTestingApi(false);
    }
  };

  const handleBootstrapDemoProject =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setBootstrapping(true);

      try {
        const result =
          await bootstrapDemoProject(user.uid);

        if (result === "exists") {
          Alert.alert(
            "Project already connected to cloud.",
            "Boston Office Renovation is already linked for this account.",
          );

          return;
        }

        Alert.alert(
          "Demo project bootstrapped",
          "Boston Office Renovation was connected to the cloud for this account.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the authenticated API.";

        Alert.alert(
          "Bootstrap failed",
          message,
        );
      } finally {
        setBootstrapping(false);
      }
    };

  const handleBootstrapPlanItems =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setBootstrappingPlanItems(true);

      try {
        const result =
          await bootstrapDemoPlanItems(
            user.uid,
          );

        if (result === "exists") {
          Alert.alert(
            "Plan items already connected to cloud.",
            "Boston plan items are already linked for this account.",
          );

          return;
        }

        Alert.alert(
          "Plan items connected to cloud.",
          "Boston plan items were linked for this account.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the authenticated API.";

        Alert.alert(
          "Plan item bootstrap failed",
          message,
        );
      } finally {
        setBootstrappingPlanItems(false);
      }
    };

  const handleBootstrapMeasurements =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setBootstrappingMeasurements(true);

      try {
        const result =
          await bootstrapDemoMeasurements(
            user.uid,
          );

        const pendingMeasurements =
          await getPendingMeasurementUploadsForUser(
            user.uid,
          );

        setPendingMeasurementCount(
          pendingMeasurements.length,
        );

        if (result === "exists") {
          Alert.alert(
            "Measurements already connected to cloud.",
            "Boston measurements are already linked for this account.",
          );

          return;
        }

        Alert.alert(
          "Measurements connected to cloud.",
          "Boston measurements were linked for this account.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the authenticated API.";

        Alert.alert(
          "Measurement bootstrap failed",
          message,
        );
      } finally {
        setBootstrappingMeasurements(false);
      }
    };

  const handleBootstrapDeltas =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setBootstrappingDeltas(true);

      try {
        const result =
          await bootstrapDemoDeltas(user.uid);

        const pendingDeltaUploads =
          await getPendingDeltaUploadsForUser(
            user.uid,
          );

        setPendingDeltaUploadCount(
          pendingDeltaUploads.length,
        );

        if (result === "exists") {
          Alert.alert(
            "Deltas already connected to cloud.",
            "Boston deltas are already linked for this account.",
          );

          return;
        }

        Alert.alert(
          "Deltas connected to cloud.",
          "Boston deltas were linked for this account.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the authenticated API.";

        Alert.alert(
          "Delta bootstrap failed",
          message,
        );
      } finally {
        setBootstrappingDeltas(false);
      }
    };

  const handleRetryPendingDeltaReviews =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setRetryingPending(true);

      try {
        const result =
          await retryPendingDeltaReviews(
            user.uid,
          );

        setPendingReviewCount(
          result.remaining,
        );

        Alert.alert(
          "Retry complete",
          `${result.synced} synced, ${result.remaining} still pending.`,
        );
      } catch {
        Alert.alert(
          "Retry failed",
          "Unable to retry pending delta reviews.",
        );
      } finally {
        setRetryingPending(false);
      }
    };

  const handleRetryPendingMeasurements =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setRetryingMeasurementUploads(true);

      try {
        const result =
          await retryPendingMeasurementUploads(
            user.uid,
          );

        setPendingMeasurementCount(
          result.remaining,
        );

        Alert.alert(
          "Retry complete",
          `${result.synced} synced, ${result.remaining} still pending.`,
        );
      } catch {
        Alert.alert(
          "Retry failed",
          "Unable to retry pending measurement uploads.",
        );
      } finally {
        setRetryingMeasurementUploads(false);
      }
    };

  const handleRetryPendingDeltas =
    async () => {
      if (!user) {
        Alert.alert(
          "Not signed in",
          "Your session could not be authenticated.",
        );

        return;
      }

      setRetryingDeltaUploads(true);

      try {
        const result =
          await retryPendingDeltaUploads(
            user.uid,
          );

        setPendingDeltaUploadCount(
          result.remaining,
        );

        Alert.alert(
          "Retry complete",
          `${result.synced} synced, ${result.remaining} still pending.`,
        );
      } catch {
        Alert.alert(
          "Retry failed",
          "Unable to retry pending delta uploads.",
        );
      } finally {
        setRetryingDeltaUploads(false);
      }
    };

  const handleSignOut = async () => {
    setSigningOut(true);

    try {
      await signOut();
    } catch {
      Alert.alert(
        "Sign out failed",
        "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  const openEditName = () => {
    setEditNameValue(user?.displayName?.trim() ?? "");
    setEditNameOpen(true);
  };

  const openAvatarMenu = () => {
    if (avatarBusy) {
      return;
    }
    setAvatarMenuOpen(true);
  };

  const handleRetryProfileAvatar = async () => {
    if (avatarProfileRefreshing) {
      return;
    }

    setAvatarProfileRefreshing(true);
    try {
      await refreshProfileAvatar();
    } finally {
      setAvatarProfileRefreshing(false);
    }
  };

  const handleChooseAvatar = async () => {
    setAvatarMenuOpen(false);
    if (avatarBusy) {
      return;
    }

    let picked: Awaited<ReturnType<typeof pickUserAvatarImage>>;
    try {
      picked = await pickUserAvatarImage();
    } catch (err) {
      Alert.alert(
        "Unable to update photo",
        err instanceof Error
          ? err.message
          : "Your profile photo could not be updated.",
      );
      return;
    }

    if (!picked) {
      return;
    }

    const operationGeneration = avatarOperationGenerationRef.current + 1;
    avatarOperationGenerationRef.current = operationGeneration;
    setAvatarUploading(true);

    try {
      const profile = await uploadUserAvatarFromUri(picked);
      if (operationGeneration !== avatarOperationGenerationRef.current) {
        return;
      }
      setAvatarUrl(profile.avatarUrl);
      setAvatarLoadError(null);
    } catch (err) {
      if (operationGeneration !== avatarOperationGenerationRef.current) {
        return;
      }
      Alert.alert(
        "Unable to update photo",
        err instanceof Error
          ? err.message
          : "Your profile photo could not be updated.",
      );
    } finally {
      if (operationGeneration === avatarOperationGenerationRef.current) {
        setAvatarUploading(false);
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarMenuOpen(false);
    if (avatarBusy || !avatarUrl) {
      return;
    }

    const operationGeneration = avatarOperationGenerationRef.current + 1;
    avatarOperationGenerationRef.current = operationGeneration;
    setAvatarRemoving(true);

    try {
      const profile = await removeOwnUserAvatar();
      if (operationGeneration !== avatarOperationGenerationRef.current) {
        return;
      }
      setAvatarUrl(profile.avatarUrl);
      setAvatarLoadError(null);
    } catch (err) {
      if (operationGeneration !== avatarOperationGenerationRef.current) {
        return;
      }
      Alert.alert(
        "Unable to remove photo",
        err instanceof Error
          ? err.message
          : "Your profile photo could not be removed.",
      );
    } finally {
      if (operationGeneration === avatarOperationGenerationRef.current) {
        setAvatarRemoving(false);
      }
    }
  };

  const handleSaveName = async () => {
    const normalized = normalizeUserDisplayName(editNameValue);

    if (!normalized) {
      Alert.alert("Name required", "Enter a valid full name.");
      return;
    }

    setSavingName(true);

    try {
      await updateSignedInUserDisplayName(normalized);
      setEditNameOpen(false);
    } catch (error) {
      const message =
        error instanceof UserDisplayNameSyncError
          ? error.message
          : "Unable to update your name.";

      Alert.alert("Unable to update name", message);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ImageBackground
        source={SCREEN_BACKGROUND}
        style={styles.background}
        resizeMode="cover"
      >


        <View style={styles.stickyHeader}>
          <View style={styles.headerLogoWrap}>
            <KeplerLogo
              width={100}
              height={40}
            />
          </View>

          <View style={styles.accountContent}>
            <Text style={styles.cardEyebrow}>
              SIGNED IN AS
            </Text>

            <Text
              style={styles.email}
              numberOfLines={1}
            >
              {user?.email ?? "Unknown user"}
            </Text>

            <View style={styles.accountFooterRow}>
              <View style={styles.accountStatus}>
                <View style={styles.statusDot} />

                <Text style={styles.statusText}>
                  Authenticated workspace
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.signOutButton,
                  pressed &&
                    styles.signOutButtonPressed,
                  busy && styles.buttonDisabled,
                ]}
                onPress={() => {
                  void handleSignOut();
                }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                hitSlop={8}
              >
                {signingOut ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.danger}
                  />
                ) : (
                  <>
                    <Ionicons
                      name="log-out-outline"
                      size={14}
                      color={colors.danger}
                    />

                    <Text style={styles.signOutText}>
                      Sign Out 
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={
            styles.scrollContainer
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>
            PROFILE
          </Text>

          <View style={styles.profileIdentityCard}>
            <Pressable
              onPress={openAvatarMenu}
              disabled={avatarBusy}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              style={({ pressed }) => [
                styles.avatarButton,
                pressed && !avatarBusy && styles.avatarButtonPressed,
              ]}
            >
              <UserAvatar
                imageUrl={avatarUrl}
                size={88}
                loading={avatarBusy}
              />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera-outline" size={16} color={KEPLER_NAVY} />
              </View>
            </Pressable>

            <Text style={styles.profileIdentityName} numberOfLines={2}>
              {displayName}
            </Text>
            <Text style={styles.profileIdentityEmail} numberOfLines={1}>
              {user?.email ?? "Unknown email"}
            </Text>

            {avatarLoadError ? (
              <View style={styles.avatarLoadErrorRow}>
                <Text style={styles.avatarLoadErrorText}>{avatarLoadError}</Text>
                <Pressable
                  onPress={() => {
                    void handleRetryProfileAvatar();
                  }}
                  disabled={avatarProfileRefreshing}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading profile photo"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.avatarRetryButton,
                    pressed && !avatarProfileRefreshing && styles.avatarRetryButtonPressed,
                    avatarProfileRefreshing && styles.buttonDisabled,
                  ]}
                >
                  {avatarProfileRefreshing ? (
                    <ActivityIndicator size="small" color={KEPLER_NAVY} />
                  ) : (
                    <Text style={styles.avatarRetryText}>Retry</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.groupCard}>
            <BrandAccent />
            <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Name</Text>
              <Text style={styles.identityValue} numberOfLines={2}>
                {displayName}
              </Text>
            </View>

            <View style={styles.identitySeparator} />

            <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Email</Text>
              <Text style={styles.identityValue} numberOfLines={1}>
                {user?.email ?? "Unknown email"}
              </Text>
            </View>

            <View style={styles.identitySeparator} />

            <Pressable
              onPress={openEditName}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              style={({ pressed }) => [
                styles.identityActionRow,
                pressed && !busy && styles.actionRowPressed,
                busy && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.identityActionText}>Edit name</Text>
              <Ionicons name="chevron-forward" size={17} color="#C5CDD8" />
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>
            CLOUD
          </Text>

          <Text style={styles.sectionDescription}>
            Manage Kepler Cloud connectivity.
          </Text>

          <View style={styles.groupCard}>
            <BrandAccent />
            <ProfileActionRow
              icon="cloud-outline"
              title="Cloud Projects"
              subtitle="View projects connected to Kepler Cloud"
              onPress={() => {
                navigation
                  .getParent()
                  ?.navigate("CloudProjects");
              }}
              disabled={busy}
            />

            <View style={styles.rowSeparator} />

            <ProfileActionRow
              icon="pulse-outline"
              title="Test API Connection"
              subtitle="Verify authenticated backend connectivity"
              onPress={() => {
                void handleTestApi();
              }}
              disabled={busy}
              loading={testingApi}
            />
          </View>

          <Text style={[styles.sectionTitle, styles.sectionTitleDev]}>
            DEVELOPMENT DATA
          </Text>

          <Text style={[styles.sectionDescription, styles.sectionDescriptionDev]}>
            Utilities for preparing the Kepler demo environment.
          </Text>

          <View style={[styles.groupCard, styles.groupCardDev]}>
            <BrandAccent />
            <ProfileActionRow
              icon="business-outline"
              title="Bootstrap Demo Project"
              subtitle="Connect the Boston demo project"
              onPress={() => {
                void handleBootstrapDemoProject();
              }}
              disabled={busy}
              loading={bootstrapping}
              subdued
            />

            <View style={styles.rowSeparator} />

            <ProfileActionRow
              icon="list-outline"
              title="Bootstrap Plan Items"
              subtitle="Connect demo plan quantities and targets"
              onPress={() => {
                void handleBootstrapPlanItems();
              }}
              disabled={busy}
              loading={bootstrappingPlanItems}
              subdued
            />

            <View style={styles.rowSeparator} />

            <ProfileActionRow
              icon="resize-outline"
              title="Bootstrap Measurements"
              subtitle="Connect recorded field measurements"
              onPress={() => {
                void handleBootstrapMeasurements();
              }}
              disabled={busy}
              loading={bootstrappingMeasurements}
              subdued
            />

            <View style={styles.rowSeparator} />

            <ProfileActionRow
              icon="git-compare-outline"
              title="Bootstrap Deltas"
              subtitle="Connect existing plan-vs-reality records"
              onPress={() => {
                void handleBootstrapDeltas();
              }}
              disabled={busy}
              loading={bootstrappingDeltas}
              subdued
            />
          </View>

          <Text style={styles.sectionTitle}>
            SYNC & RECOVERY
          </Text>

          <Text style={styles.sectionDescription}>
            Retry field records that have not yet synchronized successfully.
          </Text>

          <View style={styles.groupCard}>
            <BrandAccent />
            <ProfileActionRow
              icon="refresh-outline"
              title="Pending Delta Reviews"
              subtitle={
                pendingReviewCount > 0
                  ? `${pendingReviewCount} review${
                      pendingReviewCount === 1
                        ? ""
                        : "s"
                    } waiting to sync`
                  : "No pending reviews"
              }
              emphasisSubtitle={pendingReviewCount > 0}
              onPress={() => {
                void handleRetryPendingDeltaReviews();
              }}
              disabled={busy}
              loading={retryingPending}
            />

            <View style={styles.rowSeparator} />

            <ProfileActionRow
              icon="refresh-outline"
              title="Pending Measurements"
              subtitle={
                pendingMeasurementCount > 0
                  ? `${pendingMeasurementCount} measurement${
                      pendingMeasurementCount === 1
                        ? ""
                        : "s"
                    } waiting to sync`
                  : "No pending measurements"
              }
              emphasisSubtitle={pendingMeasurementCount > 0}
              onPress={() => {
                void handleRetryPendingMeasurements();
              }}
              disabled={busy}
              loading={retryingMeasurementUploads}
            />

            <View style={styles.rowSeparator} />

            <ProfileActionRow
              icon="refresh-outline"
              title="Pending Delta Uploads"
              subtitle={
                pendingDeltaUploadCount > 0
                  ? `${pendingDeltaUploadCount} Delta upload${
                      pendingDeltaUploadCount === 1
                        ? ""
                        : "s"
                    } waiting to sync`
                  : "No pending Delta uploads"
              }
              emphasisSubtitle={pendingDeltaUploadCount > 0}
              onPress={() => {
                void handleRetryPendingDeltas();
              }}
              disabled={busy}
              loading={retryingDeltaUploads}
            />
          </View>

          <View style={styles.bottomSpace} />
        </ScrollView>

        <Modal
          visible={editNameOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (!savingName) {
              setEditNameOpen(false);
            }
          }}
        >
          <ImageBackground
            source={SCREEN_BACKGROUND}
            style={styles.background}
            resizeMode="cover"
          >
            <View
              style={[
                styles.editModal,
                {
                  paddingTop: Math.max(insets.top, 10),
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <View style={styles.editHeader}>
                <Pressable
                  onPress={() => setEditNameOpen(false)}
                  disabled={savingName}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel edit name"
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.editHeaderAction,
                    pressed && !savingName && styles.editHeaderActionPressed,
                  ]}
                >
                  <Text style={styles.editCancelHeaderText}>Cancel</Text>
                </Pressable>

                <Text style={styles.editHeaderTitle}>Edit name</Text>

                <Pressable
                  onPress={() => {
                    void handleSaveName();
                  }}
                  disabled={savingName}
                  accessibilityRole="button"
                  accessibilityLabel="Save name"
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.editHeaderAction,
                    styles.editHeaderActionRight,
                    savingName && styles.buttonDisabled,
                    pressed && !savingName && styles.editHeaderActionPressed,
                  ]}
                >
                  {savingName ? (
                    <ActivityIndicator
                      size="small"
                      color={KEPLER_NAVY}
                    />
                  ) : (
                    <Text style={styles.editSaveHeaderText}>Save</Text>
                  )}
                </Pressable>
              </View>

              <ScrollView
                style={styles.editScroll}
                contentContainerStyle={styles.editScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.editSubtitle}>
                  This name appears to teammates on assignments and plan work packages.
                </Text>

                <Text style={styles.editLabel}>FULL NAME</Text>
                <TextInput
                  style={styles.editInput}
                  value={editNameValue}
                  onChangeText={setEditNameValue}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="name"
                  maxLength={MAX_USER_DISPLAY_NAME_LENGTH}
                  editable={!savingName}
                  accessibilityLabel="Full name"
                />
              </ScrollView>
            </View>
          </ImageBackground>
        </Modal>

        <Modal
          visible={avatarMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAvatarMenuOpen(false)}
        >
          <Pressable
            style={styles.avatarMenuBackdrop}
            onPress={() => setAvatarMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close profile photo options"
          >
            <Pressable
              style={styles.avatarMenuSheet}
              onPress={(event) => event.stopPropagation()}
            >
              <Pressable
                onPress={() => {
                  void handleChooseAvatar();
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose photo"
                style={({ pressed }) => [
                  styles.avatarMenuRow,
                  pressed && styles.avatarMenuRowPressed,
                ]}
              >
                <Text style={styles.avatarMenuRowText}>Choose photo</Text>
              </Pressable>

              {avatarUrl ? (
                <>
                  <View style={styles.avatarMenuSeparator} />
                  <Pressable
                    onPress={() => {
                      void handleRemoveAvatar();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove current photo"
                    style={({ pressed }) => [
                      styles.avatarMenuRow,
                      pressed && styles.avatarMenuRowPressed,
                    ]}
                  >
                    <Text style={styles.avatarMenuRowDangerText}>
                      Remove current photo
                    </Text>
                  </Pressable>
                </>
              ) : null}

              <View style={styles.avatarMenuSeparator} />

              <Pressable
                onPress={() => setAvatarMenuOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={({ pressed }) => [
                  styles.avatarMenuRow,
                  pressed && styles.avatarMenuRowPressed,
                ]}
              >
                <Text style={styles.avatarMenuCancelText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  background: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
    backgroundColor: "transparent",
  },

  scrollContainer: {
    paddingBottom: 140,
  },

  stickyHeader: {
    paddingHorizontal: 20,
  
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.74)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.08)",
    zIndex: 100,
  },

  headerLogoWrap: {
    alignItems: "flex-start",
    marginBottom: 4,
  },

  accountContent: {
    width: "100%",
  },

  cardEyebrow: {
    ...typography.metadata,
    color: KEPLER_NAVY,
    fontSize: 10.5,
    letterSpacing: 1.05,
    fontWeight: "700",
    opacity: 0.88,
  },

  email: {
    ...typography.bodyMedium,
    marginTop: 3,
    color: "#101828",
    fontSize: 15,
    fontWeight: "600",
  },

  accountFooterRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  accountStatus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },

  statusText: {
    ...typography.caption,
    color: "#667085",
    fontSize: 11,
  },

  signOutButton: {
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 11,
   
  },

  signOutButtonPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.97 }],
  },

  signOutText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
    fontSize: 12,
  },

  sectionTitle: {
    ...typography.metadata,
    marginHorizontal: 20,
    marginTop: 23,
    marginBottom: 0,
    color: KEPLER_NAVY,
    fontSize: 10.5,
    letterSpacing: 1.05,
    fontWeight: "700",
    opacity: 0.9,
  },

  sectionTitleFirst: {
    marginTop: 18,
  },

  sectionTitleDev: {
    opacity: 0.72,
    fontSize: 10.5,
    letterSpacing: 0.95,
  },

  sectionDescription: {
    ...typography.caption,
    marginHorizontal: 20,
    marginTop: 4,
    color: "#98A2B3",
    fontSize: 12,
    lineHeight: 16,
  },

  sectionDescriptionDev: {
    color: "#B0B8C4",
    fontSize: 12,
    lineHeight: 16,
  },

  groupCard: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.73)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },

  groupCardDev: {
    backgroundColor: "rgba(255,255,255,0.60)",
    borderColor: "rgba(15,23,42,0.06)",
  },

  brandAccent: {
    height: 3,
    flexDirection: "row",
    width: "100%",
  },

  brandAccentBlue: {
    flex: 0.78,
    backgroundColor: KEPLER_NAVY,
  },

  brandAccentRed: {
    flex: 0.22,
    backgroundColor: colors.danger,
  },

  actionRow: {
    minHeight: 65,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  actionRowPressed: {
    backgroundColor: "rgba(15,23,42,0.04)",
  },

  actionIcon: {
    width: 39,
    height: 39,
    marginRight: 12,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,33,105,0.07)",
  },

  actionIconDanger: {
    backgroundColor: "rgba(240,68,56,0.10)",
  },

  actionIconSubdued: {
    backgroundColor: "rgba(15,23,42,0.05)",
  },

  actionContent: {
    flex: 1,
    paddingRight: 8,
  },

  actionTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontWeight: "600",
  },

  actionTitleDanger: {
    color: colors.danger,
  },

  actionTitleSubdued: {
    color: "#344054",
    fontWeight: "500",
  },

  actionSubtitle: {
    ...typography.caption,
    marginTop: 2,
    color: "#98A2B3",
    fontSize: 12,
    lineHeight: 16,
  },

  actionSubtitleEmphasis: {
    color: "#667085",
    fontWeight: "600",
  },

  actionSubtitleSubdued: {
    color: "#B0B8C4",
  },

  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 65,
    backgroundColor: "rgba(15,23,42,0.07)",
  },

  identitySeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
    backgroundColor: "rgba(15,23,42,0.07)",
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  bottomSpace: {
    height: 20,
  },

  identityRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },

  profileIdentityCard: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.73)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },

  avatarButton: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarButtonPressed: {
    opacity: 0.92,
  },

  avatarEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1, 33, 105, 0.12)",
  },

  profileIdentityName: {
    ...typography.bodyMedium,
    marginTop: 14,
    color: "#101828",
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },

  profileIdentityEmail: {
    ...typography.caption,
    marginTop: 4,
    color: "#667085",
    fontSize: 13,
    textAlign: "center",
  },

  avatarLoadErrorRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },

  avatarLoadErrorText: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12,
    textAlign: "center",
  },

  avatarRetryButton: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(1, 33, 105, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarRetryButtonPressed: {
    opacity: 0.82,
  },

  avatarRetryText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 12,
    fontWeight: "600",
  },

  avatarMenuBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    paddingHorizontal: 12,
    paddingBottom: 24,
  },

  avatarMenuSheet: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },

  avatarMenuRow: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  avatarMenuRowPressed: {
    backgroundColor: "rgba(15,23,42,0.04)",
  },

  avatarMenuRowText: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontWeight: "600",
  },

  avatarMenuRowDangerText: {
    ...typography.bodyMedium,
    color: colors.danger,
    fontWeight: "600",
  },

  avatarMenuCancelText: {
    ...typography.bodyMedium,
    color: "#667085",
    fontWeight: "600",
  },

  avatarMenuSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(15,23,42,0.08)",
  },

  identityLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12,
    fontWeight: "500",
  },

  identityValue: {
    ...typography.bodyMedium,
    marginTop: 3,
    color: "#101828",
    fontWeight: "600",
  },

  identityActionRow: {
    minHeight: 47,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },

  identityActionText: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontWeight: "600",
  },

  editModal: {
    flex: 1,
    backgroundColor: "transparent",
  },

  editHeader: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.73)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.08)",
  },

  editHeaderAction: {
    minWidth: 64,
    minHeight: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  editHeaderActionRight: {
    alignItems: "flex-end",
  },

  editHeaderActionPressed: {
    opacity: 0.6,
  },

  editHeaderTitle: {
    ...typography.bodyLarge,
    color: "#101828",
    fontWeight: "600",
    fontSize: 17,
  },

  editCancelHeaderText: {
    ...typography.bodyMedium,
    color: "#667085",
    fontSize: 16,
  },

  editSaveHeaderText: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontWeight: "600",
    fontSize: 16,
  },

  editScroll: {
    flex: 1,
    backgroundColor: "transparent",
  },

  editScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },

  editSubtitle: {
    ...typography.caption,
    color: "#667085",
    lineHeight: 18,
    marginBottom: 22,
  },

  editLabel: {
    ...typography.metadata,
    color: KEPLER_NAVY,
    fontSize: 11,
    letterSpacing: 1.0,
    fontWeight: "700",
    marginBottom: 8,
    opacity: 0.88,
  },

  editInput: {
    ...typography.bodyLarge,
    minHeight: 50,
    backgroundColor: "rgba(255,255,255,0.80)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.10)",
    borderRadius: 15,
    color: "#101828",
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
});