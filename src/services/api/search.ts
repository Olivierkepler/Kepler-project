import { authenticatedFetch } from "./client";
import {
  EMPTY_SEARCH_RESULTS,
  type BuildSigmaSearchResults,
  type FeedPostSearchResult,
  type PersonSearchResult,
  type ProjectSearchResult,
} from "../../types/search";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseProject(value: unknown): ProjectSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id)?.trim();
  const name = asString(value.name)?.trim();
  const location = asString(value.location)?.trim() ?? "";
  const status = asString(value.status);

  if (!id || !name) {
    return null;
  }

  if (
    status !== "active" &&
    status !== "planning" &&
    status !== "completed" &&
    status !== "on-hold"
  ) {
    return null;
  }

  return { id, name, status, location };
}

function parsePerson(value: unknown): PersonSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = asString(value.userId)?.trim();
  const displayName = asString(value.displayName)?.trim();
  const projectId = asString(value.projectId)?.trim();
  const projectName = asString(value.projectName)?.trim();
  const projectMemberId = asString(value.projectMemberId)?.trim();

  if (
    !userId ||
    !displayName ||
    !projectId ||
    !projectName ||
    !projectMemberId
  ) {
    return null;
  }

  return {
    userId,
    displayName,
    projectId,
    projectName,
    projectMemberId,
  };
}

function parsePost(value: unknown): FeedPostSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id)?.trim();
  const projectId = asString(value.projectId)?.trim();
  const projectName = asString(value.projectName)?.trim();
  const textExcerpt = asString(value.textExcerpt)?.trim() ?? "";
  const createdAt = asString(value.createdAt)?.trim();
  const hasMedia = value.hasMedia === true;

  if (!id || !projectId || !projectName || !createdAt) {
    return null;
  }

  const authorRaw = value.author;
  if (!isRecord(authorRaw)) {
    return null;
  }

  const authorUserId = asString(authorRaw.userId)?.trim();
  if (!authorUserId) {
    return null;
  }

  const displayNameRaw = authorRaw.displayName;
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim()
      ? displayNameRaw.trim()
      : null;

  return {
    id,
    projectId,
    projectName,
    author: {
      userId: authorUserId,
      displayName,
    },
    textExcerpt,
    createdAt,
    hasMedia,
  };
}

function parseSearchResults(payload: unknown): BuildSigmaSearchResults {
  if (!isRecord(payload)) {
    return EMPTY_SEARCH_RESULTS;
  }

  const projects = Array.isArray(payload.projects)
    ? payload.projects
        .map(parseProject)
        .filter((item): item is ProjectSearchResult => item !== null)
    : [];

  const people = Array.isArray(payload.people)
    ? payload.people
        .map(parsePerson)
        .filter((item): item is PersonSearchResult => item !== null)
    : [];

  const posts = Array.isArray(payload.posts)
    ? payload.posts
        .map(parsePost)
        .filter((item): item is FeedPostSearchResult => item !== null)
    : [];

  return { projects, people, posts };
}

/**
 * Authorized BuildSigma search.
 * GET /api/search?q=
 */
export async function searchBuildSigma(
  query: string,
): Promise<BuildSigmaSearchResults> {
  const trimmed = query.trim();
  const params = new URLSearchParams();
  params.set("q", trimmed);

  const response = await authenticatedFetch(
    `/api/search?${params.toString()}`,
  );

  if (!response.ok) {
    let message = "Search failed.";

    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error.trim();
      }
    } catch {
      // Keep generic message.
    }

    throw new Error(message);
  }

  const payload: unknown = await response.json();
  return parseSearchResults(payload);
}
