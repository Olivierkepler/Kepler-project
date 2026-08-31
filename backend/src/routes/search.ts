import { Router } from "express";

import { searchBuildSigmaForUser } from "../services/search/searchService.js";
import {
  handleRouteError,
  requireUserUid,
  sendError,
} from "../validation/http.js";

export const searchRouter = Router();

/**
 * Authorized BuildSigma search (Phase Feed 2F).
 * GET /api/search?q=
 *
 * Returns categorized projects / people / posts inside the caller's
 * authorized project scope only.
 */
searchRouter.get("/search", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const rawQuery =
      typeof req.query.q === "string" ? req.query.q : "";

    const results = await searchBuildSigmaForUser({
      userId: uid,
      query: rawQuery,
    });

    res.status(200).json(results);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
