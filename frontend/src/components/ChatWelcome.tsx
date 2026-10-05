import { ArrowRight, Laptop, Shirt, Sparkles, SportShoe, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

// The example prompts (docs/06-frontend.md, Loading, empty and error states). Colors are Tailwind's 500 shades.
const PROMPTS: { Icon: LucideIcon; color: string; title: string; subtitle: string; message: string }[] = [
  {
    Icon: Shirt,
    color: "var(--color-indigo-500)",
    title: "Warm jacket for a Ladakh trek",
    subtitle: "Under ₹8,000, size L",
    message: "Warm jacket for a Ladakh trek under ₹8,000, size L",
  },
  {
    Icon: Laptop,
    color: "var(--color-sky-500)",
    title: "Gaming laptop",
    subtitle: "16 GB RAM, dedicated graphics",
    message: "Gaming laptop with 16 GB RAM and dedicated graphics",
  },
  {
    Icon: SportShoe,
    color: "var(--color-emerald-500)",
    title: "Waterproof trekking shoes",
    subtitle: "Size UK 9",
    message: "Waterproof trekking shoes in UK 9",
  },
  {
    Icon: Sparkles,
    color: "var(--color-pink-500)",
    title: "Shaadi ke liye silk kurta",
    subtitle: "5k tak",
    message: "Shaadi ke liye silk kurta, 5k tak",
  },
];

/** The assistant's avatar, shared by the greeting and the typing indicator. */
export function AssistantAvatar() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
      <Sparkles aria-hidden className="size-4" />
    </span>
  );
}

/** The greeting and example prompt cards shown before the first message. An empty state, never part of the transcript. */
export default function ChatWelcome({ onSend, canSend }: { onSend: (text: string) => void; canSend: boolean }) {
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex gap-3">
        <AssistantAvatar />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="leading-relaxed">
            Hi! I'm your shopping assistant. Tell me what you need and your budget, and I'll find the best matches.
          </p>
          <p className="mt-1 text-sm text-fg-muted">English or Hinglish both work. Try one of these:</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2" aria-label="Example requests">
        {PROMPTS.map(({ Icon, color, title, subtitle, message }) => (
          <li key={title}>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => onSend(message)}
              className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 text-left transition-colors duration-150 ease-out enabled:hover:border-accent enabled:hover:bg-accent-soft disabled:opacity-60"
            >
              <span
                style={{ "--prompt": color } as CSSProperties}
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--prompt)_18%,transparent)] text-(--prompt)"
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-fg-muted">{subtitle}</span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0 text-fg-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
