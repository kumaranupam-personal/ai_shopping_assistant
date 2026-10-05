import clsx from "clsx";
import { ArrowDown, LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import type { ResultSet } from "../api";
import type { Message } from "../useChat";

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
  typing: boolean; // a turn is waiting for its first reply
  listRef?: RefObject<HTMLOListElement | null>; // focused after a send from the landing's cards and chips
};

export default function MessageList({ messages, resultSets, selectedResultSet, onSelectResultSet, onRetry, onNewChat, typing, listRef }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Follow new messages unless the user has scrolled up to read; then offer "Jump to latest".
  useEffect(() => {
    const el = list.current!;
    if (atBottom) el.scrollTo({ top: el.scrollHeight });
    else setAtBottom(isAtBottom(el)); // the list can shrink without a scroll event, as after New chat
  }, [messages, typing, atBottom]); // the typing indicator counts as new content too

  const onScroll = () => setAtBottom(isAtBottom(list.current!));

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={list} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4">
        <ol ref={listRef} tabIndex={-1} aria-label="Conversation" className="flex flex-col gap-3 outline-none">
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
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-fg shadow-float"
        >
          <ArrowDown aria-hidden className="size-3.5" /> Jump to latest
        </button>
      )}
    </div>
  );
}

/** The assistant's avatar: the letter "S" in a 28 px circle, beside assistant text and the typing indicator. */
function AssistantAvatar() {
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-panel-raised font-serif text-[18px] leading-none text-panel-fg">
      S
    </span>
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

// Result markers and error rows sit 40 px in (the avatar plus its gap), lined up with assistant text.
const INDENTED = "ml-10 max-w-[calc(100%-2.5rem)] self-start";

function MessageRow({ message, resultSets, selected, onSelect, onRetry, onNewChat }: RowProps) {
  // Long unbroken text (pasted URLs) wraps instead of widening the panel.
  const text = "whitespace-pre-line [overflow-wrap:anywhere]";
  const action = "flex items-center gap-1 font-medium underline-offset-2 hover:underline";
  switch (message.kind) {
    case "user":
      return <p className={clsx(text, "max-w-[85%] self-end rounded-2xl rounded-br-md bg-panel-accent px-4 py-2 text-panel-accent-fg")}>{message.text}</p>;
    case "assistant":
      return (
        <div className="flex max-w-[95%] gap-3">
          <AssistantAvatar />
          <p className={clsx(text, "min-w-0 leading-7")}>{message.text}</p>
        </div>
      );
    case "marker": {
      const set = resultSets[message.resultSet];
      const count = `${set.products.length} ${set.products.length === 1 ? "product" : "products"}`;
      const isSelected = selected === message.resultSet;
      return (
        <button
          type="button"
          onClick={() => onSelect(message.resultSet)}
          aria-pressed={isSelected}
          aria-label={`Show ${count}: ${set.headline}`}
          className={clsx(
            INDENTED,
            "flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-150 ease-out",
            isSelected ? "border-panel-accent text-panel-fg" : "border-panel-line text-panel-muted hover:text-panel-fg",
          )}
        >
          <LayoutGrid aria-hidden className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{set.headline}</span>
            <span className="text-xs">{count}</span>
          </span>
        </button>
      );
    }
    case "error": {
      const { retryText, action: offer } = message;
      return (
        <div role="alert" className={clsx(INDENTED, "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger")}>
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
      <span className="flex gap-1.5 rounded-2xl rounded-bl-md bg-panel-raised px-3.5 py-3">
        {TYPING_DOT_DELAYS_MS.map((delay) => (
          <span key={delay} className="size-1.5 animate-typing rounded-full bg-panel-muted" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    </div>
  );
}
