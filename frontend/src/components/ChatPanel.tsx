import type { useChat } from "../useChat";
import ChatWelcome from "./ChatWelcome";
import Composer from "./Composer";
import MessageList from "./MessageList";
import StatusLine from "./StatusLine";

export default function ChatPanel({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { state } = chat;
  const last = state.messages.at(-1);
  const fresh = state.started && state.messages.length === 0; // not before a restore, so nothing flashes first
  // Screen readers hear the status while a turn runs, then the newest assistant reply.
  const announcement = state.turnRunning ? state.status : last?.kind === "assistant" ? last.text : "";

  return (
    <>
      <MessageList
        messages={state.messages}
        resultSets={state.resultSets}
        selectedResultSet={state.selectedResultSet}
        onSelectResultSet={chat.selectResultSet}
        onRetry={chat.retry}
        onNewChat={chat.newChat}
        welcome={fresh && <ChatWelcome onSend={chat.send} canSend={state.ready && !state.turnRunning} />}
        typing={state.turnRunning && last?.kind === "user"}
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
      />
    </>
  );
}
