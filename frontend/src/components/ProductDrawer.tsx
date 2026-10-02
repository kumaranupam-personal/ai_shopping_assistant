import { useEffect, useState, type ReactNode } from "react";

import { ApiError, getProduct, type Product } from "../api";
import Modal, { CloseButton } from "./Modal";
import { OutOfStock, Price, Rating } from "./ProductCard";
import ProductImage from "./ProductImage";

type Load = { status: "loading" } | { status: "loaded"; product: Product } | { status: "failed"; message: string };

/** Product details: a right-hand drawer from 640 px, a bottom sheet below that. */
export default function ProductDrawer({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

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

  return (
    <Modal label="Product details" onClose={onClose} className="fixed inset-0 size-full bg-transparent">
      <div className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] animate-drawer-up flex-col rounded-t-2xl bg-surface sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(480px,100vw)] sm:animate-drawer-left sm:rounded-none">
        <div className="flex justify-end px-2 pt-2">
          <CloseButton onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {load.status === "loading" && <div aria-label="Loading" className="aspect-square animate-pulse rounded-xl bg-line" />}
          {load.status === "failed" && <p className="py-8 text-center text-fg-muted">{load.message}</p>}
          {load.status === "loaded" && <Details product={load.product} />}
        </div>
      </div>
    </Modal>
  );
}

function Details({ product }: { product: Product }) {
  const { card } = product;
  return (
    <div className="flex flex-col gap-4">
      <ProductImage src={card.image_url} className="rounded-xl" />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-fg-muted">{product.brand}</span>
        <h2 className="text-lg font-semibold">{product.title}</h2>
        <Price card={card} large />
        <Rating card={card} />
        {!card.in_stock && <OutOfStock className="self-start" />}
      </div>
      <p className="leading-relaxed">{product.description}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {product.details.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted capitalize">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {product.sizes.length > 0 && (
        <Section title="Sizes">
          {product.sizes.map((size) => (
            <span key={size} className="rounded-lg border border-line px-2.5 py-1 text-sm">
              {size}
            </span>
          ))}
        </Section>
      )}
      <Section title="Colors">
        {product.colors.map((color) => (
          <span key={color} className="flex items-center gap-1.5 text-sm capitalize">
            <span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ backgroundColor: color }} />
            {color}
          </span>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
