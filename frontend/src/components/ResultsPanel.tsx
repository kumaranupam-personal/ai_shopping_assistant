import type { ResultSet } from "../api";
import ProductGrid from "./ProductGrid";
import SuggestionChips from "./SuggestionChips";

export type ResultsProps = {
  resultSet: ResultSet;
  onOpenProduct: (id: string) => void;
  onSuggestion: (text: string) => void;
  turnRunning: boolean;
};

/** Headline and chips stay pinned while the grid scrolls. Used in the wide layout and inside the results sheet. */
export default function ResultsPanel({ resultSet, onOpenProduct, onSuggestion, turnRunning }: ResultsProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-surface-muted px-4 py-3">
        <h2 className="text-lg font-semibold">{resultSet.headline}</h2>
        <SuggestionChips suggestions={resultSet.suggestions} onPick={onSuggestion} disabled={turnRunning} />
      </div>
      <div className="p-4">
        <ProductGrid cards={resultSet.products} onOpen={onOpenProduct} />
      </div>
    </div>
  );
}
