import type { ReactNode } from "react";

import type { Card } from "../api";
import ProductCard from "./ProductCard";

/** Columns follow the panel's own width (container query), not the viewport: 1 to 6 cards of at least 208 px. */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-3 @min-[640px]:gap-4">{children}</div>
    </div>
  );
}

export default function ProductGrid({ cards, onOpen }: { cards: Card[]; onOpen: (id: string) => void }) {
  return (
    <CardGrid>
      {cards.map((card) => (
        <ProductCard key={card.id} card={card} onOpen={onOpen} />
      ))}
    </CardGrid>
  );
}
