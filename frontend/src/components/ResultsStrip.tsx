import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatRupees } from "../format";
import { cardLabel } from "./ProductCard";
import ProductImage from "./ProductImage";
import ResultsPanel, { type ResultsProps } from "./ResultsPanel";

/** Narrow layout: a swipeable row of compact cards, with "View all" opening the full-screen results sheet. */
export default function ResultsStrip(props: ResultsProps) {
  const { resultSet, onOpenProduct } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []); // stable, so the sheet opens once
  return (
    <>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto border-b border-line px-4 py-3">
        {resultSet.products.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpenProduct(card.id)}
            aria-label={cardLabel(card)}
            className="flex w-56 shrink-0 snap-start items-center gap-3 rounded-xl border border-line bg-surface p-2 text-left"
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

/**
 * A native modal dialog: the browser traps focus, makes the page behind inert and restores focus on close. A history
 * entry lets the back gesture close it.
 */
function ResultsSheet({ onClose, ...props }: ResultsProps & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null); // captured once, before the modal takes focus

  useEffect(() => {
    if (!dialog.current!.open) dialog.current!.showModal();
    if (!history.state?.resultsSheet) history.pushState({ resultsSheet: true }, ""); // once, even if effects re-run
    window.addEventListener("popstate", onClose);
    return () => {
      window.removeEventListener("popstate", onClose);
      opener.current?.focus(); // the dialog is removed rather than closed, so return focus ourselves
    };
  }, [onClose]);

  // Esc and the close button leave through the history entry, so the back gesture and these behave the same.
  const close = () => (history.state?.resultsSheet ? history.back() : onClose());

  return (
    <dialog
      ref={dialog}
      aria-label="All results"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-surface-muted text-fg lg:hidden"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
          <span className="text-sm font-medium">All results</span>
          <button type="button" onClick={close} aria-label="Close" className="grid size-9 place-items-center rounded-lg hover:bg-surface-muted">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ResultsPanel {...props} />
        </div>
      </div>
    </dialog>
  );
}
