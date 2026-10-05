import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ApiError, getProduct, type Product } from "../api";
import { cart, useCart, type CartItem } from "../cart";
import { formatRupees } from "../format";
import { CloseButton, Drawer } from "./Modal";
import { OutOfStock } from "./ProductCard";
import { capitalize } from "./ProductDrawer";
import ProductImage from "./ProductImage";

type Load = { status: "loading" } | { status: "loaded"; product: Product } | { status: "failed" };
type Undo = { item: CartItem; index: number; title: string | null };

const UNDO_MS = 5000;
const itemKey = ({ id, size, color }: CartItem) => `${id}|${size ?? ""}|${color}`;

type Props = {
  onClose: () => void;
  onOpenItem: (item: CartItem) => void;
  fallbackFocus: () => HTMLElement | null;
};

/** The cart panel (docs/06-frontend.md, Cart): a title row, the item rows with Undo, and the subtotal and Checkout. */
export default function CartPanel({ onClose, onOpenItem, fallbackFocus }: Props) {
  const items = useCart();
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [undo, setUndo] = useState<Undo | null>(null);
  const requested = useRef(new Set<string>());
  // Keyboard focus follows a removal: to Undo, then to the restored row, or to the title when Undo times out.
  const title = useRef<HTMLHeadingElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const [restored, setRestored] = useState<string | null>(null);

  // Fetch each product once while the panel is open, so rows show current data; a deleted product leaves the cart.
  useEffect(() => {
    for (const id of new Set(items.map((item) => item.id))) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      setLoads((all) => ({ ...all, [id]: { status: "loading" } }));
      getProduct(id).then(
        (product) => setLoads((all) => ({ ...all, [id]: { status: "loaded", product } })),
        (error) => {
          if (error instanceof ApiError && error.code === "product_not_found") cart.removeProduct(id);
          else setLoads((all) => ({ ...all, [id]: { status: "failed" } }));
        },
      );
    }
  }, [items]);

  // The undo row lasts 5 seconds; a newer removal replaces it, and closing the panel ends it.
  useEffect(() => {
    if (!undo) return;
    undoButton.current?.focus(); // the removed row took the focused button with it
    const timer = setTimeout(() => {
      if (document.activeElement === undoButton.current) title.current?.focus();
      setUndo(null);
    }, UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (restored === null) return;
    title.current?.closest("dialog")?.querySelector<HTMLElement>(`[data-item="${CSS.escape(restored)}"] button`)?.focus();
    setRestored(null);
  }, [restored]);

  const remove = (item: CartItem, title: string | null) => {
    const index = cart.remove(item);
    if (index >= 0) setUndo({ item, index, title });
  };

  const product = (item: CartItem) => {
    const load = loads[item.id];
    return load?.status === "loaded" ? load.product : null;
  };
  const subtotal = items.reduce((sum, item) => {
    const card = product(item)?.card;
    return card?.in_stock ? sum + card.price : sum;
  }, 0);
  const descriptionId = useId();

  return (
    <Drawer label="Cart" onClose={onClose} fallbackFocus={fallbackFocus}>
      <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-5">
        <h2 ref={title} tabIndex={-1} className="font-serif text-2xl leading-8 outline-none">
          Your cart
        </h2>
        <CloseButton onClick={onClose} />
      </div>
      <div role="status" className="empty:hidden">
        {undo && (
          <p className="mx-5 mb-2 flex items-center justify-between gap-3 rounded-lg bg-accent-soft py-1.5 pr-1.5 pl-3 text-sm text-accent-soft-fg">
            <span className="min-w-0 [overflow-wrap:anywhere]">Removed {undo.title ?? "item"}.</span>
            <button
              ref={undoButton}
              type="button"
              onClick={() => {
                cart.restore(undo.item, undo.index);
                setRestored(itemKey(undo.item));
                setUndo(null);
              }}
              className="shrink-0 rounded-md px-2.5 py-1 font-semibold underline-offset-2 hover:underline"
            >
              Undo
            </button>
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-5 pt-10 pb-12 text-center">
          <p className="text-fg-muted">Your cart is empty.</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out hover:border-line-strong"
          >
            Keep shopping
          </button>
        </div>
      ) : (
        <>
          <ul aria-label="Items" className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line px-5">
            {items.map((item) => (
              <li key={itemKey(item)} data-item={itemKey(item)} className="flex items-center gap-2 py-3">
                <Row item={item} load={loads[item.id]} onOpen={() => onOpenItem(item)} onRemove={remove} />
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-fg-muted">Subtotal</span>
              <span className="font-semibold tabular-nums">{formatRupees(subtotal)}</span>
            </div>
            <button type="button" aria-disabled aria-describedby={descriptionId} className="h-11 w-full cursor-not-allowed rounded-lg bg-accent text-sm font-semibold text-accent-fg">
              Checkout
            </button>
            <p id={descriptionId} className="text-center text-xs text-fg-muted">
              Demo store. Checkout isn't available.
            </p>
          </div>
        </>
      )}
    </Drawer>
  );
}

type RowProps = { item: CartItem; load: Load | undefined; onOpen: () => void; onRemove: (item: CartItem, title: string | null) => void };

/** One item: image or tile, title, size and color, and price as one button, with its remove button beside it. */
function Row({ item, load, onOpen, onRemove }: RowProps) {
  if (!load || load.status === "loading") {
    return (
      <div aria-hidden className="flex flex-1 animate-pulse items-center gap-3">
        <div className="size-16 shrink-0 rounded-lg bg-tile" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3 w-4/5 rounded bg-tile" />
          <div className="h-3 w-1/3 rounded bg-tile" />
        </div>
      </div>
    );
  }
  if (load.status === "failed") {
    return (
      <>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div aria-hidden className="size-16 shrink-0 rounded-lg bg-tile" />
          <p className="text-sm text-fg-muted">Couldn't load this item.</p>
        </div>
        <RemoveButton label="Remove item" onClick={() => onRemove(item, null)} />
      </>
    );
  }
  const { card, title } = load.product;
  const choice = [item.size, capitalize(item.color)].filter(Boolean).join(" · ");
  const name = [title, item.size, capitalize(item.color), formatRupees(card.price)].filter(Boolean).join(", ");
  return (
    <>
      <button type="button" onClick={onOpen} aria-label={name} className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left">
        <ProductImage card={card} compact className="size-16 shrink-0 rounded-lg" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm font-medium group-hover:underline group-hover:underline-offset-2">{title}</span>
          <span className="text-xs text-fg-muted">{choice}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold tabular-nums">{formatRupees(card.price)}</span>
            {!card.in_stock && <OutOfStock className="px-2 py-0.5" />}
          </span>
        </span>
      </button>
      <RemoveButton label={`Remove ${title}`} onClick={() => onRemove(item, title)} />
    </>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors duration-150 ease-out hover:bg-tile hover:text-fg"
    >
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}
