import clsx from "clsx";
import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

const EXAMPLES = [
  "Warm jacket for a Ladakh trek under ₹8,000",
  "Gaming laptop with 16 GB RAM",
  "Waterproof trekking shoes in UK 9",
  "Shaadi ke liye silk kurta, 5k tak",
];
const MAX_HEIGHT_PX = 6 * 24 + 16; // 6 lines of 24 px plus vertical padding

type Props = {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (text: string) => void;
  canSend: boolean; // false while a turn runs or before a session exists; typing still works
  showExamples: boolean;
};

export default function Composer({ draft, onDraftChange, onSend, canSend, showExamples }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const text = draft.trim();

  // Grow with the text from 1 to 6 lines, then scroll.
  useLayoutEffect(() => {
    const el = input.current!;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  // Only the composer's own text is cleared on send; chips and Retry leave a half-typed draft alone.
  const sendDraft = () => {
    if (!canSend || !text) return;
    onSend(text);
    onDraftChange("");
  };

  return (
    <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showExamples && (
        <div className="mb-2 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={!canSend}
              onClick={() => onSend(example)}
              className="rounded-full border border-line px-3 py-1 text-sm text-fg-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-fg"
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendDraft();
        }}
        className="flex items-end gap-2 rounded-xl border border-line bg-surface py-1 pr-1 pl-3 focus-within:border-accent"
      >
        <textarea
          ref={input}
          rows={1}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendDraft();
            }
          }}
          placeholder="Describe what you're looking for"
          aria-label="Message"
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 leading-6 outline-none placeholder:text-fg-muted focus-visible:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          aria-disabled={!canSend || !text}
          className={clsx(
            "grid size-9 shrink-0 place-items-center rounded-lg transition-colors duration-150 ease-out",
            canSend && text ? "bg-accent text-accent-fg" : "bg-surface-muted text-fg-muted",
          )}
        >
          <ArrowUp aria-hidden className="size-4" />
        </button>
      </form>
    </div>
  );
}
