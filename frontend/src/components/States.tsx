import clsx from "clsx";
import { WifiOff, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { TURNSTILE_CONTAINER, TURNSTILE_SITE_KEY } from "../turnstile";
import { CardGrid } from "./ProductGrid";
import { STRIP, STRIP_CARD } from "./ResultsStrip";

/** 6 placeholder cards in the product grid, while a search or the featured list loads. */
export function SkeletonGrid() {
  return (
    <div aria-hidden className="animate-pulse">
      <CardGrid>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="aspect-square bg-tile" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-3 w-1/3 rounded bg-tile" />
              <div className="h-3 w-4/5 rounded bg-tile" />
              <div className="h-3 w-1/2 rounded bg-tile" />
            </div>
          </div>
        ))}
      </CardGrid>
    </div>
  );
}

/** 4 compact placeholder cards in the results strip. */
export function SkeletonStrip() {
  return (
    <div aria-hidden className={clsx(STRIP, "overflow-hidden")}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={clsx(STRIP_CARD, "animate-pulse")}>
          <div className="size-16 rounded-lg bg-tile" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-4/5 rounded bg-tile" />
            <div className="h-3 w-1/3 rounded bg-tile" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A placeholder for a results headline, the same height as the real one, so arriving results don't shift. */
export function SkeletonHeadline() {
  return <div aria-hidden className="h-8 w-56 max-w-full animate-pulse rounded bg-tile" />;
}

/** The wide results panel while a search runs: a headline bar the same height as the panel's, over the grid. */
export function SkeletonPanel() {
  return (
    <div aria-hidden>
      <div className="border-b border-line px-4 py-3">
        <SkeletonHeadline />
      </div>
      <div className="p-4">
        <SkeletonGrid />
      </div>
    </div>
  );
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Non-blocking banners under the header: offline (until the browser is back online) and dismissible notices. */
export function Banners({ notice, onDismiss }: { notice: string | null; onDismiss: () => void }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  return (
    <div role="status" className="min-w-0">
      {!online && (
        <p className="flex items-center gap-2 border-b border-line bg-danger-soft px-4 py-2 text-sm text-danger">
          <WifiOff aria-hidden className="size-4 shrink-0" /> You're offline. Reconnect to keep chatting.
        </p>
      )}
      {/* Turnstile's widget (docs/11-abuse-protection.md); empty unless Cloudflare asks the visitor to interact. */}
      {TURNSTILE_SITE_KEY && <div id={TURNSTILE_CONTAINER} className="flex justify-center empty:hidden" />}
      {notice && (
        <p className="flex items-center justify-between gap-3 border-b border-line bg-accent-soft px-4 py-2 text-sm text-accent-soft-fg">
          {notice}
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-lg">
            <X aria-hidden className="size-4" />
          </button>
        </p>
      )}
    </div>
  );
}
