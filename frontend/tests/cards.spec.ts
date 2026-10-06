// Cards (docs/06-frontend.md, Visual design > Cards and Highlight pills): pills, the discount badge, strip cards and hover.
import { expect, test, type Page } from "@playwright/test";

import type { Card } from "../src/api";
import { LADAKH_TURN, mockApi, send, type ScriptedTurn } from "./mock-api";
import products from "./fixtures/products.json" with { type: "json" };

// Every row of the highlight pill table, on one card, in order.
const PILL_TABLE: [label: string, value: string, pill: string | null][] = [
  ["type", "windcheater", "Windcheater"],
  ["warmth", "light", "Light warmth"],
  ["waterproof", "no", null],
  ["waterproof", "yes", "Waterproof"],
  ["sole", "pu", "PU sole"],
  ["ram", "16 GB", "16 GB RAM"],
  ["storage", "1024 GB", "1 TB storage"],
  ["battery", "5186 mAh", "5186 mAh"],
  ["water resistance", "30 m", "30 m water resistance"],
  ["type", "induction cooktop", "Induction cooktop"],
  ["warranty", "5 years", "5 years warranty"],
];
const TABLE_CARD: Card = {
  ...products["JKT-00005"].card,
  id: "TEST-PILLS",
  title: "Pill table card",
  highlights: PILL_TABLE.map(([label, value]) => ({ label, value })),
};
const TURN: ScriptedTurn = { ...LADAKH_TURN, ids: ["JKT-00001", "JKT-00005"], cards: [TABLE_CARD] };

const card = (page: Page, title: string) =>
  page.getByRole("region", { name: "Results" }).getByRole("button", { name: new RegExp(`^${title}, ₹`) }).filter({ visible: true });

test("highlight pills follow the table, and only discounted cards carry a badge", async ({ page }) => {
  await mockApi(page, [TURN]);
  await page.goto("./");
  await send(page, "warm jacket under 8k", TURN);

  const pills = card(page, TABLE_CARD.title).locator(".bg-tile.rounded-full");
  await expect(pills).toHaveText(PILL_TABLE.flatMap(([, , pill]) => (pill ? [pill] : [])));

  const discounted = products["JKT-00001"].card; // 19% off
  await expect(card(page, discounted.title).getByText(`${discounted.discount_pct}% off`)).toBeVisible();
  const badge = await card(page, discounted.title).getByText(`${discounted.discount_pct}% off`).evaluate((el) => {
    const image = el.parentElement!.querySelector(".aspect-square")!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    // Rounded: while the card entrance is still moving the card, the two rects differ by float noise.
    return { left: Math.round(rect.left - image.left), top: Math.round(rect.top - image.top) };
  });
  expect(badge).toEqual({ left: 8, top: 8 }); // the image's top-left corner, 8 px in
  await expect(card(page, products["JKT-00005"].card.title).getByText(/% off/)).toHaveCount(0); // no discount: no badge
  await expect(card(page, discounted.title).getByText(/% off/)).toHaveCount(1); // and no pill in the price row
});

test("strip cards show neither the badge nor pills", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await mockApi(page, [TURN]);
  await page.goto("./");
  await send(page, "warm jacket under 8k", TURN);
  const strip = card(page, products["JKT-00001"].card.title);
  await expect(strip).toBeVisible();
  await expect(strip).not.toContainText("% off");
  await expect(card(page, TABLE_CARD.title)).not.toContainText("Windcheater");
});

test("a hovered card rises 2 px", async ({ page }) => {
  await mockApi(page, [TURN]);
  await page.goto("./");
  await send(page, "warm jacket under 8k", TURN);
  const target = card(page, TABLE_CARD.title);
  await target.hover();
  await expect.poll(() => target.evaluate((el) => getComputedStyle(el).translate)).toBe("0px -2px");
});
