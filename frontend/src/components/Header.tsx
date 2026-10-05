import { Plus } from "lucide-react";

import ThemeSwitch from "./ThemeSwitch";

/** The wordmark, theme switch and "New chat" (docs/06-frontend.md, App shell). */
export default function Header({ onNewChat }: { onNewChat: () => void }) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-line bg-surface-muted px-4">
      <span className="truncate font-serif text-2xl leading-none text-fg">Saathi</span>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeSwitch />
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition-opacity duration-150 ease-out hover:opacity-90"
        >
          <Plus aria-hidden className="size-4" />
          <span className="max-[479px]:sr-only">New chat</span>
        </button>
      </div>
    </header>
  );
}
