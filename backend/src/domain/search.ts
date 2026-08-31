/**
 * Authorized BuildSigma search result DTOs (Phase Feed 2F).
 *
 * Presentation only — never includes private media URLs, emails, or phones.
 * Server authorization scopes all results to projects the caller can access.
 */

import type { ProjectStatus } from "./project.js";

export type ProjectSearchResult = {
  id: string;
  name: string;
  status: ProjectStatus;
  location: string;
};

export type PersonSearchResult = {
  userId: string;
  displayName: string;
  projectId: string;
  projectName: string;
  projectMemberId: string;
};

export type FeedPostSearchResult = {
  id: string;
  projectId: string;
  projectName: string;
  author: {
    userId: string;
    displayName: string | null;
  };
  textExcerpt: string;
  createdAt: string;
  hasMedia: boolean;
};

export type BuildSigmaSearchResults = {
  projects: ProjectSearchResult[];
  people: PersonSearchResult[];
  posts: FeedPostSearchResult[];
};

export const SEARCH_PROJECT_LIMIT = 5;
export const SEARCH_PEOPLE_LIMIT = 5;
export const SEARCH_POST_LIMIT = 10;
export const SEARCH_MIN_QUERY_LENGTH = 2;
/** Max active posts scanned within authorized scope before ranking matches. */
export const SEARCH_POST_SCAN_LIMIT = 250;
