import { ArrowRight, Laptop, PartyPopper, Shirt, SportShoe, type LucideIcon } from "lucide-react";

import type { ResultSet } from "../api";
import Composer from "./Composer";
import { CATEGORY_ICONS } from "./ProductImage";
import ProductGrid from "./ProductGrid";
import { ResultsHeadline } from "./ResultsPanel";
import ResultsStrip from "./ResultsStrip";
import { SkeletonGrid, SkeletonHeadline, SkeletonStrip } from "./States";

// The example prompts (docs/06-frontend.md, Loading, empty and error states).
const PROMPTS: { Icon: LucideIcon; title: string; subtitle: string; message: string }[] = [
  { Icon: Shirt, title: "Warm jacket for a Ladakh trek", subtitle: "Under ₹8,000, size L", message: "Warm jacket for a Ladakh trek under ₹8,000, size L" },
  { Icon: Laptop, title: "Gaming laptop", subtitle: "16 GB RAM, dedicated graphics", message: "Gaming laptop with 16 GB RAM and dedicated graphics" },
  { Icon: SportShoe, title: "Waterproof trekking shoes", subtitle: "Size UK 9", message: "Waterproof trekking shoes in UK 9" },
  { Icon: PartyPopper, title: "Shaadi ke liye silk kurta", subtitle: "5k tak", message: "Shaadi ke liye silk kurta, 5k tak" },
];

// One chip per category, in the order of docs/02-catalog.md: "kitchen_appliances" reads "Kitchen appliances".
const CATEGORIES = Object.entries(CATEGORY_ICONS).map(([category, Icon]) => {
  const name = category.replaceAll("_", " ");
  return { Icon, label: name[0].toUpperCase() + name.slice(1), message: `Show me ${name}` };
});

type Props = {
  draft: string;
  onDraftChange: (draft: string) => void;
  /** `fromComposer` decides where focus goes once the chat takes over. */
  onSend: (text: string, fromComposer: boolean) => void;
  canSend: boolean; // false until a session exists
  featured: ResultSet | null | undefined; // undefined while loading, null if the request failed
  animateFeatured: boolean;
  onOpenProduct: (id: string) => void;
};

/** The empty state before the first message: one scrolling column, never part of the transcript. */
export default function Landing({ draft, onDraftChange, onSend, canSend, featured, animateFeatured, onOpenProduct }: Props) {
  const tap = (message: string) => onSend(message, false);
  return (
    <div className="h-full overflow-y-auto bg-surface-muted">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 pt-8 pb-6 sm:px-6 sm:pt-16">
        <div className="text-center">
          <h1 className="font-serif text-[36px] leading-[1.1] font-medium tracking-[-0.02em] text-balance sm:text-5xl sm:leading-[1.05]">What are you shopping for?</h1>
          <p className="mt-2 text-base text-balance text-fg-muted">Tell Saathi what you need and your budget, in English or Hinglish.</p>
        </div>
        <Composer variant="landing" draft={draft} onDraftChange={onDraftChange} onSend={(text) => onSend(text, true)} canSend={canSend} />
        <ul aria-label="Example requests" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROMPTS.map(({ Icon, title, subtitle, message }) => (
            <li key={title} className="flex">
              <button
                type="button"
                disabled={!canSend}
                onClick={() => tap(message)}
                className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors duration-150 ease-out enabled:hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-fg">
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-fg-muted">{subtitle}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-fg-muted transition-[color,translate] duration-150 ease-out group-enabled:group-hover:text-accent motion-safe:group-enabled:group-hover:translate-x-0.5"
                />
              </button>
            </li>
          ))}
        </ul>
        <ul aria-label="Categories" className="flex flex-wrap justify-center gap-2">
          {CATEGORIES.map(({ Icon, label, message }) => (
            <li key={label}>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => tap(message)}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-3 text-sm transition-colors duration-150 ease-out enabled:hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon aria-hidden className="size-4 text-fg-muted" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {featured !== null && (
        <div className="mt-6 py-4">
          <div className="px-4 pb-3">{featured ? <ResultsHeadline>{featured.headline}</ResultsHeadline> : <SkeletonHeadline />}</div>
          {/* CSS picks grid or strip, so crossing 1024 px keeps everything, including a half-typed draft. */}
          <div className="hidden px-4 lg:block">
            {featured ? <ProductGrid cards={featured.products} onOpen={onOpenProduct} animate={animateFeatured} /> : <SkeletonGrid />}
          </div>
          <div className="lg:hidden">
            {featured ? (
              <ResultsStrip resultSet={featured} onOpenProduct={onOpenProduct} onSuggestion={tap} turnRunning={!canSend} animate={animateFeatured} />
            ) : (
              <SkeletonStrip />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
