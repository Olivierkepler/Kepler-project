import { Router } from "express";
import { assertProjectAccessContext, canReadWorkPackageId } from "../services/collaboration/projectAccessScope.js";
import { assignTeamToWorkPackage, listTeamAssignmentsForReader, removeTeamAssignment, TeamWorkPackageAssignmentError } from "../services/teamWorkPackageAssignmentService.js";
import { handleRouteError, readBody, requireUserUid, sendError } from "../validation/http.js";
import { parseTeamWorkPackageAssignmentCreateInput } from "../validation/teamWorkPackageAssignment.js";
import { projectTeamAssignmentActivity } from "../services/activity/projectActivityProjections.js";
import { getWorkPackageById } from "../repositories/workPackagesRepository.js";
import { getTeamById } from "../repositories/teamsRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";

export const teamWorkPackageAssignmentsRouter = Router();
async function respondError(res: import("express").Response, error: unknown) {
  if (error instanceof TeamWorkPackageAssignmentError) return sendError(res, error.statusCode, error.message);
  return handleRouteError(res, error);
}

teamWorkPackageAssignmentsRouter.get("/projects/:projectId/team-work-package-assignments", async (req, res) => {
  const uid = requireUserUid(req); const projectId = req.params.projectId;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId) return sendError(res, 400, "projectId is required");
  try {
    const [items, access] = await Promise.all([listTeamAssignmentsForReader(projectId, uid), assertProjectAccessContext(projectId, uid)]);
    res.status(200).json(access.role === "viewer" ? [] : items.filter((item) => canReadWorkPackageId(access, item.workPackageId)));
  } catch (error) { await respondError(res, error); }
});

teamWorkPackageAssignmentsRouter.post("/projects/:projectId/work-packages/:workPackageId/team-assignments", async (req, res) => {
  const uid = requireUserUid(req); const { projectId, workPackageId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !workPackageId) return sendError(res, 400, "projectId and workPackageId are required");
  const body = parseTeamWorkPackageAssignmentCreateInput(readBody(req));
  if (!body) return sendError(res, 400, "Invalid Team assignment payload");
  try {
    const assignment = await assignTeamToWorkPackage({ projectId, workPackageId, teamId: body.teamId, uid });
    try {
      const [team, workPackage, project] = await Promise.all([getTeamById(body.teamId), getWorkPackageById(workPackageId), getProjectById(projectId)]);
      if (team && workPackage && project) await projectTeamAssignmentActivity({ assignment, team, workPackage, actorUid: uid, projectOwnerUid: project.ownerUid, action: "created" });
    } catch { /* Activity projection is best effort. */ }
    res.status(201).json(assignment);
  } catch (error) { await respondError(res, error); }
});

teamWorkPackageAssignmentsRouter.delete("/projects/:projectId/work-packages/:workPackageId/team-assignments/:teamId", async (req, res) => {
  const uid = requireUserUid(req); const { projectId, workPackageId, teamId } = req.params;
  if (!uid) return sendError(res, 401, "Unauthorized");
  if (!projectId || !workPackageId || !teamId) return sendError(res, 400, "projectId, workPackageId, and teamId are required");
  try {
    const removed = await removeTeamAssignment({ projectId, workPackageId, teamId, uid });
    if (!removed) return sendError(res, 404, "Team assignment not found");
    try {
      const [team, workPackage, project] = await Promise.all([getTeamById(teamId), getWorkPackageById(workPackageId), getProjectById(projectId)]);
      if (team && workPackage && project) await projectTeamAssignmentActivity({ assignment: removed, team, workPackage, actorUid: uid, projectOwnerUid: project.ownerUid, action: "removed" });
    } catch { /* Activity projection is best effort. */ }
    res.status(200).json(removed);
  } catch (error) { await respondError(res, error); }
});
