import clsx from "clsx";
import { Star } from "lucide-react";
import type { CSSProperties } from "react";

import type { Card } from "../api";
import { formatCount, formatRupees } from "../format";
import ProductImage from "./ProductImage";

export function cardLabel(card: Card) {
  return `${card.title}, ${formatRupees(card.price)}${card.in_stock ? "" : ", out of stock"}`;
}

/** Price, crossed-out MRP and the discount pill (only when discounted). */
export function Price({ card, large }: { card: Card; large?: boolean }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
      <span className={large ? "text-2xl font-semibold" : "text-lg font-bold"}>{formatRupees(card.price)}</span>
      {card.discount_pct > 0 && (
        <>
          <s className="text-xs text-fg-muted">{formatRupees(card.mrp)}</s>
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">{card.discount_pct}% off</span>
        </>
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

type Props = { card: Card; onOpen: (id: string) => void; className?: string; style?: CSSProperties };

export default function ProductCard({ card, onOpen, className, style }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      aria-label={cardLabel(card)}
      style={style}
      className={clsx(
        "relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong hover:shadow-md",
        className,
      )}
    >
      <ProductImage card={card} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="truncate text-xs text-fg-muted">{card.brand}</span>
        <span className="line-clamp-2 text-sm font-medium">{card.title}</span>
        <Price card={card} />
        <Rating card={card} />
        <span className="mt-1 flex flex-wrap gap-1">
          {card.highlights.slice(0, 3).map(({ label, value }) => (
            <span key={label} className="rounded-full bg-surface-muted px-2 py-1 text-xs text-fg-muted">
              {label}: {value}
            </span>
          ))}
        </span>
      </div>
      {!card.in_stock && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-surface/60">
          <OutOfStock />
        </span>
      )}
    </button>
  );
}
