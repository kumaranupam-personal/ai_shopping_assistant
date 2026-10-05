import { Plus, ShoppingBag } from "lucide-react";
import type { RefObject } from "react";

import { useCart } from "../cart";
import ThemeSwitch from "./ThemeSwitch";

type Props = { onNewChat: () => void; onOpenCart: () => void; cartButton: RefObject<HTMLButtonElement | null> };

/** The wordmark, theme switch, cart button and "New chat" (docs/06-frontend.md, App shell and Cart). */
export default function Header({ onNewChat, onOpenCart, cartButton }: Props) {
  const count = useCart().length;
  return (
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-line bg-surface-muted px-4">
      <span className="truncate font-serif text-2xl leading-none text-fg">Saathi</span>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeSwitch />
        <button
          ref={cartButton}
          type="button"
          onClick={onOpenCart}
          aria-label={count === 0 ? "Cart" : `Cart, ${count} ${count === 1 ? "item" : "items"}`}
          className="relative grid size-8 place-items-center rounded-lg border border-line bg-surface transition-colors duration-150 ease-out hover:border-line-strong"
        >
          <ShoppingBag aria-hidden className="size-4" />
          {count > 0 && (
            <span aria-hidden className="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs leading-none font-semibold text-accent-fg tabular-nums">
              {count}
            </span>
          )}
        </button>
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
