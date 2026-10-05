import clsx from "clsx";
import { ArrowUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

const MAX_HEIGHT_PX = 6 * 24 + 16; // 6 lines of 24 px plus the textarea's 8 px top and bottom padding

type Props = {
  variant: "chat" | "landing"; // docs/06-frontend.md, Composer: the chat panel's style or the landing's
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (text: string) => void;
  canSend: boolean; // false while a turn runs or before a session exists; typing still works
  autoFocus?: boolean;
};

const STYLES = {
  chat: {
    box: "rounded-xl border-panel-line bg-panel-raised p-1 pl-3 text-panel-fg focus-within:border-panel-accent focus-within:ring-4 focus-within:ring-panel-accent/25",
    input: "placeholder:text-panel-muted",
    ready: "bg-panel-accent text-panel-accent-fg",
    idle: "text-panel-muted",
  },
  landing: {
    box: "rounded-2xl border-line-strong bg-surface p-2 pl-4 text-base shadow-composer focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft",
    input: "placeholder:text-fg-muted",
    ready: "bg-accent text-accent-fg",
    idle: "bg-tile text-fg-muted",
  },
};

export default function Composer({ variant, draft, onDraftChange, onSend, canSend, autoFocus }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const text = draft.trim();
  const style = STYLES[variant];

  // Grow with the text from 1 to 6 lines, then scroll. An empty box is never measured: browsers count the placeholder
  // in scrollHeight, so a box measured while narrow (or before layout) would lock at 6 lines with nothing in it.
  useLayoutEffect(() => {
    const el = input.current!;
    el.style.height = "";
    if (draft) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  useEffect(() => {
    if (autoFocus) input.current!.focus();
  }, [autoFocus]);

  // Only the composer's own text is cleared on send; chips, prompt cards and Retry leave a half-typed draft alone.
  const sendDraft = () => {
    if (!canSend || !text) return;
    onSend(text);
    onDraftChange("");
  };

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendDraft();
      }}
      className={clsx("flex items-end gap-2 border transition-[border-color,box-shadow] duration-150 ease-out", style.box)}
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
        className={clsx("min-w-0 flex-1 resize-none bg-transparent py-2 leading-6 outline-none focus-visible:outline-none", style.input)}
      />
      <button
        type="submit"
        aria-label="Send"
        aria-disabled={!canSend || !text}
        className={clsx(
          "grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-150 ease-out",
          canSend && text ? style.ready : style.idle,
        )}
      >
        <ArrowUp aria-hidden className="size-4" />
      </button>
    </form>
  );
  if (variant === "landing") return form;
  return <div className="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{form}</div>;
}
