import { Router } from "express";

import {
  addTeamMemberForOwner,
  archiveTeamForOwner,
  createTeamForOwner,
  getTeamForReader,
  listTeamMembersForReader,
  listTeamsForReader,
  renameTeamForOwner,
  removeTeamMemberForOwner,
  TeamServiceError,
} from "../services/teamService.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  parseTeamCreateInput,
  parseTeamMembershipCreateInput,
  parseTeamUpdateInput,
} from "../validation/team.js";

export const teamsRouter = Router();

async function respondWithError(res: import("express").Response, error: unknown) {
  if (error instanceof TeamServiceError) {
    sendError(res, error.statusCode, error.message);
    return;
  }
  await handleRouteError(res, error);
}

teamsRouter.get("/projects/:projectId/teams", async (req, res) => {
  const uid = requireUserUid(req);
  const projectId = req.params.projectId;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId) return sendError(res, 400, "projectId is required");
  try {
    res.status(200).json(await listTeamsForReader(projectId, uid));
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.post("/projects/:projectId/teams", async (req, res) => {
  const uid = requireUserUid(req);
  const projectId = req.params.projectId;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId) return sendError(res, 400, "projectId is required");
  const input = parseTeamCreateInput(readBody(req));
  if (!input) return sendError(res, 400, "Invalid Team payload");
  try {
    const team = await createTeamForOwner({ projectId, uid, name: input.name });
    res.status(201).json(team);
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.get("/projects/:projectId/teams/:teamId", async (req, res) => {
  const uid = requireUserUid(req);
  const { projectId, teamId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !teamId) return sendError(res, 400, "projectId and teamId are required");
  try {
    res.status(200).json(await getTeamForReader(projectId, teamId, uid));
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.patch("/projects/:projectId/teams/:teamId", async (req, res) => {
  const uid = requireUserUid(req);
  const { projectId, teamId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !teamId) return sendError(res, 400, "projectId and teamId are required");
  const update = parseTeamUpdateInput(readBody(req));
  if (!update) return sendError(res, 400, "Invalid Team update payload");
  try {
    res.status(200).json(await renameTeamForOwner({ projectId, teamId, uid, name: update.name }));
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.delete("/projects/:projectId/teams/:teamId", async (req, res) => {
  const uid = requireUserUid(req);
  const { projectId, teamId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !teamId) return sendError(res, 400, "projectId and teamId are required");
  try {
    res.status(200).json(await archiveTeamForOwner({ projectId, teamId, uid }));
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.get("/projects/:projectId/teams/:teamId/members", async (req, res) => {
  const uid = requireUserUid(req);
  const { projectId, teamId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !teamId) return sendError(res, 400, "projectId and teamId are required");
  try {
    res.status(200).json(await listTeamMembersForReader(projectId, teamId, uid));
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.post("/projects/:projectId/teams/:teamId/members", async (req, res) => {
  const uid = requireUserUid(req);
  const { projectId, teamId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !teamId) return sendError(res, 400, "projectId and teamId are required");
  const input = parseTeamMembershipCreateInput(readBody(req));
  if (!input) return sendError(res, 400, "Invalid Team membership payload");
  try {
    const result = await addTeamMemberForOwner({
      projectId,
      teamId,
      projectMemberId: input.projectMemberId,
      uid,
    });
    res.status(result.created ? 201 : 200).json(result.membership);
  } catch (error) {
    await respondWithError(res, error);
  }
});

teamsRouter.delete(
  "/projects/:projectId/teams/:teamId/members/:projectMemberId",
  async (req, res) => {
    const uid = requireUserUid(req);
    const { projectId, teamId, projectMemberId } = req.params;
    if (!uid) return sendError(res, 401, "Unauthorized");
    if (!projectId || !teamId || !projectMemberId) {
      return sendError(res, 400, "projectId, teamId, and projectMemberId are required");
    }
    try {
      await removeTeamMemberForOwner({ projectId, teamId, projectMemberId, uid });
      res.status(204).send();
    } catch (error) {
      await respondWithError(res, error);
    }
  },
);
