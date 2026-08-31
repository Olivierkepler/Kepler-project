/**
 * Phase Feed 2F — authorized BuildSigma search.
 *
 * Scope: projects the authenticated user can discover (active membership
 * or legacy ownership), then members and human feed posts inside that scope.
 *
 * Matching: case-insensitive substring on normalized fields (no search vendor).
 * Does not return private media URLs, emails, or phones.
 */

import type { FeedPost } from "../../domain/feedPost.js";
import { createProjectMemberId } from "../../domain/projectMemberId.js";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PEOPLE_LIMIT,
  SEARCH_POST_LIMIT,
  SEARCH_POST_SCAN_LIMIT,
  SEARCH_PROJECT_LIMIT,
  type BuildSigmaSearchResults,
  type FeedPostSearchResult,
  type PersonSearchResult,
  type ProjectSearchResult,
} from "../../domain/search.js";
import { listFeedPostsForProjects } from "../../repositories/feedPostsRepository.js";
import { listProjectMembers } from "../../repositories/projectMembersRepository.js";
import { getUserProfilesByUids } from "../../repositories/userProfilesRepository.js";
import { discoverProjectsForUser } from "../collaboration/discoverProjects.js";

const EMPTY_RESULTS: BuildSigmaSearchResults = {
  projects: [],
  people: [],
  posts: [],
};

/**
 * Normalize a search query or haystack safely.
 * Preserves construction identifiers (hyphens, #, digits).
 */
export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isSearchableQuery(normalizedQuery: string): boolean {
  return normalizedQuery.length >= SEARCH_MIN_QUERY_LENGTH;
}

function matchesNormalized(
  haystack: string,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) {
    return false;
  }

  return normalizeSearchText(haystack).includes(normalizedQuery);
}

function excerptText(text: string, maxLength = 140): string {
  const collapsed = text.trim().replace(/\s+/g, " ");

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

function toProjectResult(input: {
  id: string;
  name: string;
  status: ProjectSearchResult["status"];
  location: string;
}): ProjectSearchResult {
  return {
    id: input.id,
    name: input.name,
    status: input.status,
    location: input.location,
  };
}

function toPostResult(
  post: FeedPost,
  projectName: string,
  displayName: string | null,
): FeedPostSearchResult {
  return {
    id: post.id,
    projectId: post.projectId,
    projectName,
    author: {
      userId: post.authorUserId,
      displayName,
    },
    textExcerpt: excerptText(post.text),
    createdAt: post.createdAt,
    hasMedia: post.media.length > 0,
  };
}

/**
 * Authorized search for the authenticated user.
 * Short / empty queries return empty categorized results (client empty state).
 */
export async function searchBuildSigmaForUser(input: {
  userId: string;
  query: string;
}): Promise<BuildSigmaSearchResults> {
  const userId = input.userId.trim();

  if (!userId) {
    throw new Error("userId is required");
  }

  const normalizedQuery = normalizeSearchText(input.query);

  if (!isSearchableQuery(normalizedQuery)) {
    return EMPTY_RESULTS;
  }

  const discovered = await discoverProjectsForUser(userId);

  if (discovered.length === 0) {
    return EMPTY_RESULTS;
  }

  const projectById = new Map(
    discovered.map((project) => [project.id, project]),
  );
  const projectIds = discovered.map((project) => project.id);

  const projectMatches: ProjectSearchResult[] = [];

  for (const project of discovered) {
    if (
      matchesNormalized(project.name, normalizedQuery) ||
      matchesNormalized(project.location, normalizedQuery)
    ) {
      projectMatches.push(
        toProjectResult({
          id: project.id,
          name: project.name,
          status: project.status,
          location: project.location,
        }),
      );
    }

    if (projectMatches.length >= SEARCH_PROJECT_LIMIT) {
      break;
    }
  }

  const memberLists = await Promise.all(
    projectIds.map((projectId) => listProjectMembers(projectId)),
  );

  const activeMembers = memberLists.flat().filter((member) => {
    if (member.status !== "active") {
      return false;
    }

    return projectById.has(member.projectId);
  });

  const memberUserIds = [
    ...new Set(activeMembers.map((member) => member.userId)),
  ];

  const profiles = await getUserProfilesByUids(memberUserIds);
  const displayNameByUserId = new Map(
    profiles.map((profile) => [
      profile.uid,
      profile.displayName.trim() || null,
    ]),
  );

  const peopleMatches: PersonSearchResult[] = [];
  const seenPeopleKeys = new Set<string>();

  for (const member of activeMembers) {
    const displayName = displayNameByUserId.get(member.userId);

    if (!displayName) {
      continue;
    }

    if (!matchesNormalized(displayName, normalizedQuery)) {
      continue;
    }

    const dedupeKey = `${member.userId}:${member.projectId}`;

    if (seenPeopleKeys.has(dedupeKey)) {
      continue;
    }

    seenPeopleKeys.add(dedupeKey);

    const project = projectById.get(member.projectId);

    if (!project) {
      continue;
    }

    peopleMatches.push({
      userId: member.userId,
      displayName,
      projectId: member.projectId,
      projectName: project.name,
      projectMemberId: createProjectMemberId(
        member.projectId,
        member.userId,
      ),
    });

    if (peopleMatches.length >= SEARCH_PEOPLE_LIMIT) {
      break;
    }
  }

  const postsPage = await listFeedPostsForProjects(projectIds, {
    limit: SEARCH_POST_SCAN_LIMIT,
  });

  const authorIds = [
    ...new Set(postsPage.items.map((post) => post.authorUserId)),
  ];
  const authorProfiles = await getUserProfilesByUids(authorIds);
  const authorNameByUserId = new Map(
    authorProfiles.map((profile) => [
      profile.uid,
      profile.displayName.trim() || null,
    ]),
  );

  // Prefer freshest author profile map when overlapping with members.
  for (const [uid, name] of displayNameByUserId) {
    if (!authorNameByUserId.has(uid)) {
      authorNameByUserId.set(uid, name);
    }
  }

  const postMatches: FeedPostSearchResult[] = [];

  for (const post of postsPage.items) {
    const project = projectById.get(post.projectId);

    if (!project) {
      continue;
    }

    const authorName = authorNameByUserId.get(post.authorUserId) ?? null;
    const textMatch = matchesNormalized(post.text, normalizedQuery);
    const authorMatch =
      authorName != null &&
      matchesNormalized(authorName, normalizedQuery);
    const projectNameMatch = matchesNormalized(
      project.name,
      normalizedQuery,
    );

    if (!textMatch && !authorMatch && !projectNameMatch) {
      continue;
    }

    postMatches.push(toPostResult(post, project.name, authorName));

    if (postMatches.length >= SEARCH_POST_LIMIT) {
      break;
    }
  }

  return {
    projects: projectMatches,
    people: peopleMatches,
    posts: postMatches,
  };
}
