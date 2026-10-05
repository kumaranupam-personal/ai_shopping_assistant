import clsx from "clsx";
import { Backpack, CookingPot, Laptop, type LucideIcon, Package, Shirt, Smartphone, SportShoe, Watch } from "lucide-react";
import { useState } from "react";

import type { Card } from "../api";

/** Each category's icon (docs/06-frontend.md, Product tiles), also used by the landing's category chips. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  jackets: Shirt, // lucide has no jacket icon
  shoes: SportShoe,
  phones: Smartphone,
  laptops: Laptop,
  backpacks: Backpack,
  watches: Watch,
  kurtas: Shirt,
  kitchen_appliances: CookingPot,
};

type Props = { card: Card; compact?: boolean; className?: string };

/** A round swatch of a catalog colour (a CSS colour name), on tiles and in the drawer. The border keeps pale ones visible. */
export function ColorDot({ color, className }: { color: string; className: string }) {
  return <span aria-hidden className={clsx("rounded-full border border-line-strong", className)} style={{ backgroundColor: color }} />;
}

/** The product's image, loaded lazily behind a skeleton, or its tile when it has none or it fails. */
export default function ProductImage({ card, compact, className }: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(card.image_url ? "loading" : "failed");
  return (
    <div className={clsx("relative aspect-square overflow-hidden bg-tile", className)}>
      {state === "failed" || !card.image_url ? (
        <ProductTile card={card} compact={compact} />
      ) : (
        <>
          {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-tile" />}
          <img
            src={card.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setState("loaded")}
            onError={() => setState("failed")}
            className={clsx("size-full object-cover transition-opacity duration-200 ease-out", state === "loaded" ? "opacity-100" : "opacity-0")}
          />
        </>
      )}
    </div>
  );
}

/** A flat tile with the category's icon, and a dot for each of the product's colours in order (the strip's shows the icon only). */
function ProductTile({ card, compact }: { card: Card; compact?: boolean }) {
  const Icon = CATEGORY_ICONS[card.category] ?? Package;
  return (
    <div aria-hidden data-tile className="absolute inset-0 grid place-items-center bg-tile text-fg-muted">
      <Icon strokeWidth={compact ? 1.75 : 1.25} className={compact ? "size-8" : "size-1/3"} />
      {!compact && (
        <span className="absolute top-2.5 right-2.5 flex gap-1">
          {card.colors.map((c) => (
            <ColorDot key={c} color={c} className="size-2.5" />
          ))}
        </span>
      )}
    </div>
  );
}
