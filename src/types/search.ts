/**
 * BuildSigma search result models (Phase Feed 2F).
 * Mirrors backend authorized search DTOs — no private media URLs.
 */

export type ProjectSearchResult = {
  id: string;
  name: string;
  status: "active" | "planning" | "completed" | "on-hold";
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

export const EMPTY_SEARCH_RESULTS: BuildSigmaSearchResults = {
  projects: [],
  people: [],
  posts: [],
};
