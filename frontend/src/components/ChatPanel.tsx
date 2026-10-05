import { useEffect, useRef } from "react";

import type { useChat } from "../useChat";
import Composer from "./Composer";
import MessageList from "./MessageList";
import StatusLine from "./StatusLine";

/** Where focus lands when the conversation leaves the landing (docs/06-frontend.md, Loading, empty and error states). */
export type EntryFocus = "composer" | "list" | null;

export default function ChatPanel({ chat, entryFocus }: { chat: ReturnType<typeof useChat>; entryFocus: EntryFocus }) {
  const { state } = chat;
  const last = state.messages.at(-1);
  const list = useRef<HTMLOListElement>(null);
  // Screen readers hear the status while a turn runs, then the newest assistant reply.
  const announcement = state.turnRunning ? state.status : last?.kind === "assistant" ? last.text : "";

  // After a card or chip on the landing, the list takes focus, so a phone's keyboard stays closed.
  useEffect(() => {
    if (entryFocus === "list") list.current!.focus({ preventScroll: true });
  }, [entryFocus]);

  return (
    <>
      <MessageList
        messages={state.messages}
        resultSets={state.resultSets}
        selectedResultSet={state.selectedResultSet}
        onSelectResultSet={chat.selectResultSet}
        onRetry={chat.retry}
        onNewChat={chat.newChat}
        typing={state.turnRunning && last?.kind === "user"}
        listRef={list}
      />
      <StatusLine running={state.turnRunning} status={state.status} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Composer
        variant="chat"
        draft={state.draft}
        onDraftChange={chat.setDraft}
        onSend={chat.send}
        canSend={state.ready && !state.turnRunning}
        autoFocus={entryFocus === "composer"}
      />
    </>
  );
}
