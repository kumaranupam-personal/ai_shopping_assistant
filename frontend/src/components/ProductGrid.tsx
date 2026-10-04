import type { CSSProperties, ReactNode } from "react";

import type { Card } from "../api";
import ProductCard from "./ProductCard";

/** Columns follow the panel's own width (container query), not the viewport: 1 to 5 cards of at least 208 px. */
const STAGGER_MS = 60;
const LAST_START_MS = 480;

/**
 * Card entrance (docs/06-frontend.md, Motion): fade in and rise, each card 60 ms after the previous, none later than
 * 480 ms. Returns nothing when the set isn't new, so reselecting or restoring shows cards at once.
 */
export function entrance(animate: boolean | undefined, index: number): { className?: string; style?: CSSProperties } {
  if (!animate) return {};
  return { className: "animate-rise", style: { animationDelay: `${Math.min(index * STAGGER_MS, LAST_START_MS)}ms` } };
}

export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-3 @min-[640px]:gap-4">{children}</div>
    </div>
  );
}

type Props = { cards: Card[]; onOpen: (id: string) => void; animate?: boolean };

export default function ProductGrid({ cards, onOpen, animate }: Props) {
  return (
    <CardGrid>
      {cards.map((card, i) => (
        <ProductCard key={card.id} card={card} onOpen={onOpen} {...entrance(animate, i)} />
      ))}
    </CardGrid>
  );
}
