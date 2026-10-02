import clsx from "clsx";
import { WifiOff, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { CardGrid } from "./ProductGrid";
import { STRIP, STRIP_CARD } from "./ResultsStrip";

export function EmptyState({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center gap-1 text-center", className)}>
      <h2 className="text-lg font-semibold">What are you shopping for?</h2>
      <p className="text-sm text-fg-muted">Describe what you need in your own words, in English or Hinglish.</p>
    </div>
  );
}

/** Placeholder cards while a search runs: the full grid on wide screens, compact strip cards on narrow ones. */
export function SkeletonCards({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div aria-hidden className={clsx(STRIP, "overflow-hidden")}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={clsx(STRIP_CARD, "animate-pulse")}>
            <div className="size-16 rounded-lg bg-line" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3 w-4/5 rounded bg-line" />
              <div className="h-3 w-1/3 rounded bg-line" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  // The headline bar matches the results panel's, so the real results arrive without shifting the grid.
  return (
    <div aria-hidden className="animate-pulse">
      <div className="border-b border-line px-4 py-3">
        <div className="h-7 w-48 max-w-full rounded bg-line" />
      </div>
      <div className="p-4">
        <CardGrid>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="aspect-square bg-line" />
              <div className="flex flex-col gap-2 p-3">
                <div className="h-3 w-1/3 rounded bg-line" />
                <div className="h-3 w-4/5 rounded bg-line" />
                <div className="h-3 w-1/2 rounded bg-line" />
              </div>
            </div>
          ))}
        </CardGrid>
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
          <WifiOff aria-hidden className="size-4 shrink-0" /> You're offline. Messages will send once you're back online.
        </p>
      )}
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
