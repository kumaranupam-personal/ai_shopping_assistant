import { Flame } from "lucide-react";
import type { ReactNode } from "react";

import type { ResultSet } from "../api";
import ProductGrid from "./ProductGrid";
import SuggestionChips from "./SuggestionChips";

export type ResultsProps = {
  resultSet: ResultSet;
  onOpenProduct: (id: string) => void;
  onSuggestion: (text: string) => void;
  turnRunning: boolean;
  featured?: boolean; // the featured list, whose headline carries a "Top rated" tag
  animate?: boolean; // the set just appeared, so its cards play the entrance (docs/06-frontend.md, Motion)
};

/**
 * Headline and chips stay pinned while the grid scrolls. Used in the wide layout and inside the results sheet.
 * `intro` scrolls away above the headline, so the panel never needs a second scroll area.
 */
export default function ResultsPanel({ resultSet, onOpenProduct, onSuggestion, turnRunning, featured, animate, intro }: ResultsProps & { intro?: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      {intro}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-surface-muted px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-lg font-semibold">{resultSet.headline}</h2>
          {featured && (
            <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-soft-fg">
              <Flame aria-hidden className="size-3.5" /> Top rated
            </span>
          )}
        </div>
        <SuggestionChips suggestions={resultSet.suggestions} onPick={onSuggestion} disabled={turnRunning} />
      </div>
      <div className="p-4">
        <ProductGrid cards={resultSet.products} onOpen={onOpenProduct} animate={animate} />
      </div>
    </div>
  );
}
