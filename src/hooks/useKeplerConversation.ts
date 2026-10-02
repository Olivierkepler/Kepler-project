import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import {
  createKeplerConversation,
  KeplerAssistantApiError,
  sendKeplerMessage,
  type KeplerApiErrorKind,
  type KeplerMessagePostResult,
} from "../services/api/keplerAssistant";
import {
  createKeplerClientMessageId,
  createKeplerConversationState,
  keplerConversationReducer,
  keplerProjectChatAvailability,
  type KeplerConversationState,
  type KeplerFailureKind,
  type KeplerSendAttempt,
} from "../utils/domain/keplerConversationState";

function scopedKey(uid: string | undefined, localProjectId: string | undefined): string | null {
  return uid && localProjectId ? `${uid}:${localProjectId}` : null;
}

export function getKeplerSendErrorCopy(kind: KeplerFailureKind | KeplerApiErrorKind | null): string | null {
  if (kind === "network") return "Couldn't send. Check your connection and try again.";
  if (kind === "assistant") return "Kepler couldn't respond right now. Try again.";
  if (kind === "authentication") return "Your session needs to be refreshed before you can continue.";
  if (kind === "access") return "You no longer have access to this project.";
  if (kind === "invalid") return "Kepler couldn't use that response. Please try again.";
  if (kind === "setup") return "Kepler couldn't start a secure message. Please try again.";
  return null;
}

export function useKeplerConversation(uid: string | undefined, localProjectId: string | undefined) {
  const scopeKey = scopedKey(uid, localProjectId);
  const [state, dispatch] = useReducer(keplerConversationReducer, scopeKey, createKeplerConversationState);
  const [mapping, setMapping] = useState<{ scopeKey: string | null; loading: boolean; remoteProjectId: string | null }>({ scopeKey: null, loading: false, remoteProjectId: null });
  const inFlightRef = useRef(false);
  const activeScopeRef = useRef(scopeKey);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    activeScopeRef.current = scopeKey;
    dispatch({ type: "scope_changed", scopeKey });
    if (!uid || !localProjectId || !scopeKey) {
      setMapping({ scopeKey, loading: false, remoteProjectId: null });
      return;
    }
    let active = true;
    setMapping({ scopeKey, loading: true, remoteProjectId: null });
    void getRemoteProjectId(uid, localProjectId)
      .then((remoteProjectId) => {
        if (active) setMapping({ scopeKey, loading: false, remoteProjectId: remoteProjectId ?? null });
      })
      .catch(() => {
        if (active) setMapping({ scopeKey, loading: false, remoteProjectId: null });
      });
    return () => { active = false; };
  }, [uid, localProjectId, scopeKey]);

  const currentState: KeplerConversationState = state.scopeKey === scopeKey
    ? state
    : createKeplerConversationState(scopeKey);
  const mappingMatches = mapping.scopeKey === scopeKey;
  const mappingLoading = Boolean(scopeKey) && (!mappingMatches || mapping.loading);
  const remoteProjectId = mappingMatches ? mapping.remoteProjectId : null;
  const availability = keplerProjectChatAvailability(mappingLoading, remoteProjectId);

  const executeAttempt = useCallback(async (attempt: KeplerSendAttempt, retry: boolean): Promise<boolean> => {
    if (!uid || !localProjectId || !scopeKey || !remoteProjectId || inFlightRef.current) return false;
    if (activeScopeRef.current !== scopeKey) return false;
    inFlightRef.current = true;
    let conversationId = currentState.conversationId ?? "";
    if (retry) {
      dispatch({ type: "retry_started", creatingConversation: !conversationId });
    } else {
      dispatch({ type: "send_started", attempt, creatingConversation: !conversationId });
    }
    try {
      if (!conversationId) {
        const conversation = await createKeplerConversation(remoteProjectId);
        conversationId = conversation.id;
        if (activeScopeRef.current !== scopeKey) return false;
        dispatch({ type: "conversation_created", conversationId });
      }
      const result: KeplerMessagePostResult = await sendKeplerMessage({
        projectId: remoteProjectId,
        conversationId,
        content: attempt.content,
        clientMessageId: attempt.clientMessageId,
      });
      if (activeScopeRef.current !== scopeKey) return false;
      dispatch({ type: "response_received", result });
      return true;
    } catch (error) {
      if (activeScopeRef.current !== scopeKey) return false;
      if (error instanceof KeplerAssistantApiError && (error.kind === "access" || error.kind === "authentication")) {
        dispatch({ type: "access_revoked" });
      } else {
        const kind = error instanceof KeplerAssistantApiError && ["network", "assistant", "invalid"].includes(error.kind)
          ? error.kind as "network" | "assistant" | "invalid"
          : "network";
        dispatch({ type: "send_failed", kind });
      }
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, [uid, localProjectId, scopeKey, remoteProjectId, currentState.conversationId]);

  const send = useCallback(async (content: string): Promise<boolean> => {
    const trimmed = content.trim();
    const canRetrySetup = currentState.status === "failed" && !currentState.attempt;
    if (!trimmed || availability !== "available" || !scopeKey || (currentState.status !== "idle" && !canRetrySetup) || currentState.attempt || inFlightRef.current) return false;
    let clientMessageId: string;
    try {
      clientMessageId = createKeplerClientMessageId(randomUUID);
    } catch {
      dispatch({ type: "send_failed", kind: "setup" });
      return false;
    }
    const attempt: KeplerSendAttempt = { content: trimmed, clientMessageId, localMessageId: `local-${clientMessageId}` };
    return executeAttempt(attempt, false);
  }, [availability, scopeKey, currentState.status, currentState.attempt, executeAttempt]);

  const retry = useCallback(async (): Promise<boolean> => {
    const attempt = stateRef.current.scopeKey === scopeKey ? stateRef.current.attempt : null;
    if (!attempt || availability !== "available" || inFlightRef.current) return false;
    return executeAttempt(attempt, true);
  }, [availability, scopeKey, executeAttempt]);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    dispatch({ type: "reset", scopeKey });
  }, [scopeKey]);

  const errorMessage = useMemo(() => getKeplerSendErrorCopy(currentState.failureKind), [currentState.failureKind]);
  return {
    ...currentState,
    remoteProjectId,
    mappingLoading,
    availability,
    errorMessage: currentState.status === "access_denied"
      ? "You no longer have access to this project."
      : errorMessage,
    sending: currentState.status === "creating" || currentState.status === "sending",
    send,
    retry,
    reset,
  };
}
