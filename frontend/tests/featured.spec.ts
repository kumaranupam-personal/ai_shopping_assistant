// Featured products before a conversation has results (docs/06-frontend.md, Loading, empty and error states).
import { expect, test, type Page } from "@playwright/test";

import { API, FEATURED, LADAKH_TURN, mockApi, send, sessionReady } from "./mock-api";

const featuredCard = (page: Page) => page.getByRole("button", { name: new RegExp(`^${FEATURED.products[0].title}, ₹`) }).filter({ visible: true });
const headline = (page: Page) => page.getByRole("heading", { name: FEATURED.headline });

test("they show on the landing as the grid at wide widths and the strip at narrow ones, and open the drawer", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "What are you shopping for?" })).toBeVisible();
  await expect(headline(page)).toBeVisible();
  const grid = page.locator("main .\\@container").filter({ visible: true });
  await expect(grid.getByRole("button")).toHaveCount(FEATURED.products.length);
  await featuredCard(page).click();
  await expect(page.getByRole("dialog", { name: "Product details" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 400, height: 800 });
  await expect(grid).toHaveCount(0);
  await expect(page.getByRole("button", { name: `View all (${FEATURED.products.length})` })).toBeVisible();
  await featuredCard(page).click();
  await expect(page.getByRole("dialog", { name: "Product details" })).toBeVisible();
});

test("after a first message they stay until the first result set replaces them, and a new chat brings them back", async ({ page }) => {
  await mockApi(page, [{ ...LADAKH_TURN, hang: true }, LADAKH_TURN]); // the first turn hangs until New chat drops it
  await page.goto("/");
  await sessionReady(page);
  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("heading", { name: FEATURED.headline })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  // Wait for the landing itself: the featured headline also shows in the results panel that New chat replaces.
  await expect(page.getByRole("heading", { level: 1, name: "What are you shopping for?" })).toBeVisible();
  await expect(headline(page)).toBeVisible();

  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await expect(page.getByRole("heading", { name: LADAKH_TURN.headline })).toBeVisible();
  await expect(headline(page)).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await expect(headline(page)).toBeVisible();
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
  await page.addInitScript((text) => {
    new MutationObserver(() => {
      if (document.body?.innerText.includes(text)) (window as unknown as { flashed: boolean }).flashed = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, FEATURED.headline);
  await page.reload();
  await expect(page.getByRole("heading", { name: LADAKH_TURN.headline })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { flashed?: boolean }).flashed)).toBeUndefined();
});

test("when the request fails, the landing has no featured section and the wide panel shows its placeholder", async ({ page }) => {
  await mockApi(page, [{ ...LADAKH_TURN, hang: true }]);
  await page.route(`${API}/featured`, (route) => route.fulfill({ status: 500, headers: { "Access-Control-Allow-Origin": "*" } }));
  await page.goto("/");
  await sessionReady(page);
  await expect(page.getByRole("list", { name: "Categories" })).toBeVisible();
  await expect(headline(page)).toHaveCount(0);
  await expect(page.locator("main .animate-pulse")).toHaveCount(0); // no skeletons left behind

  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText("Products Saathi finds will show here.")).toBeVisible();
  await page.setViewportSize({ width: 400, height: 800 });
  await expect(results).toHaveJSProperty("offsetHeight", 0); // the narrow strip stays hidden
});
