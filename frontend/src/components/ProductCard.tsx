import clsx from "clsx";
import { Check, Star } from "lucide-react";
import type { CSSProperties } from "react";

import type { Card } from "../api";
import { formatCount, formatRupees, highlightPill } from "../format";
import ProductImage from "./ProductImage";

/** A card's accessible name: title and price, then when it's out of stock or in the cart (docs/06-frontend.md, Accessibility). */
export function cardLabel(card: Card, inCart = false) {
  return `${card.title}, ${formatRupees(card.price)}${card.in_stock ? "" : ", out of stock"}${inCart ? ", in cart" : ""}`;
}

/**
 * The price row (docs/06-frontend.md, Cards and ProductDrawer): the price and, when discounted, the crossed-out MRP.
 * The drawer's `large` row also carries the "{n}% off" pill; cards show the discount as a badge on the image instead.
 */
export function Price({ card, large }: { card: Card; large?: boolean }) {
  const discounted = card.discount_pct > 0;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
      <span className={large ? "text-2xl font-semibold" : "text-lg font-bold"}>{formatRupees(card.price)}</span>
      {discounted && <s className="text-xs text-fg-muted">{formatRupees(card.mrp)}</s>}
      {discounted && large && (
        <span className="self-center rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">{card.discount_pct}% off</span>
      )}
    </span>
  );
}

export function Rating({ card }: { card: Card }) {
  return (
    <span className="flex items-center gap-1 text-xs text-fg-muted">
      <Star aria-hidden className="size-3.5 fill-current text-star" />
      <span className="font-semibold text-fg">{card.rating.toFixed(1)}</span> ({formatCount(card.review_count)})
    </span>
  );
}

export function OutOfStock({ className }: { className?: string }) {
  return <span className={clsx("rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger", className)}>Out of stock</span>;
}

type Props = { card: Card; inCart: boolean; onOpen: (id: string) => void; className?: string; style?: CSSProperties };

export default function ProductCard({ card, inCart, onOpen, className, style }: Props) {
  const pills = card.highlights.map(highlightPill).filter((pill) => pill !== null);
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      aria-label={cardLabel(card, inCart)}
      style={style}
      className={clsx(
        // Hover: rise 2 px with a soft shadow and a stronger border; the rise stays off under reduced motion.
        "relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-[translate,border-color,box-shadow] duration-200 ease-out hover:border-line-strong hover:shadow-card motion-safe:hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="relative">
        <ProductImage card={card} />
        {/* The in-cart mark (docs/06-frontend.md, Cart), 8 px in from the image's bottom-right corner. */}
        {inCart && (
          <span aria-hidden data-in-cart className="absolute right-2 bottom-2 grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
            <Check strokeWidth={3} className="size-3" />
          </span>
        )}
      </div>
      {card.discount_pct > 0 && (
        <span className="absolute top-2 left-2 rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-fg tabular-nums">
          {card.discount_pct}% off
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="truncate text-xs text-fg-muted">{card.brand}</span>
        <span className="line-clamp-2 text-sm font-medium">{card.title}</span>
        <span className="mt-1">
          <Price card={card} />
        </span>
        <Rating card={card} />
        {pills.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {pills.map((pill) => (
              <span key={pill} className="rounded-full bg-tile px-2 py-0.5 text-xs text-fg-muted">
                {pill}
              </span>
            ))}
          </span>
        )}
      </div>
      {!card.in_stock && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-surface/60">
          <OutOfStock />
        </span>
      )}
    </button>
  );
}
