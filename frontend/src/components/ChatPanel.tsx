import type { useChat } from "../useChat";
import Composer from "./Composer";
import MessageList from "./MessageList";
import { EmptyState } from "./States";
import StatusLine from "./StatusLine";

export default function ChatPanel({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { state } = chat;
  const last = state.messages.at(-1);
  const fresh = state.started && state.messages.length === 0; // not before a restore, so nothing flashes first
  // Screen readers hear the status while a turn runs, then the newest assistant reply.
  const announcement = state.turnRunning ? state.status : last?.kind === "assistant" ? last.text : "";

  return (
    <>
      {/* Narrow layout: the empty state sits at the top of the chat; wide shows it in the results panel. */}
      {fresh && <EmptyState className="px-4 pt-8 lg:hidden" />}
      <MessageList
        messages={state.messages}
        resultSets={state.resultSets}
        selectedResultSet={state.selectedResultSet}
        onSelectResultSet={chat.selectResultSet}
        onRetry={chat.retry}
      />
      <StatusLine running={state.turnRunning} status={state.status} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Composer
        draft={state.draft}
        onDraftChange={chat.setDraft}
        onSend={chat.send}
        canSend={state.ready && !state.turnRunning}
        showExamples={fresh}
      />
    </>
  );
}
