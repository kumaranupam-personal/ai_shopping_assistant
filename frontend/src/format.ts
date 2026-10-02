// Display formatting (docs/02-catalog.md, Currency format).
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const counts = new Intl.NumberFormat("en-IN");

/** "₹1,24,999": rupee sign, Indian digit grouping, no decimals. */
export const formatRupees = (amount: number) => rupees.format(amount);

export const formatCount = (count: number) => counts.format(count);
