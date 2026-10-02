import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import { formatRupees } from "../format";
import Modal, { CloseButton } from "./Modal";
import { cardLabel } from "./ProductCard";
import ProductImage from "./ProductImage";
import ResultsPanel, { type ResultsProps } from "./ResultsPanel";

// Shared with the compact skeleton, so placeholders match the real strip exactly.
export const STRIP = "flex gap-3 border-b border-line px-4 py-3";
export const STRIP_CARD = "flex w-56 shrink-0 items-center gap-3 rounded-xl border border-line bg-surface p-2";

/** Narrow layout: a swipeable row of compact cards, with "View all" opening the full-screen results sheet. */
export default function ResultsStrip(props: ResultsProps) {
  const { resultSet, onOpenProduct } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []); // stable, so the sheet opens once
  return (
    <>
      <div className={clsx(STRIP, "snap-x snap-mandatory overflow-x-auto")}>
        {resultSet.products.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpenProduct(card.id)}
            aria-label={cardLabel(card)}
            className={clsx(STRIP_CARD, "snap-start text-left")}
          >
            <ProductImage src={card.image_url} className="size-16 shrink-0 rounded-lg" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{card.title}</span>
              <span className="text-sm font-semibold tabular-nums">{formatRupees(card.price)}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="shrink-0 snap-start self-center rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium whitespace-nowrap text-accent"
        >
          View all ({resultSet.products.length})
        </button>
      </div>
      {sheetOpen && <ResultsSheet {...props} onClose={closeSheet} />}
    </>
  );
}

/** The full-screen results sheet. A history entry lets the browser back gesture close it. */
function ResultsSheet({ onClose, onSuggestion, ...props }: ResultsProps & { onClose: () => void }) {
  useEffect(() => {
    if (!history.state?.resultsSheet) history.pushState({ resultsSheet: true }, ""); // once, even if effects re-run
    window.addEventListener("popstate", onClose);
    return () => window.removeEventListener("popstate", onClose);
  }, [onClose]);

  // Esc and the close button leave through the history entry, so the back gesture and these behave the same.
  const close = () => (history.state?.resultsSheet ? history.back() : onClose());
  // A chip starts a new search, which replaces the strip; close through history first so no stale entry is left.
  const pick = (text: string) => {
    close();
    onSuggestion(text);
  };

  return (
    <Modal label="All results" onClose={close} className="h-dvh w-full bg-surface-muted">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
          <span className="text-sm font-medium">All results</span>
          <CloseButton onClick={close} />
        </div>
        <div className="min-h-0 flex-1">
          <ResultsPanel {...props} onSuggestion={pick} />
        </div>
      </div>
    </Modal>
  );
}
