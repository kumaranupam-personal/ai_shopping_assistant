import clsx from "clsx";
import { useEffect, useId, useState, type ReactNode } from "react";

import { ApiError, getProduct, type Product } from "../api";
import { cart, sameItem, useCart } from "../cart";
import { CloseButton, Drawer } from "./Modal";
import { OutOfStock, Price, Rating } from "./ProductCard";
import ProductImage, { ColorDot } from "./ProductImage";

type Load = { status: "loading" } | { status: "loaded"; product: Product } | { status: "failed"; message: string };

/** The size and color a drawer starts with: those of the cart row that opened it. */
export type Choice = { size: string | null; color: string };

type Props = {
  productId: string;
  initial?: Choice;
  onClose: () => void;
  onViewCart: () => void;
  fallbackFocus: () => HTMLElement | null;
};

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Product details with the size and color choices and the action bar (docs/06-frontend.md, ProductDrawer and Cart). */
export default function ProductDrawer({ productId, initial, onClose, onViewCart, fallbackFocus }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [size, setSize] = useState(initial?.size ?? null);
  const [color, setColor] = useState(initial?.color ?? null);

  useEffect(() => {
    let current = true;
    getProduct(productId)
      .then((product) => current && setLoad({ status: "loaded", product }))
      .catch((error) => {
        const missing = error instanceof ApiError && error.code === "product_not_found";
        if (current) setLoad({ status: "failed", message: missing ? "This product is no longer available." : "Couldn't load this product. Try again." });
      });
    return () => {
      current = false;
    };
  }, [productId]);

  const product = load.status === "loaded" ? load.product : null;
  // No size is chosen at first and the first color is; a choice the product no longer offers falls back to these.
  const chosenSize = product && size !== null && (product.sizes ?? []).includes(size) ? size : null;
  const chosenColor = product && color !== null && (product.colors ?? []).includes(color) ? color : (product?.colors?.[0] ?? "");

  return (
    <Drawer label="Product details" onClose={onClose} fallbackFocus={fallbackFocus}>
      <div className="flex justify-end px-2 pt-2">
        <CloseButton onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {/* Shaped like the banner, which is what most products show (docs/06-frontend.md, Images). */}
        {load.status === "loading" && <div aria-label="Loading" className="aspect-[2/1] animate-pulse rounded-xl bg-tile" />}
        {load.status === "failed" && <p className="py-8 text-center text-fg-muted">{load.message}</p>}
        {product && <Details product={product} size={chosenSize} color={chosenColor} onSize={setSize} onColor={setColor} />}
      </div>
      {product && <ActionBar product={product} item={{ id: product.id, size: chosenSize, color: chosenColor }} onViewCart={onViewCart} />}
    </Drawer>
  );
}

type DetailsProps = { product: Product; size: string | null; color: string; onSize: (size: string) => void; onColor: (color: string) => void };

function Details({ product, size, color, onSize, onColor }: DetailsProps) {
  const { card } = product;
  return (
    <div className="group/details flex flex-col gap-5">
      <ProductImage card={card} variant="banner" className="rounded-xl" />
      <div className="flex flex-col gap-1.5">
        {/* Under an image only; the banner carries the brand as its label. */}
        <span data-brand-line className="text-sm text-fg-muted group-has-[[data-tile]]/details:hidden">
          {product.brand}
        </span>
        <h2 className="font-serif font-medium text-2xl leading-8">{product.title}</h2>
        <Price card={card} large />
        <Rating card={card} />
        {!card.in_stock && <OutOfStock className="self-start" />}
      </div>
      {(product.sizes ?? []).length > 0 && (
        <Choices label="Size" heading="Size" options={product.sizes} value={size} onChange={onSize}>
          {(option) => (
            <span className="grid h-9 min-w-11 place-items-center rounded-lg border border-line-strong bg-surface px-3 text-sm transition-colors duration-150 ease-out group-has-checked:border-accent group-has-checked:bg-accent group-has-checked:text-accent-fg">
              {option}
            </span>
          )}
        </Choices>
      )}
      <Choices label="Color" heading={`Color: ${capitalize(color)}`} options={product.colors ?? []} value={color} onChange={onColor} named round>
        {/* The selected dot gets a 2 px accent ring, 2 px away from it. */}
        {(option) => <ColorDot color={option} className="block size-6 ring-offset-2 ring-offset-surface group-has-checked:ring-2 group-has-checked:ring-accent" />}
      </Choices>
      <p className="leading-relaxed">{product.description}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {(product.details ?? []).map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted capitalize">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type ChoicesProps = {
  label: string;
  heading: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  named?: boolean; // the option has no visible text, so it is its own accessible name (a color dot)
  round?: boolean;
  children: (option: string) => ReactNode;
};

/**
 * A labelled group of native radios, so Tab enters it once and the arrow keys move the choice within it. Each radio is
 * transparent and covers its chip, so a click anywhere on the chip lands on the radio itself.
 */
function Choices({ label, heading, options, value, onChange, named, round, children }: ChoicesProps) {
  const name = useId();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{heading}</h3>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option}
            className={clsx(
              "group relative cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent",
              round ? "grid size-8 place-items-center rounded-full" : "rounded-lg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={option === value}
              onChange={() => onChange(option)}
              aria-label={named ? capitalize(option) : undefined}
              className="absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-[inherit] opacity-0"
            />
            {children(option)}
          </label>
        ))}
      </div>
    </div>
  );
}

/** One full-width button pinned under the scrolling content, in the first state that applies (docs/06-frontend.md, Action bar). */
function ActionBar({ product, item, onViewCart }: { product: Product; item: { id: string; size: string | null; color: string }; onViewCart: () => void }) {
  const items = useCart();
  const idle = "bg-tile text-fg-muted";
  const [label, style, onClick]: [string, string, (() => void)?] = !product.card.in_stock
    ? ["Out of stock", idle]
    : (product.sizes ?? []).length > 0 && item.size === null
      ? ["Select a size", idle]
      : items.some((other) => sameItem(other, item))
        ? ["Added · View cart", "bg-accent-soft text-accent-soft-fg", onViewCart]
        : ["Add to cart", "bg-accent text-accent-fg hover:opacity-90", () => cart.add(item)];
  return (
    <div className="border-t border-line bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClick}
        aria-disabled={onClick ? undefined : true}
        className={clsx("h-11 w-full rounded-lg text-sm font-semibold transition-[background-color,color,opacity] duration-150 ease-out", style, !onClick && "cursor-not-allowed")}
      >
        {label}
      </button>
    </div>
  );
}
