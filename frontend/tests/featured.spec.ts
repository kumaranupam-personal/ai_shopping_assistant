// Featured products before a conversation has results (docs/06-frontend.md, Loading, empty and error states).
import { expect, test, type Page } from "@playwright/test";

import { API, FEATURED, LADAKH_TURN, mockApi, send } from "./mock-api";

const featuredCard = (page: Page) => page.getByRole("button", { name: new RegExp(`^${FEATURED.products[0].title}, ₹`) });

test("they show on first load in the wide and narrow layouts, and open the drawer", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("heading", { name: "What are you shopping for?" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Popular picks" })).toBeVisible();
  await featuredCard(page).first().click();
  await expect(page.getByRole("dialog", { name: "Product details" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 400, height: 800 });
  await expect(page.getByRole("button", { name: `View all (${FEATURED.products.length})` })).toBeVisible();
});

test("the first result set replaces them, and a new chat brings them back", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await expect(page.getByRole("heading", { name: LADAKH_TURN.headline })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular picks" })).toHaveCount(0);
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: "Popular picks" })).toBeVisible();
});

test("a restored session with results never shows them, even while the restore is still loading", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  // Slow the restore so the featured list arrives first, and record whether the featured headline ever appears.
  await page.route(`${API}/sessions/*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fallback();
  });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.innerText.includes("Popular picks")) (window as unknown as { flashed: boolean }).flashed = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: LADAKH_TURN.headline })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { flashed?: boolean }).flashed)).toBeUndefined();
});
