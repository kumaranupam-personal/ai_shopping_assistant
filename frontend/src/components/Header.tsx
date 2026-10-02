import { Plus, ShoppingBag } from "lucide-react";

import ThemeSwitch from "./ThemeSwitch";

export default function Header({ onNewChat }: { onNewChat: () => void }) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-2">
        <ShoppingBag aria-hidden className="size-5 shrink-0 text-accent" />
        <span className="truncate font-semibold">AI Shopping Assistant</span>
      </div>
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
