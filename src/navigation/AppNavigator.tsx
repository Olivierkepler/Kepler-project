import React from "react";
import { Platform } from "react-native";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AgentRunDetailScreen from "../screens/AgentRunDetailScreen";
import AgentSummaryScreen from "../screens/AgentSummaryScreen";
import CaptureScreen from "../screens/CaptureScreen";
import CloudProjectsScreen from "../screens/CloudProjectsScreen";
import DeltaDetailScreen from "../screens/DeltaDetailScreen";
import DeltasScreen from "../screens/DeltasScreen";
import AddEvidenceScreen from "../screens/AddEvidenceScreen";
import AddPlanItemScreen from "../screens/AddPlanItemScreen";
import PlanImportApprovalScreen from "../screens/PlanImportApprovalScreen";
import PlanImportReviewScreen from "../screens/PlanImportReviewScreen";
import PlanImportStartScreen from "../screens/PlanImportStartScreen";
import CreateProjectScreen from "../screens/CreateProjectScreen";
import EditPlanItemScreen from "../screens/EditPlanItemScreen";
import EditProjectScreen from "../screens/EditProjectScreen";
import MeasurementDetailScreen from "../screens/MeasurementDetailScreen";
import MeasurementScreen from "../screens/MeasurementScreen";
import ProjectEvidenceScreen from "../screens/ProjectEvidenceScreen";
import ProjectAgentActivityScreen from "../screens/ProjectAgentActivityScreen";
import ProjectActivityScreen from "../screens/ProjectActivityScreen";
import ProjectFieldReportsScreen from "../screens/ProjectFieldReportsScreen";
import ProjectIntelligenceScreen from "../screens/ProjectIntelligenceScreen";
import FieldReportPreviewScreen from "../screens/FieldReportPreviewScreen";
import PlanItemDetailScreen from "../screens/PlanItemDetailScreen";
import ProjectMeasurementsScreen from "../screens/ProjectMeasurementsScreen";
import ProjectPlanScreen from "../screens/ProjectPlanScreen";
import ProjectScreen from "../screens/ProjectScreen";
import ProjectTeamScreen from "../screens/ProjectTeamScreen";
import ProjectTeamMemberScreen from "../screens/ProjectTeamMemberScreen";
import ProjectChatScreen from "../screens/ProjectChatScreen";
import ChatInfoScreen from "../screens/ChatInfoScreen";
import InviteProjectMemberScreen from "../screens/InviteProjectMemberScreen";
import SharedCaptureScreen from "../screens/SharedCaptureScreen";
import ContributionReviewScreen from "../screens/ContributionReviewScreen";
import ContributionReviewDetailScreen from "../screens/ContributionReviewDetailScreen";
import WorkProgressScreen from "../screens/WorkProgressScreen";
import WorkProgressDetailScreen from "../screens/WorkProgressDetailScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import SearchScreen from "../screens/SearchScreen";
import KeplerShowcaseScreen from "../screens/KeplerShowcaseScreen";
import FeedPostDetailScreen from "../screens/FeedPostDetailScreen";
import InvitationsScreen from "../screens/InvitationsScreen";

import PlanAddMethodSheet from "../components/project/PlanAddMethodSheet";

import { colors } from "../theme/colors";

import MainTabNavigator from "./MainTabNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerShown: false,

        contentStyle: {
          backgroundColor: colors.background,
        },

        animation:
          Platform.OS === "ios"
            ? "fade_from_bottom"
            : "fade",

        gestureEnabled: true,

        fullScreenGestureEnabled:
          Platform.OS === "ios",
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{
          animation: "fade",
        }}
      />

      <Stack.Screen
        name="Project"
        component={ProjectScreen}
      />

      <Stack.Screen
        name="ProjectPlan"
        component={ProjectPlanScreen}
      />

      <Stack.Screen
        name="PlanItemDetail"
        component={PlanItemDetailScreen}
      />

      <Stack.Screen
        name="EditProject"
        component={EditProjectScreen}
      />

      <Stack.Screen
        name="CreateProject"
        component={CreateProjectScreen}
      />

      <Stack.Screen
        name="EditPlanItem"
        component={EditPlanItemScreen}
      />

      <Stack.Screen
        name="AddPlanItem"
        component={AddPlanItemScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />

      <Stack.Screen
        name="PlanAddMethod"
        component={PlanAddMethodSheet}
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: {
            backgroundColor: "#FFFFFF",
          },
        }}
      />

      <Stack.Screen
        name="PlanImportStart"
        component={PlanImportStartScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="PlanImportReview"
        component={PlanImportReviewScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="PlanImportApproval"
        component={PlanImportApprovalScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="ProjectEvidence"
        component={ProjectEvidenceScreen}
      />

      <Stack.Screen
        name="ProjectTeam"
        component={ProjectTeamScreen}
      />

      <Stack.Screen
        name="ProjectTeamMember"
        component={ProjectTeamMemberScreen}
      />

      <Stack.Screen
        name="ProjectChat"
        component={ProjectChatScreen}
      />

      <Stack.Screen
        name="ChatInfo"
        component={ChatInfoScreen}
      />

      <Stack.Screen
        name="ContributionReview"
        component={ContributionReviewScreen}
      />

      <Stack.Screen
        name="ContributionReviewDetail"
        component={ContributionReviewDetailScreen}
      />

      <Stack.Screen
        name="WorkProgress"
        component={WorkProgressScreen}
      />

      <Stack.Screen
        name="WorkProgressDetail"
        component={WorkProgressDetailScreen}
      />

      <Stack.Screen
        name="InviteProjectMember"
        component={InviteProjectMemberScreen}
      />

      <Stack.Screen
        name="AddEvidence"
        component={AddEvidenceScreen}
      />

      <Stack.Screen
        name="CaptureProject"
        component={CaptureScreen}
      />

      <Stack.Screen
        name="SharedCapture"
        component={SharedCaptureScreen}
      />

      <Stack.Screen
        name="Measurement"
        component={MeasurementScreen}
      />

      <Stack.Screen
        name="ProjectMeasurements"
        component={ProjectMeasurementsScreen}
      />

      <Stack.Screen
        name="MeasurementDetail"
        component={MeasurementDetailScreen}
      />

      <Stack.Screen
        name="ProjectDeltas"
        component={DeltasScreen}
      />

      <Stack.Screen
        name="ProjectIntelligence"
        component={ProjectIntelligenceScreen}
      />

      <Stack.Screen
        name="ProjectAgentActivity"
        component={ProjectAgentActivityScreen}
      />

      <Stack.Screen
        name="AgentRunDetail"
        component={AgentRunDetailScreen}
      />

      <Stack.Screen
        name="AgentSummary"
        component={AgentSummaryScreen}
      />

      <Stack.Screen
        name="ProjectActivity"
        component={ProjectActivityScreen}
      />

      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
      />

      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{
          animation: "fade_from_bottom",
        }}
      />

      <Stack.Screen
        name="KeplerShowcase"
        component={KeplerShowcaseScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="FeedPostDetail"
        component={FeedPostDetailScreen}
      />

      <Stack.Screen
        name="Invitations"
        component={InvitationsScreen}
      />

      <Stack.Screen
        name="ProjectFieldReports"
        component={ProjectFieldReportsScreen}
      />

      <Stack.Screen
        name="FieldReportPreview"
        component={FieldReportPreviewScreen}
      />

      <Stack.Screen
        name="DeltaDetail"
        component={DeltaDetailScreen}
      />

      <Stack.Screen
        name="CloudProjects"
        component={CloudProjectsScreen}
      />
    </Stack.Navigator>
  );
}