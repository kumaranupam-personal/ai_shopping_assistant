// The automatable quality bar from docs/06-frontend.md: widths and themes, drag-resize, layout shift, console errors.
import { expect, test, type Page } from "@playwright/test";

import { LADAKH_TURN, WATERPROOF_TURN, message, mockApi, send } from "./mock-api";

const WIDTHS = [320, 375, 768, 1024, 1280, 1440, 1920, 2560];

async function startConversation(page: Page) {
  await mockApi(page, [LADAKH_TURN, WATERPROOF_TURN]);
  await page.goto("/");
  await send(page, "I'm going trekking in Ladakh in December, need a jacket under 8k, size L.", LADAKH_TURN);
}

/** Checks the layout rules at the current size; returns a description of anything wrong. */
function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const width = innerWidth;
    if (document.documentElement.scrollWidth > width) problems.push("horizontal page scroll");
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const [header, chat, results] = ["header", "[aria-label=Chat]", "[aria-label=Results]"].map(box);
    for (const [name, rect] of Object.entries({ header, chat, results })) {
      if (rect.left < -0.5 || rect.right > width + 0.5) problems.push(`${name} outside the viewport`);
    }
    // Scroll areas other than the swipeable strip never scroll sideways.
    for (const el of document.querySelectorAll<HTMLElement>("[aria-label=Chat] .overflow-y-auto, [aria-label=Results] .overflow-y-auto")) {
      if (el.scrollWidth > el.clientWidth + 1) problems.push("a panel scrolls sideways");
    }
    if (width >= 1024) {
      const expected = Math.min(Math.max(340, 0.32 * width), 460);
      if (Math.abs(chat.width - expected) > 1) problems.push(`chat column is ${chat.width}px, expected ${expected}px`);
      if (results.left < chat.right - 0.5) problems.push("results overlap the chat");
    } else if (results.bottom > chat.top + 0.5) {
      problems.push("narrow layout: results strip is not above the chat");
    }
    const shell = document.querySelector("header")!.parentElement!.getBoundingClientRect();
    if (width > 1680 && Math.abs(shell.width - 1680) > 1) problems.push("shell is not capped at 1680px");
    return problems;
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`layout holds at every listed width (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await startConversation(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await layoutProblems(page), `at ${width}px`).toEqual([]);
    }
  });
}

test("drag-resizing from 320 to 1920 px and back keeps the layout and the state", async ({ page }) => {
  await startConversation(page);
  const messages = await page.locator("[aria-label=Chat] ol > li").count();
  const sweep = [...Array.from({ length: 41 }, (_, i) => 320 + i * 40), ...Array.from({ length: 41 }, (_, i) => 1920 - i * 40)];
  for (const width of sweep) {
    await page.setViewportSize({ width, height: 800 });
    expect(await layoutProblems(page), `at ${width}px`).toEqual([]);
  }
  await expect(page.locator("[aria-label=Chat] ol > li")).toHaveCount(messages);
  await expect(page.getByRole("button", { name: `Showed 8 products: ${LADAKH_TURN.headline}` })).toHaveAttribute("aria-pressed", "true");
});

test("cumulative layout shift stays below 0.1 during a full turn", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { cls: number }).cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) (window as unknown as { cls: number }).cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await startConversation(page);
  await page.waitForLoadState("networkidle"); // visible images loaded; lazy ones below the fold never start
  expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.1);
});

test("the example conversation logs no console errors or warnings", async ({ page }) => {
  const logged: string[] = [];
  page.on("console", (message) => ["error", "warning"].includes(message.type()) && logged.push(message.text()));
  page.on("pageerror", (error) => logged.push(error.message));
  await startConversation(page);
  await page.getByRole("button", { name: "Only waterproof" }).click();
  await message(page, WATERPROOF_TURN.reply).waitFor();
  await page.getByRole("button", { name: /, ₹[\d,]+(, out of stock)?$/ }).first().click(); // a product card
  await expect(page.getByRole("dialog", { name: "Product details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(logged).toEqual([]);
});
