import clsx from "clsx";
import { Backpack, CookingPot, Laptop, type LucideIcon, Package, Shirt, Smartphone, SportShoe, Watch } from "lucide-react";
import { useState, type CSSProperties } from "react";

import type { Card } from "../api";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  jackets: Shirt, // lucide has no jacket icon
  kurtas: Shirt,
  shoes: SportShoe,
  phones: Smartphone,
  laptops: Laptop,
  backpacks: Backpack,
  watches: Watch,
  kitchen_appliances: CookingPot,
};
const PALE_COLORS = new Set(["white", "beige", "silver", "gold", "yellow"]); // they get a hairline so the tile stays visible
const NEUTRAL_COLORS = new Set(["black", "white", "grey", "silver", "beige"]);

// The tile shows the first color that isn't neutral, so most tiles get a lively wash (docs/06-frontend.md, Product tiles).
export const tileColor = (colors: string[]) => colors.find((c) => !NEUTRAL_COLORS.has(c)) ?? colors[0] ?? "grey";

type Props = { card: Card; compact?: boolean; className?: string };

/** A round swatch of a catalog colour (a CSS colour name), on tiles and in the drawer. */
export function ColorDot({ color, className }: { color: string; className: string }) {
  return <span aria-hidden className={clsx("rounded-full border border-line-strong", className)} style={{ backgroundColor: color }} />;
}

/** The product's image, loaded lazily behind a skeleton, or its colour-tinted tile when it has none or it fails. */
export default function ProductImage({ card, compact, className }: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(card.image_url ? "loading" : "failed");
  return (
    <div className={clsx("relative aspect-square overflow-hidden bg-surface-muted", className)}>
      {state === "failed" || !card.image_url ? (
        <ProductTile card={card} compact={compact} />
      ) : (
        <>
          {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-line" />}
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

function ProductTile({ card, compact }: { card: Card; compact?: boolean }) {
  const color = tileColor(card.colors);
  const Icon = CATEGORY_ICONS[card.category] ?? Package;
  const label = color[0].toUpperCase() + color.slice(1) + (card.colors.length > 1 ? ` · ${card.colors.length} colours` : "");
  return (
    <div
      aria-hidden
      data-tile={color}
      style={{ "--swatch": color } as CSSProperties}
      className={clsx(
        "product-tile absolute inset-0 flex flex-col items-center justify-center gap-2",
        PALE_COLORS.has(color) && "ring-1 ring-line-strong ring-inset",
      )}
    >
      <Icon className={compact ? "size-8" : "size-1/3"} />
      {!compact && (
        <>
          <span className="text-xs font-medium">{label}</span>
          <span className="absolute top-2 right-2 flex gap-1">
            {card.colors.map((c) => (
              <ColorDot key={c} color={c} className="size-2.5" />
            ))}
          </span>
        </>
      )}
    </div>
  );
}
