// Client state and session lifecycle (docs/06-frontend.md, Client state, Session lifecycle, Stream handling).
import { useCallback, useEffect, useReducer, useRef } from "react";

import { ApiError, createSession, restoreSession, streamChat, type Entry, type ResultSet, type StreamEvent } from "./api";
import { turnstileToken } from "./turnstile";

export type Message =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "marker"; resultSet: number } // "Showed {n} products: {headline}"
  | { kind: "error"; text: string; retryText: string; action: ErrorAction };

// What an error row offers: resending can't help a full chat (New chat does) or paused chat (nothing does).
export type ErrorAction = "retry" | "newChat" | "none";
const ERROR_ACTIONS: Record<string, ErrorAction> = { session_full: "newChat", chat_unavailable: "none" };

type ChatState = {
  started: boolean; // the page-load restore or create has finished, successfully or not
  ready: boolean; // a session exists
  messages: Message[];
  resultSets: ResultSet[];
  selectedResultSet: number | null;
  enteringResultSet: number | null; // the set a `products` event just added, whose cards play the entrance once
  turnRunning: boolean;
  status: string;
  loadingResults: boolean; // a search started this turn and its cards haven't arrived yet
  draft: string; // text to place in the composer
  notice: string | null;
};

type Action =
  | { type: "reset"; notice?: string; draft?: string; ready?: boolean; keepDraft?: boolean } // keepDraft: text typed while a first session was being created stays
  | { type: "restored"; entries: Entry[]; draft: string }
  | { type: "send"; text: string; addUserMessage: boolean }
  | { type: "event"; event: StreamEvent }
  | { type: "failed"; text: string; message: string; code: string | null }
  | { type: "turnEnded" }
  | { type: "select"; index: number }
  | { type: "setDraft"; draft: string }
  | { type: "notice"; notice: string | null };

const EXPIRED_NOTICE = "Your previous chat expired. Starting a new one.";
const UNREACHABLE_NOTICE = "Can't reach the store right now. Try again in a moment.";
const LOAD_FAILED_NOTICE = "Can't reach the store right now. Reload the page to try again.";
const BUSY_RETRIES = 3;
const BUSY_RETRY_MS = 1000;

// A refused session creation (rate limit, human check) explains itself; anything else gets the fallback.
const failureNotice = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code !== "http_error" ? error.message : fallback;

const initialState: ChatState = {
  started: false,
  ready: false,
  messages: [],
  resultSets: [],
  selectedResultSet: null,
  enteringResultSet: null,
  turnRunning: false,
  status: "",
  loadingResults: false,
  draft: "",
  notice: null,
};

function addResultSet(state: ChatState, resultSet: ResultSet): ChatState {
  const index = state.resultSets.length;
  return {
    ...state,
    resultSets: [...state.resultSets, resultSet],
    selectedResultSet: index,
    loadingResults: false,
    messages: [...state.messages, { kind: "marker", resultSet: index }],
  };
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "reset":
      return {
        ...initialState,
        started: true,
        ready: action.ready ?? true,
        notice: action.notice ?? null,
        draft: action.draft || (action.keepDraft ? state.draft : ""),
      };
    case "restored":
      return action.entries.reduce<ChatState>(
        (s, entry) =>
          entry.type === "products"
            ? addResultSet(s, { headline: entry.headline, suggestions: entry.suggestions ?? [], products: entry.products ?? [] })
            : { ...s, messages: [...s.messages, { kind: entry.type, text: entry.text }] },
        { ...initialState, started: true, ready: true, draft: action.draft },
      );
    case "send": {
      const messages = action.addUserMessage
        ? [...state.messages, { kind: "user" as const, text: action.text }]
        : state.messages.filter((m) => m.kind !== "error"); // Retry replaces the error row
      return { ...state, messages, turnRunning: true, status: "", loadingResults: false };
    }
    case "event": {
      const { event } = action;
      if (event.event === "status") {
        // Search status text starts with "Searching" (docs/05-api.md, Status text).
        return { ...state, status: event.data.text, loadingResults: state.loadingResults || event.data.text.startsWith("Searching") };
      }
      if (event.event === "text") return { ...state, messages: [...state.messages, { kind: "assistant", text: event.data.text }] };
      if (event.event === "products") {
        // A frame missing a field renders without it (docs/06-frontend.md, Malformed events), as a restored entry does.
        const { headline, suggestions, products } = event.data;
        return { ...addResultSet(state, { headline: headline ?? "", suggestions: suggestions ?? [], products }), enteringResultSet: state.resultSets.length };
      }
      return state; // done and error are handled by the send loop
    }
    case "failed":
      return {
        ...state,
        messages: [
          ...state.messages,
          { kind: "error", text: action.message, retryText: action.text, action: ERROR_ACTIONS[action.code ?? ""] ?? "retry" },
        ],
      };
    case "turnEnded":
      return { ...state, turnRunning: false, status: "", loadingResults: false };
    case "select":
      return { ...state, selectedResultSet: action.index, enteringResultSet: null }; // reselecting never replays the entrance
    case "setDraft":
      return { ...state, draft: action.draft };
    case "notice":
      return { ...state, notice: action.notice };
  }
}

