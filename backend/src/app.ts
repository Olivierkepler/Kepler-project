import express from "express";

import { requireAuth } from "./middleware/auth.js";
import { keplerWebCors } from "./middleware/cors.js";
import { agentRunsRouter } from "./routes/agentRuns.js";
import { activityRouter } from "./routes/activity.js";
import { deltasRouter } from "./routes/deltas.js";
import { evidenceRouter } from "./routes/evidence.js";
import { invitationsRouter } from "./routes/invitations.js";
import { meRouter } from "./routes/me.js";
import { measurementsRouter } from "./routes/measurements.js";
import { notificationsRouter } from "./routes/notifications.js";
import { pushDevicesRouter } from "./routes/pushDevices.js";
import { planImportsRouter } from "./routes/planImports.js";
import { planItemsRouter } from "./routes/planItems.js";
import { projectsRouter } from "./routes/projects.js";
import { conversationsRouter } from "./routes/conversations.js";
import { keplerConversationsRouter } from "./routes/keplerConversations.js";
import { feedPostsRouter } from "./routes/feedPosts.js";
import { searchRouter } from "./routes/search.js";
import { workPackageAssignmentsRouter } from "./routes/workPackageAssignments.js";
import { workPackagesRouter } from "./routes/workPackages.js";
import { teamsRouter } from "./routes/teams.js";
import { teamWorkPackageAssignmentsRouter } from "./routes/teamWorkPackageAssignments.js";

export const app = express();

app.use(keplerWebCors);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "buildsigma-api",
    status: "ok",
    version: "0.1.0",
  });
});

// Application-layer Firebase auth for all domain routes.
// Cloud Run remains publicly invokable so clients can send Firebase ID tokens.
app.use("/api", requireAuth);

app.use("/api/projects", projectsRouter);
app.use("/api", meRouter);
app.use("/api", invitationsRouter);
app.use("/api", planItemsRouter);
app.use("/api", planImportsRouter);
app.use("/api", measurementsRouter);
app.use("/api", deltasRouter);
app.use("/api", evidenceRouter);
app.use("/api", workPackagesRouter);
app.use("/api", teamsRouter);
app.use("/api", teamWorkPackageAssignmentsRouter);
app.use("/api", workPackageAssignmentsRouter);
app.use("/api", conversationsRouter);
app.use("/api", keplerConversationsRouter);
app.use("/api", feedPostsRouter);
app.use("/api", searchRouter);
app.use("/api", agentRunsRouter);
app.use("/api", activityRouter);
app.use("/api", notificationsRouter);
app.use("/api", pushDevicesRouter);
