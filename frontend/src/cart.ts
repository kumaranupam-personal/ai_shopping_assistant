// The cart (docs/06-frontend.md, Cart): items kept only in this browser, shared by every component and open tab.
import { useSyncExternalStore } from "react";

/** One product in one size (null when it has none) and one color. Equal only when all three match. */
export type CartItem = { id: string; size: string | null; color: string };

const STORAGE_KEY = "saathi.cart";

export const sameItem = (a: CartItem, b: CartItem) => a.id === b.id && a.size === b.size && a.color === b.color;

const isItem = (value: unknown): value is CartItem => {
  const item = value as CartItem;
  return typeof item?.id === "string" && typeof item.color === "string" && (item.size === null || typeof item.size === "string");
};

/** The saved items; anything unreadable counts as an empty cart. */
function readCart(): CartItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) && value.every(isItem) ? value.map(({ id, size, color }) => ({ id, size, color })) : [];
  } catch {
    return []; // unparsable, or storage blocked
  }
}

let items = readCart();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function save(next: CartItem[]) {
  items = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the cart lasts for this page only
  }
  notify();
}

// Another tab changed the cart (the event never fires in the tab that wrote it).
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  items = readCart();
  notify();
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const cart = {
  has: (item: CartItem) => items.some((other) => sameItem(other, item)),
  /** Adds the item at the end, unless it's already there. */
  add: (item: CartItem) => {
    if (!cart.has(item)) save([...items, item]);
  },
  /** Removes the item and returns where it was, so Undo can put it back. */
  remove: (item: CartItem) => {
    const index = items.findIndex((other) => sameItem(other, item));
    if (index >= 0) save(items.filter((_, i) => i !== index));
    return index;
  },
  restore: (item: CartItem, index: number) => {
    if (!cart.has(item)) save([...items.slice(0, index), item, ...items.slice(index)]);
  },
  /** Drops every item of a product that no longer exists. */
  removeProduct: (id: string) => {
    if (items.some((item) => item.id === id)) save(items.filter((item) => item.id !== id));
  },
};

/** The cart's items, re-rendering on every change from this tab or another. */
export const useCart = () => useSyncExternalStore(subscribe, () => items);
