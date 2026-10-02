import clsx from "clsx";
import { ArrowDown, LayoutGrid, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ResultSet } from "../api";
import type { Message } from "../useChat";

const NEAR_BOTTOM_PX = 48;
const isAtBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

type Props = {
  messages: Message[];
  resultSets: ResultSet[];
  selectedResultSet: number | null;
  onSelectResultSet: (index: number) => void;
  onRetry: (text: string) => void;
};

export default function MessageList({ messages, resultSets, selectedResultSet, onSelectResultSet, onRetry }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Follow new messages unless the user has scrolled up to read; then offer "Jump to latest".
  useEffect(() => {
    const el = list.current!;
    if (atBottom) el.scrollTo({ top: el.scrollHeight });
    else setAtBottom(isAtBottom(el)); // the list can shrink without a scroll event, as after New chat
  }, [messages, atBottom]);

  const onScroll = () => setAtBottom(isAtBottom(list.current!));

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={list} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4">
        <ol className="flex flex-col gap-3">
          {messages.map((message, i) => (
            <li key={i} className="flex min-w-0 animate-enter flex-col">
              <MessageRow message={message} resultSets={resultSets} selected={selectedResultSet} onSelect={onSelectResultSet} onRetry={onRetry} />
            </li>
          ))}
        </ol>
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" })}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-sm"
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
};

function MessageRow({ message, resultSets, selected, onSelect, onRetry }: RowProps) {
  // Long unbroken text (pasted URLs) wraps instead of widening the panel.
  const text = "whitespace-pre-line [overflow-wrap:anywhere]";
  switch (message.kind) {
    case "user":
      return <p className={clsx(text, "max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-accent-soft-fg")}>{message.text}</p>;
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
            "flex max-w-full min-w-0 items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-left text-sm transition-colors duration-150 ease-out",
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
    case "error":
      return (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <span className={text}>{message.text}</span>
          <button type="button" onClick={() => onRetry(message.retryText)} className="flex items-center gap-1 font-medium underline-offset-2 hover:underline">
            <RotateCcw aria-hidden className="size-3.5" /> Retry
          </button>
        </div>
      );
  }
}
