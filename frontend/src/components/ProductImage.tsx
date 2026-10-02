import clsx from "clsx";
import { Package } from "lucide-react";
import { useState } from "react";

/** A lazily loaded square image with a skeleton while loading and an icon if it fails. */
export default function ProductImage({ src, className }: { src: string; className?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  return (
    <div className={clsx("relative aspect-square overflow-hidden bg-surface-muted", className)}>
      {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-line" />}
      {state === "failed" ? (
        <Package aria-hidden className="absolute inset-0 m-auto size-1/3 text-fg-muted" />
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={clsx("size-full object-cover transition-opacity duration-200 ease-out", state === "loaded" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}
