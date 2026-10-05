// Product colour swatches (docs/06-frontend.md, Product tiles > Swatches): the one place their hex values live.
const SWATCHES: Record<string, string> = {
  black: "#2B2B2B",
  white: "#FFFFFF",
  grey: "#8A8F93",
  navy: "#2F4170",
  blue: "#3F6FB5",
  red: "#B5443B",
  green: "#3F7D54",
  olive: "#7A7A3C",
  brown: "#7A5438",
  beige: "#C9B48F",
  pink: "#D58CA3",
  maroon: "#7A2E3A",
  yellow: "#D9B441",
  silver: "#AEB4BA",
  gold: "#B8923A",
};

/** How a catalog colour is drawn, in both themes: tile tints, colour dots and the drawer's colour choices. Unknown colours draw grey. */
export const swatch = (color: string) => SWATCHES[color] ?? SWATCHES.grey;
