import type { NavigationProp } from "@react-navigation/native";
import { Alert } from "react-native";

import type { RootStackParamList } from "../../navigation/types";
import type { RemoteNotification } from "../../types/notification";
import type { ProjectMemberRole } from "../../types/projectMember";
import { getMyDiscoveredProjects } from "../../services/api/projects";
import { getLocalDeltaIdForRemote } from "../../store/deltaCloudMappings";
import { getLocalProjectIdForRemote } from "../../store/projectCloudMappings";

type Nav = NavigationProp<RootStackParamList>;

async function resolveSharedMembershipRole(
  remoteProjectId: string,
): Promise<ProjectMemberRole | undefined> {
  try {
    const discovered = await getMyDiscoveredProjects();
    const match = discovered.find((item) => item.id === remoteProjectId);
    return match?.membership?.role;
  } catch {
    return undefined;
  }
}

async function navigateToSharedProject(
  navigation: Nav,
  remoteProjectId: string,
  knownRole?: ProjectMemberRole,
): Promise<void> {
  const membershipRole =
    knownRole ?? (await resolveSharedMembershipRole(remoteProjectId));

  if (membershipRole) {
    navigation.navigate("Project", {
      projectId: remoteProjectId,
      source: "shared",
      membershipRole,
    });
    return;
  }

  // Role unknown — restricted/generic shared mode (no guessed role).
  navigation.navigate("Project", {
    projectId: remoteProjectId,
    source: "shared",
  });
}

/**
 * Navigates from a Notification destination using existing routes only.
 * Does not treat destination as authorization.
 */
export async function navigateFromNotificationDestination(input: {
  navigation: Nav;
  notification: RemoteNotification;
  currentUid: string;
}): Promise<void> {
  const { navigation, notification, currentUid } = input;
  const destination = notification.destination;

  // Invitee should manage accept/decline on Invitations, not Team.
  if (notification.type === "invitation_created") {
    navigation.navigate("Invitations");
    return;
  }

  switch (destination.kind) {
    case "project": {
      if (notification.type === "member_removed") {
        navigation.navigate("MainTabs", { screen: "Projects" });
        return;
      }

      const localId = await getLocalProjectIdForRemote(
        currentUid,
        destination.projectId,
      );
      if (localId) {
        navigation.navigate("Project", { projectId: localId });
        return;
      }
      await navigateToSharedProject(navigation, destination.projectId);
      return;
    }

    case "work_progress": {
      const localId = await getLocalProjectIdForRemote(
        currentUid,
        destination.projectId,
      );
      if (localId) {
        navigation.navigate("WorkProgressDetail", {
          projectId: localId,
          remoteProjectId: destination.projectId,
          workPackageId: destination.workPackageId,
        });
        return;
      }
      await navigateToSharedProject(navigation, destination.projectId);
      return;
    }

    case "contribution_review": {
      const localId = await getLocalProjectIdForRemote(
        currentUid,
        destination.projectId,
      );

      if (
        notification.type === "measurement_accepted" ||
        notification.type === "measurement_rejected"
      ) {
        if (localId) {
          navigation.navigate("Project", { projectId: localId });
          return;
        }
        await navigateToSharedProject(navigation, destination.projectId);
        return;
      }

      if (localId) {
        navigation.navigate("ContributionReviewDetail", {
          projectId: localId,
          remoteProjectId: destination.projectId,
          measurementId: destination.measurementId,
        });
        return;
      }

      await navigateToSharedProject(navigation, destination.projectId);
      return;
    }

    case "delta": {
      const mapped = await getLocalDeltaIdForRemote(
        currentUid,
        destination.deltaId,
      );
      if (mapped) {
        navigation.navigate("DeltaDetail", {
          deltaId: mapped.localDeltaId,
        });
        return;
      }
      Alert.alert(
        "Delta unavailable",
        "This variance is not available in local project history on this device.",
      );
      return;
    }

    case "agent_run": {
      const localId = await getLocalProjectIdForRemote(
        currentUid,
        destination.projectId,
      );
      if (localId) {
        navigation.navigate("AgentRunDetail", {
          projectId: localId,
          agentRunId: destination.agentRunId,
        });
        return;
      }

      try {
        const { getAgentRun } = await import("../../services/api/agentRuns");
        const run = await getAgentRun(
          destination.projectId,
          destination.agentRunId,
        );
        navigation.navigate("PlanItemDetail", {
          projectId: destination.projectId,
          planItemId: run.deltaContext.remotePlanItemId,
          source: "shared",
        });
        return;
      } catch {
        await navigateToSharedProject(navigation, destination.projectId);
      }
      return;
    }

    case "team": {
      if (notification.type === "member_removed") {
        navigation.navigate("MainTabs", { screen: "Projects" });
        return;
      }

      const localId = await getLocalProjectIdForRemote(
        currentUid,
        destination.projectId,
      );
      if (localId) {
        navigation.navigate("ProjectTeam", { projectId: localId });
        return;
      }

      await navigateToSharedProject(navigation, destination.projectId);
      return;
    }

    case "feed_post": {
      navigation.navigate("FeedPostDetail", {
        projectId: destination.projectId,
        postId: destination.postId,
      });
      return;
    }

    case "feed_comment": {
      navigation.navigate("FeedPostDetail", {
        projectId: destination.projectId,
        postId: destination.postId,
        openComments: true,
      });
      return;
    }

    default:
      return;
  }
}

/**
 * Resolves navigation for a notification tap.
 */
export async function handleNotificationPress(input: {
  navigation: Nav;
  notification: RemoteNotification;
  currentUid: string;
}): Promise<void> {
  await navigateFromNotificationDestination(input);
}
