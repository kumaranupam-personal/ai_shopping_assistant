// Display formatting (docs/02-catalog.md, Currency format).
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const counts = new Intl.NumberFormat("en-IN");

/** "₹1,24,999": rupee sign, Indian digit grouping, no decimals. */
export const formatRupees = (amount: number) => rupees.format(amount);

export const formatCount = (count: number) => counts.format(count);

// Labels that read better after their value: "16 GB RAM", "Light warmth" (docs/06-frontend.md, Highlight pills).
const LABEL_AFTER_VALUE = new Set(["ram", "storage", "warmth", "sole", "strap", "sleeve", "water resistance", "warranty"]);

/** A card highlight as its short pill text, or null when it says nothing ("no", "0 m"). */
export function highlightPill({ label, value }: { label: string; value: string }): string | null {
  if (value === "no" || value === "0 m") return null;
  const text = (value === "yes" ? label : LABEL_AFTER_VALUE.has(label) ? `${value} ${label}` : value)
    .replace(/\b1024 GB\b/, "1 TB")
    .replace(/\b(ram|pu|eva)\b/gi, (word) => word.toUpperCase());
  return text[0].toUpperCase() + text.slice(1);
}
