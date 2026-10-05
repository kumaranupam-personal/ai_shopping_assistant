import clsx from "clsx";
import { Backpack, CookingPot, Laptop, type LucideIcon, Package, Smartphone, SportShoe, Watch } from "lucide-react";
import { useState, type CSSProperties } from "react";

import type { Card } from "../api";
import { swatch } from "../swatches";
import JacketIcon from "./JacketIcon";
import KurtaIcon from "./KurtaIcon";

/** Each category's icon (docs/06-frontend.md, Product tiles), also used by the landing's category chips. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  jackets: JacketIcon,
  shoes: SportShoe,
  phones: Smartphone,
  laptops: Laptop,
  backpacks: Backpack,
  watches: Watch,
  kurtas: KurtaIcon,
  kitchen_appliances: CookingPot,
};

/**
 * Where the picture sits (docs/06-frontend.md, Product tiles): `card` is the square on grid cards, `small` the 64 px
 * one in the strip and cart rows (icon only), and `banner` the drawer's, whose tile is 2:1 while an image stays square.
 */
export type ImageVariant = "card" | "small" | "banner";

type Props = { card: Card; variant?: ImageVariant; className?: string };

/** A round swatch of a catalog colour, on tiles and in the drawer. The border keeps pale ones visible. */
export function ColorDot({ color, className }: { color: string; className: string }) {
  return <span aria-hidden data-color={color} className={clsx("rounded-full border border-line-strong", className)} style={{ backgroundColor: swatch(color) }} />;
}

/**
 * The product's image, loaded lazily behind a skeleton, or its tile when it has none or it fails. This is the one place
 * that decides; a tile carries `data-tile`, which is how the card and the drawer hide their brand line beside it.
 */
export default function ProductImage({ card, variant = "card", className }: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(card.image_url ? "loading" : "failed");
  const tile = state === "failed" || !card.image_url;
  return (
    <div className={clsx("relative overflow-hidden bg-tile", tile && variant === "banner" ? "aspect-[2/1]" : "aspect-square", className)}>
      {tile ? (
        <ProductTile card={card} variant={variant} />
      ) : (
        <>
          {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-tile" />}
          <img
            src={card.image_url!}
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

// The icon is a third of the tile's width, or 40% of the banner's height; the stroke thins as it grows so lines read alike.
const ICON: Record<ImageVariant, [className: string, strokeWidth: number]> = {
  small: ["size-1/3", 1.75],
  card: ["size-1/3", 1.25],
  banner: ["h-2/5 w-1/5", 1],
};

/**
 * The tile: `tile` tinted with the first colour's swatch (the `.tile-tint` rule in index.css), the category's icon, and,
 * except on small tiles, a dot per colour in order (top right) and the brand label (bottom left, clear of the in-cart mark).
 */
function ProductTile({ card, variant }: { card: Card; variant: ImageVariant }) {
  const Icon = CATEGORY_ICONS[card.category] ?? Package;
  const [iconClass, strokeWidth] = ICON[variant];
  return (
    <div data-tile className="tile-tint absolute inset-0 grid place-items-center text-fg-muted" style={{ "--swatch": swatch(card.colors[0] ?? "") } as CSSProperties}>
      <Icon aria-hidden strokeWidth={strokeWidth} className={iconClass} />
      {variant !== "small" && (
        <>
          <span aria-hidden className="absolute top-2.5 right-2.5 flex gap-1">
            {card.colors.map((c) => (
              <ColorDot key={c} color={c} className="size-2.5" />
            ))}
          </span>
          {/* 16 px line box 10 px up: its middle lines up with the in-cart mark's, 18 px above the bottom edge. */}
          <span data-brand-label className="absolute right-10 bottom-2.5 left-2.5 truncate font-serif text-[13px] leading-4 font-medium text-fg">
            {card.brand}
          </span>
        </>
      )}
    </div>
  );
}
