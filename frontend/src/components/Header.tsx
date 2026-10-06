import { ArrowUpRight, Info, Plus, ShoppingBag } from "lucide-react";
import type { RefObject } from "react";

import { useCart } from "../cart";
import ThemeSwitch from "./ThemeSwitch";

type Props = { onNewChat: () => void; onOpenCart: () => void; cartButton: RefObject<HTMLButtonElement | null> };

/** The wordmark, about link, theme switch, cart button and "New chat" (docs/06-frontend.md, App shell and Cart). */
export default function Header({ onNewChat, onOpenCart, cartButton }: Props) {
  const count = useCart().length;
  return (
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-line bg-surface-muted px-4">
      <span className="truncate font-serif font-medium text-2xl leading-none text-fg">Saathi</span>
      <div className="flex shrink-0 items-center gap-2">
        {/* A text link from 640 px, an icon button below that, and nothing below 360 px, where the header has no room. */}
        <a
          href={`${import.meta.env.BASE_URL}about/`}
          target="_blank"
          rel="noopener"
          className="grid size-8 place-items-center rounded-lg border border-line bg-surface transition-colors duration-150 ease-out hover:border-line-strong max-[359px]:hidden sm:mr-2 sm:flex sm:size-auto sm:gap-1 sm:border-0 sm:bg-transparent sm:text-sm sm:font-medium sm:text-fg-muted sm:hover:text-fg"
        >
          <Info aria-hidden className="size-4 sm:hidden" />
          <span className="max-sm:sr-only">How Saathi works</span>
          <ArrowUpRight aria-hidden className="size-4 max-sm:hidden" />
        </a>
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
