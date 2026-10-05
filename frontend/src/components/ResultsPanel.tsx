import type { ResultSet } from "../api";
import ProductGrid from "./ProductGrid";
import SuggestionChips from "./SuggestionChips";

export type ResultsProps = {
  resultSet: ResultSet;
  onOpenProduct: (id: string) => void;
  onSuggestion: (text: string) => void;
  turnRunning: boolean;
  animate?: boolean; // the set just appeared, so its cards play the entrance (docs/06-frontend.md, Motion)
};

/** Headline and chips stay pinned while the grid scrolls. Used in the wide layout and inside the results sheet. */
export default function ResultsPanel({ resultSet, onOpenProduct, onSuggestion, turnRunning, animate }: ResultsProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-surface-muted px-4 py-3">
        <ResultsHeadline>{resultSet.headline}</ResultsHeadline>
        <SuggestionChips suggestions={resultSet.suggestions} onPick={onSuggestion} disabled={turnRunning} />
      </div>
      <div className="p-4">
        <ProductGrid cards={resultSet.products} onOpen={onOpenProduct} animate={animate} />
      </div>
    </div>
  );
}

/** A result set's headline in the serif at 24 px, wrapping onto a second line when there isn't room. */
export function ResultsHeadline({ children }: { children: string }) {
  return <h2 className="font-serif font-medium text-2xl leading-8 [overflow-wrap:anywhere]">{children}</h2>;
}

/** The wide panel before the first result set when the featured products failed to load. */
export function ResultsPlaceholder() {
  return <p className="grid h-full place-items-center p-6 text-center text-fg-muted">Products Saathi finds will show here.</p>;
}
