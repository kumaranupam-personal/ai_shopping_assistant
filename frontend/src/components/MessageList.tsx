import clsx from "clsx";
import { ArrowDown, LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ResultSet } from "../api";
import type { Message } from "../useChat";
import { AssistantAvatar } from "./ChatWelcome";

const NEAR_BOTTOM_PX = 48;
const isAtBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
// An explicit scroll behavior overrides the CSS reduced-motion rule, so it is chosen here.
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = {
  messages: Message[];
  resultSets: ResultSet[];
  selectedResultSet: number | null;
  onSelectResultSet: (index: number) => void;
  onRetry: (text: string) => void;
  onNewChat: () => void;
  welcome?: ReactNode; // shown above the messages, inside the scroll area
  typing: boolean; // a turn is waiting for its first reply
};

export default function MessageList({ messages, resultSets, selectedResultSet, onSelectResultSet, onRetry, onNewChat, welcome, typing }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Follow new messages unless the user has scrolled up to read; then offer "Jump to latest".
  useEffect(() => {
    const el = list.current!;
    if (messages.length === 0) el.scrollTo({ top: 0 }); // the welcome reads from its top
    else if (atBottom) el.scrollTo({ top: el.scrollHeight });
    else setAtBottom(isAtBottom(el)); // the list can shrink without a scroll event, as after New chat
  }, [messages, typing, atBottom]); // the typing indicator counts as new content too

  const onScroll = () => setAtBottom(isAtBottom(list.current!));

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={list} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4">
        {welcome}
        <ol aria-label="Conversation" className="flex flex-col gap-3">
          {messages.map((message, i) => (
            <li key={i} className="flex min-w-0 animate-enter flex-col">
              <MessageRow message={message} resultSets={resultSets} selected={selectedResultSet} onSelect={onSelectResultSet} onRetry={onRetry} onNewChat={onNewChat} />
            </li>
          ))}
        </ol>
        {typing && <TypingIndicator />}
      </div>
      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" })}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium shadow-sm"
        >
          <ArrowDown aria-hidden className="size-3.5" /> Jump to latest
        </button>
      )}
    </div>
  );
}

type RowProps = {
  message: Message;
  resultSets: ResultSet[];
  selected: number | null;
  onSelect: (index: number) => void;
  onRetry: (text: string) => void;
  onNewChat: () => void;
};

function MessageRow({ message, resultSets, selected, onSelect, onRetry, onNewChat }: RowProps) {
  // Long unbroken text (pasted URLs) wraps instead of widening the panel.
  const text = "whitespace-pre-line [overflow-wrap:anywhere]";
  const action = "flex items-center gap-1 font-medium underline-offset-2 hover:underline";
  switch (message.kind) {
    case "user":
      return <p className={clsx(text, "max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent-soft px-4 py-2 text-accent-soft-fg")}>{message.text}</p>;
    case "assistant":
      return <p className={clsx(text, "max-w-[95%] leading-relaxed")}>{message.text}</p>;
    case "marker": {
      const set = resultSets[message.resultSet];
      return (
        <button
          type="button"
          onClick={() => onSelect(message.resultSet)}
          aria-pressed={selected === message.resultSet}
          className={clsx(
            "flex max-w-full min-w-0 items-center gap-2 self-start rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 ease-out",
            selected === message.resultSet ? "border-accent text-fg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
          )}
        >
          <LayoutGrid aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            Showed {set.products.length} products: {set.headline}
          </span>
        </button>
      );
    }
    case "error": {
      const { retryText, action: offer } = message;
      return (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <span className={text}>{message.text}</span>
          {offer === "newChat" && (
            <button type="button" onClick={onNewChat} className={action}>
              <Plus aria-hidden className="size-3.5" /> New chat
            </button>
          )}
          {offer === "retry" && (
            <button type="button" onClick={() => onRetry(retryText)} className={action}>
              <RotateCcw aria-hidden className="size-3.5" /> Retry
            </button>
          )}
        </div>
      );
    }
  }
}

const TYPING_DOT_DELAYS_MS = [0, 150, 300];

/** Three dots that rise in turn while the assistant works (docs/06-frontend.md, Motion). Hidden from screen readers,
 * which hear the status line instead. */
function TypingIndicator() {
  return (
    <div aria-hidden className="mt-3 flex animate-enter items-center gap-3">
      <AssistantAvatar />
      <span className="flex gap-1.5 rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-3">
        {TYPING_DOT_DELAYS_MS.map((delay) => (
          <span key={delay} className="size-1.5 animate-typing rounded-full bg-fg-muted" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    </div>
  );
}
