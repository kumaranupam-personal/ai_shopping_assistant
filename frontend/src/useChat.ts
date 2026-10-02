// Client state and session lifecycle (docs/06-frontend.md, Client state, Session lifecycle, Stream handling).
import { useCallback, useEffect, useReducer, useRef } from "react";

import { ApiError, createSession, restoreSession, streamChat, type Entry, type ResultSet, type StreamEvent } from "./api";

export type Message =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "marker"; resultSet: number } // "Showed {n} products: {headline}"
  | { kind: "error"; text: string; retryText: string };

export type ChatState = {
  ready: boolean; // a session exists
  messages: Message[];
  resultSets: ResultSet[];
  selectedResultSet: number | null;
  turnRunning: boolean;
  status: string;
  loadingResults: boolean; // a search started this turn and its cards haven't arrived yet
  draft: string; // text to place in the composer
  notice: string | null;
};

type Action =
  | { type: "reset"; notice?: string; draft?: string; ready?: boolean }
  | { type: "restored"; entries: Entry[]; draft: string }
  | { type: "send"; text: string; addUserMessage: boolean }
  | { type: "event"; event: StreamEvent }
  | { type: "failed"; text: string; message: string }
  | { type: "turnEnded" }
  | { type: "select"; index: number }
  | { type: "setDraft"; draft: string }
  | { type: "notice"; notice: string | null };

const EXPIRED_NOTICE = "Your previous chat expired. Starting a new one.";
const UNREACHABLE_NOTICE = "Can't reach the store right now. Try again in a moment.";
const BUSY_RETRIES = 3;
const BUSY_RETRY_MS = 1000;

const initialState: ChatState = {
  ready: false,
  messages: [],
  resultSets: [],
  selectedResultSet: null,
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
      return { ...initialState, ready: action.ready ?? true, notice: action.notice ?? null, draft: action.draft ?? "" };
    case "restored":
      return action.entries.reduce<ChatState>(
        (s, entry) =>
          entry.type === "products"
            ? addResultSet(s, { headline: entry.headline, suggestions: entry.suggestions, products: entry.products })
            : { ...s, messages: [...s.messages, { kind: entry.type, text: entry.text }] },
        { ...initialState, ready: true, draft: action.draft },
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
      if (event.event === "products") return addResultSet(state, event.data);
      return state; // done and error are handled by the send loop
    }
    case "failed":
      return { ...state, messages: [...state.messages, { kind: "error", text: action.message, retryText: action.text }] };
    case "turnEnded":
      return { ...state, turnRunning: false, status: "", loadingResults: false };
    case "select":
      return { ...state, selectedResultSet: action.index };
    case "setDraft":
      return { ...state, draft: action.draft };
    case "notice":
      return { ...state, notice: action.notice };
  }
}

// sessionStorage keeps the chat per tab and across reloads; access can throw when storage is blocked.
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

  const startNewSession = useCallback(async (notice?: string, draft?: string) => {
    turn.current?.abort(); // the server cancels and rolls back an abandoned turn
    sessionId.current = await createSession();
    storage.set("sessionId", sessionId.current);
    dispatch({ type: "reset", notice, draft });
  }, []);

  // Page load: restore the stored session, or start one. The ref guards against React's dev-mode double effect.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = storage.get("pendingMessage") ?? "";
    storage.set("pendingMessage", null);
    const stored = storage.get("sessionId");
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
      await startNewSession(undefined, pending);
    })().catch(() =>
      dispatch({ type: "reset", ready: false, notice: "Can't reach the store right now. Reload the page to try again." }),
    );
  }, [startNewSession]);

  const runTurn = useCallback(
    async (text: string, addUserMessage: boolean) => {
      if (!sessionId.current) return;
      const controller = new AbortController();
      turn.current = controller;
      dispatch({ type: "send", text, addUserMessage });
      storage.set("pendingMessage", text);
      try {
        for (let attempt = 0; ; attempt++) {
          // Assigned inside the event callback, so TypeScript must not narrow them to their initial values.
          let busy = false as boolean;
          let failure = null as string | null;
          try {
            await streamChat(
              sessionId.current,
              text,
              (event) => {
                if (event.event === "error") {
                  busy = event.data.code === "turn_in_progress";
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
            busy = error instanceof ApiError && error.code === "turn_in_progress";
            failure = error instanceof Error ? error.message : "Something went wrong. Try again.";
          }
          if (busy && attempt < BUSY_RETRIES) {
            await sleep(BUSY_RETRY_MS);
            continue;
          }
          if (failure !== null) dispatch({ type: "failed", text, message: failure });
          return;
        }
      } finally {
        if (turn.current === controller) {
          turn.current = null;
          storage.set("pendingMessage", null);
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
    newChat: () => startNewSession().catch(() => dispatch({ type: "notice", notice: UNREACHABLE_NOTICE })),
    selectResultSet: (index: number) => dispatch({ type: "select", index }),
    setDraft: (draft: string) => dispatch({ type: "setDraft", draft }),
    dismissNotice: () => dispatch({ type: "notice", notice: null }),
  };
}
