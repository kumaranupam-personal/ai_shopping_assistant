// The diagram's geometry in its 680 by 330 coordinate space (docs/12-about-page.md, Diagram). Labels come from content.ts.
import type { EdgeId, NodeId } from "./content";

export const VIEW = { width: 680, height: 330 };

export type Rect = { x: number; y: number; w: number; h: number };
export type Box = Rect & { kind: "node" | "chip" };

const CHIP = { x: 318, w: 122, h: 26 };
const ROW = { x: 484, w: 172, h: 26 };

/** Browser lane, then server lane (the agent loop group and the grounding gate), then data lane. */
export const NODES: Record<NodeId, Box> = {
  message: { kind: "node", x: 12, y: 34, w: 136, h: 34 },
  reply: { kind: "node", x: 12, y: 150, w: 136, h: 34 },
  cards: { kind: "node", x: 12, y: 264, w: 136, h: 50 },
  api: { kind: "node", x: 200, y: 34, w: 220, h: 34 },
  model: { kind: "node", x: 184, y: 110, w: 100, h: 40 },
  memory: { kind: "node", x: 184, y: 166, w: 100, h: 52 },
  search_products: { kind: "chip", ...CHIP, y: 108 },
  get_product_details: { kind: "chip", ...CHIP, y: 142 },
  compare_products: { kind: "chip", ...CHIP, y: 176 },
  show_products: { kind: "chip", ...CHIP, y: 210 },
  gate: { kind: "node", x: 172, y: 264, w: 276, h: 50 },
  sql: { kind: "node", ...ROW, y: 48 },
  keyword: { kind: "node", ...ROW, w: 82, y: 82 },
  meaning: { kind: "node", ...ROW, x: 574, w: 82, y: 82 },
  merge: { kind: "node", ...ROW, y: 116 },
  brand: { kind: "node", ...ROW, y: 150 },
  top: { kind: "node", ...ROW, y: 184 },
  catalog: { kind: "node", x: 484, y: 264, w: 172, h: 50 },
};

export const GROUPS = {
  agentLoop: { x: 172, y: 86, w: 276, h: 166 },
  search: { x: 472, y: 22, w: 196, h: 200 },
} satisfies Record<string, Rect>;

/** The dashed lines between the lanes, and where each lane's label sits. */
export const LANE_LINES = [160, 460];
export const LANE_LABELS = { browser: 80, server: 310, data: 570 };

type Side = "t" | "r" | "b" | "l";
type End = [NodeId | "search", Side, number?]; // the side's midpoint, or a fraction along it

/** Straight edges between side anchors, chosen so no line crosses an unrelated box. */
export const EDGES: Record<EdgeId, [End, End]> = {
  "message-api": [["message", "r", 0.3], ["api", "l", 0.3]],
  "api-model": [["api", "b", 0.05], ["model", "t", 0.27]], // left of the agent loop's label
  "model-search_products": [["model", "r", 0.3], ["search_products", "l"]],
  "model-get_product_details": [["model", "r", 0.5], ["get_product_details", "l"]],
  "model-compare_products": [["model", "r", 0.7], ["compare_products", "l"]],
  "model-show_products": [["model", "r", 0.9], ["show_products", "l"]],
  "memory-model": [["memory", "t"], ["model", "b"]],
  "search_products-search": [["search_products", "r"], ["search", "l", 99 / 200]],
  "search-catalog": [["search", "b"], ["catalog", "t", 86 / 172]],
  "get_product_details-catalog": [["get_product_details", "r"], ["catalog", "l", 0.15]],
  "compare_products-catalog": [["compare_products", "r"], ["catalog", "l", 0.35]],
  "show_products-gate": [["show_products", "b"], ["gate", "t", 207 / 276]],
  "catalog-gate": [["catalog", "l", 0.7], ["gate", "r", 0.7]],
  "gate-cards": [["gate", "l"], ["cards", "r"]],
  "api-reply": [["api", "l", 0.8], ["reply", "t"]],
};

const rectOf = (id: NodeId | "search"): Rect => (id === "search" ? GROUPS.search : NODES[id]);

/** The point on a box's side: its midpoint, or `at` (0 to 1) along it from the top or left. */
export function anchor([id, side, at = 0.5]: End): [number, number] {
  const { x, y, w, h } = rectOf(id);
  if (side === "t") return [x + w * at, y];
  if (side === "b") return [x + w * at, y + h];
  if (side === "l") return [x, y + h * at];
  return [x + w, y + h * at];
}
