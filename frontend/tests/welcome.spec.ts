// The welcome before the first message (docs/06-frontend.md, Loading, empty and error states).
import { expect, test, type Page } from "@playwright/test";

import { API, LADAKH_TURN, chatRows, message, mockApi, send, sessionReady } from "./mock-api";

const GREETING = "Hi! I'm your shopping assistant.";
const prompts = (page: Page) => page.getByRole("list", { name: "Example requests" }).getByRole("button");

test("the greeting and 4 prompt cards show before the first message in both layouts", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await sessionReady(page);
  for (const width of [1280, 400]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByText(GREETING)).toBeVisible();
    await expect(prompts(page)).toHaveCount(4);
    await expect(prompts(page).first()).toBeVisible();
  }
});

test("clicking a prompt card sends its message, and the first message replaces the welcome", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await sessionReady(page);
  await prompts(page).filter({ hasText: "Gaming laptop" }).click();
  await expect(message(page, "Gaming laptop with 16 GB RAM and dedicated graphics")).toBeVisible();
  await message(page, LADAKH_TURN.reply).waitFor();
  await expect(page.getByText(GREETING)).toHaveCount(0);
  await expect(prompts(page)).toHaveCount(0);
});

test("a new chat brings the welcome back", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await expect(prompts(page)).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await expect(prompts(page)).toHaveCount(4);
  await expect(chatRows(page)).toHaveCount(0);
});

test("the welcome stays hidden while a restore is loading", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  // Slow the restore, and record whether the greeting ever appears before the restored conversation.
  await page.route(`${API}/sessions/*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fallback();
  });
  await page.addInitScript((greeting) => {
    new MutationObserver(() => {
      if (document.body?.innerText.includes(greeting)) (window as unknown as { flashed: boolean }).flashed = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, GREETING);
  await page.reload();
  await expect(message(page, LADAKH_TURN.reply)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { flashed?: boolean }).flashed)).toBeUndefined();
});
