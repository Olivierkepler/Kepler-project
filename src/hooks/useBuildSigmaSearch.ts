import { useCallback, useEffect, useRef, useState } from "react";

import { searchBuildSigma } from "../services/api/search";
import {
  EMPTY_SEARCH_RESULTS,
  type BuildSigmaSearchResults,
} from "../types/search";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export type UseBuildSigmaSearchResult = {
  query: string;
  setQuery: (value: string) => void;
  clearQuery: () => void;
  results: BuildSigmaSearchResults;
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** True when the query is long enough to search. */
  isSearchable: boolean;
  hasAnyResults: boolean;
};

function normalizeClientQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export default function useBuildSigmaSearch(): UseBuildSigmaSearchResult {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<BuildSigmaSearchResults>(
    EMPTY_SEARCH_RESULTS,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
  }, []);

  const clearQuery = useCallback(() => {
    setQueryState("");
    setResults(EMPTY_SEARCH_RESULTS);
    setError(null);
    setLoading(false);
  }, []);

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  const normalized = normalizeClientQuery(query);
  const isSearchable = normalized.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!isSearchable) {
      requestIdRef.current += 1;
      setResults(EMPTY_SEARCH_RESULTS);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const requestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const next = await searchBuildSigma(normalized);

          if (requestId !== requestIdRef.current) {
            return;
          }

          setResults(next);
          setError(null);
        } catch (caught) {
          if (requestId !== requestIdRef.current) {
            return;
          }

          setResults(EMPTY_SEARCH_RESULTS);
          setError(
            caught instanceof Error && caught.message.trim()
              ? caught.message
              : "Something went wrong",
          );
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [normalized, isSearchable, retryToken]);

  const hasAnyResults =
    results.projects.length > 0 ||
    results.people.length > 0 ||
    results.posts.length > 0;

  return {
    query,
    setQuery,
    clearQuery,
    results,
    loading,
    error,
    retry,
    isSearchable,
    hasAnyResults,
  };
}