// sessionStorage keeps the chat per tab and across reloads; access can throw when storage is blocked. Keys carry the
// app's prefix, since storage is shared by every page on the domain (docs/06-frontend.md, Client state).
export const SESSION_ID_KEY = "saathi.sessionId";
export const PENDING_MESSAGE_KEY = "saathi.pendingMessage";

/** Whether this tab has a session to restore; without one, the landing shows while the first session is created. */
export const hasStoredSession = () => storage.get(SESSION_ID_KEY) !== null;

const storage = {
  get: (key: string) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      // blocked storage: state lasts for this page only
    }
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sessionId = useRef<string | null>(null);
  const turn = useRef<AbortController | null>(null);

  const startNewSession = useCallback(async (notice?: string, draft?: string, keepDraft?: boolean) => {
    const id = await createSession(await turnstileToken()); // if this fails, the current chat and its turn carry on
    turn.current?.abort(); // the server cancels and rolls back an abandoned turn
    sessionId.current = id;
    storage.set(SESSION_ID_KEY, sessionId.current);
    dispatch({ type: "reset", notice, draft, keepDraft });
  }, []);

  // Page load: restore the stored session, or start one. The ref guards against React's dev-mode double effect.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = storage.get(PENDING_MESSAGE_KEY) ?? "";
    storage.set(PENDING_MESSAGE_KEY, null);
    const stored = storage.get(SESSION_ID_KEY);
    (async () => {
      if (stored) {
        try {
          const restored = await restoreSession(stored);
          sessionId.current = stored;
          dispatch({ type: "restored", entries: restored.entries, draft: pending });
          return;
        } catch (error) {
          if (!(error instanceof ApiError && error.code === "session_not_found")) throw error;
          return startNewSession(EXPIRED_NOTICE, pending);
        }
      }
      await startNewSession(undefined, pending, true);
    })().catch((error) => dispatch({ type: "reset", ready: false, keepDraft: true, notice: failureNotice(error, LOAD_FAILED_NOTICE) }));
  }, [startNewSession]);

  const runTurn = useCallback(
    async (text: string, addUserMessage: boolean) => {
      if (!sessionId.current) return;
      const controller = new AbortController();
      turn.current = controller;
      dispatch({ type: "send", text, addUserMessage });
      storage.set(PENDING_MESSAGE_KEY, text);
      try {
        for (let attempt = 0; ; attempt++) {
          // Assigned inside the event callback, so TypeScript must not narrow them to their initial values.
          let code = null as string | null;
          let failure = null as string | null;
          try {
            await streamChat(
              sessionId.current,
              text,
              (event) => {
                if (event.event === "error") {
                  code = event.data.code;
                  failure = event.data.message;
                } else dispatch({ type: "event", event });
              },
              controller.signal,
            );
          } catch (error) {
            if (isAbort(error)) return;
            if (error instanceof ApiError && error.code === "session_not_found") {
              try {
                return await startNewSession(EXPIRED_NOTICE, text);
              } catch (sessionError) {
                error = sessionError; // couldn't start a new one: show it as this turn's failure
              }
            }
            code = error instanceof ApiError ? error.code : null;
            failure = error instanceof Error ? error.message : "Something went wrong. Try again.";
          }
          if (code === "turn_in_progress" && attempt < BUSY_RETRIES) {
            await sleep(BUSY_RETRY_MS);
            continue;
          }
          if (failure !== null) dispatch({ type: "failed", text, message: failure, code });
          return;
        }
      } finally {
        if (turn.current === controller) {
          turn.current = null;
          storage.set(PENDING_MESSAGE_KEY, null);
          dispatch({ type: "turnEnded" });
        }
      }
    },
    [startNewSession],
  );

  return {
    state,
    send: (text: string) => runTurn(text, true),
    retry: (text: string) => runTurn(text, false),
    newChat: () => startNewSession().catch((error) => dispatch({ type: "notice", notice: failureNotice(error, UNREACHABLE_NOTICE) })),
    selectResultSet: (index: number) => dispatch({ type: "select", index }),
    setDraft: (draft: string) => dispatch({ type: "setDraft", draft }),
    dismissNotice: () => dispatch({ type: "notice", notice: null }),
  };
}
