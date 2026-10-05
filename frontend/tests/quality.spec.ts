// The automatable quality bar from docs/06-frontend.md: widths and themes, drag-resize, layout shift, console errors.
import { expect, test, type Page } from "@playwright/test";

import { LADAKH_TURN, WATERPROOF_TURN, chatRows, message, mockApi, send, sessionReady } from "./mock-api";

const WIDTHS = [320, 375, 768, 1024, 1280, 1440, 1920, 2560];

async function startConversation(page: Page) {
  await mockApi(page, [LADAKH_TURN, WATERPROOF_TURN]);
  await page.goto("/");
  await send(page, "I'm going trekking in Ladakh in December, need a jacket under 8k, size L.", LADAKH_TURN);
}

/** First load: the landing, with its prompt cards, category chips and featured products. */
async function openLanding(page: Page) {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await sessionReady(page);
  await expect(page.getByRole("list", { name: "Example requests" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Popular picks" })).toBeVisible();
}

/** Resolves once an open panel has finished sliding in, so the checks see where it rests. */
const panelSettled = (page: Page) => page.waitForFunction(() => document.querySelector("dialog[open] > div")?.getAnimations().length === 0);

/** After a turn, with a product drawer open (a product with sizes, so every choice shows). */
async function openDrawer(page: Page) {
  await startConversation(page);
  await page.getByRole("button", { name: /^TrekNorth Summit Fleece Jacket, ₹/ }).filter({ visible: true }).click();
  await expect(page.getByRole("dialog", { name: "Product details" }).getByRole("button", { name: "Select a size" })).toBeVisible();
  await panelSettled(page);
}

/** The cart panel over the landing, empty or with items (one out of stock, one without sizes, one that fails). */
async function openCart(page: Page, items: { id: string; size: string | null; color: string }[]) {
  await page.addInitScript((value) => localStorage.setItem("cart", JSON.stringify(value)), items);
  await openLanding(page);
  await page.getByRole("banner").getByRole("button", { name: /^Cart/ }).click();
  const panel = page.getByRole("dialog", { name: "Cart" });
  await expect(panel).toBeVisible();
  if (items.length) await expect(panel.getByRole("button", { name: /^Remove / })).toHaveCount(items.length);
  else await expect(panel.getByText("Your cart is empty.")).toBeVisible();
  await panelSettled(page);
}

const CART_ITEMS = [
  { id: "JKT-00008", size: "XXL", color: "olive" },
  { id: "JKT-00005", size: "M", color: "grey" },
  { id: "WCH-00001", size: null, color: "silver" },
];

const STATES = {
  landing: openLanding,
  "after a turn": startConversation,
  "with the product drawer open": openDrawer,
  "with the cart panel open and empty": (page: Page) => openCart(page, []),
  "with the cart panel open and items in it": (page: Page) => openCart(page, CART_ITEMS),
};

/** Checks the layout rules at the current size; returns a description of anything wrong. */
function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const width = innerWidth;
    if (document.documentElement.scrollWidth > width) problems.push("horizontal page scroll");
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const inView = (name: string, rect: DOMRect | undefined) => {
      if (rect && (rect.left < -0.5 || rect.right > width + 0.5)) problems.push(`${name} outside the viewport`);
    };
    const [header, main, chat, results] = ["header", "main", "[aria-label=Chat]", "[aria-label=Results]"].map(box);
    Object.entries({ header, main, chat, results }).forEach(([name, rect]) => inView(name, rect));
    // The header's controls (theme switch, cart button, New chat) fit beside the wordmark down to 320 px.
    for (const el of document.querySelectorAll("header button")) inView(`header control ${el.getAttribute("aria-label") ?? el.textContent}`, el.getBoundingClientRect());
    // Scroll areas other than the swipeable strips never scroll sideways.
    for (const el of document.querySelectorAll<HTMLElement>("main .overflow-y-auto")) {
      if (el.scrollWidth > el.clientWidth + 1) problems.push("a scroll area scrolls sideways");
    }
    // Text that must wrap rather than overflow (docs/06-frontend.md, Resize rules).
    for (const el of document.querySelectorAll<HTMLElement>("main h1, main h2, [aria-label='Example requests'] button, [aria-label=Categories] button")) {
      if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) problems.push(`overflowing text: ${el.textContent}`);
    }
    for (const row of document.querySelectorAll<HTMLElement>("main .tabular-nums")) {
      if (row.offsetParent && row.scrollWidth > row.clientWidth + 1) problems.push("a price row overflows its card");
    }
    const heading = document.querySelector("main h1");
    if (heading) {
      // The landing: one centered column of at most 720 px, prompt cards in 2 columns (1 below 640 px), inside it.
      if (chat || results) problems.push("the landing shows a chat or results panel");
      const block = heading.parentElement!.parentElement!.getBoundingClientRect();
      if (block.width > 720.5) problems.push(`landing block is ${block.width}px wide`);
      if (Math.abs(block.left + block.width / 2 - (main!.left + main!.width / 2)) > 1) problems.push("landing block is off center");
      const cards = [...document.querySelectorAll("[aria-label='Example requests'] button")].map((el) => el.getBoundingClientRect());
      const columns = new Set(cards.map((rect) => Math.round(rect.left))).size;
      if (columns !== (width < 640 ? 1 : 2)) problems.push(`prompt cards in ${columns} columns`);
      for (const rect of [...cards, ...[...document.querySelectorAll("[aria-label=Categories] button")].map((el) => el.getBoundingClientRect())]) {
        if (rect.left < block.left - 0.5 || rect.right > block.right + 0.5) problems.push("a card or chip sticks out of the landing");
      }
      const grid = [...document.querySelectorAll<HTMLElement>("main .\\@container")].some((el) => el.offsetParent);
      if (grid !== width >= 1024) problems.push(`featured ${grid ? "grid" : "strip"} at ${width}px`);
    } else if (width >= 1024) {
      const expected = Math.min(Math.max(340, 0.32 * width), 460);
      if (Math.abs(chat!.width - expected) > 1) problems.push(`chat column is ${chat!.width}px, expected ${expected}px`);
      if (results!.left < chat!.right - 0.5) problems.push("results overlap the chat");
    } else if (results!.bottom > chat!.top + 0.5) {
      problems.push("narrow layout: results strip is not above the chat");
    }
    // An open drawer or cart panel (docs/06-frontend.md, Drawer): in view, full width below 640 px and
    // min(480px, 100vw) wide from it, with nothing inside overflowing and the action bar or footer at its bottom edge.
    const panel = document.querySelector("dialog[open] > div");
    if (panel) {
      const rect = panel.getBoundingClientRect();
      inView("the open panel", rect);
      const expectedWidth = width < 640 ? width : Math.min(480, width);
      if (Math.abs(rect.width - expectedWidth) > 1) problems.push(`open panel is ${rect.width}px wide, expected ${expectedWidth}px`);
      if (rect.bottom > innerHeight + 0.5 || rect.top < -0.5) problems.push("open panel is taller than the viewport");
      for (const el of panel.querySelectorAll<HTMLElement>("*")) {
        const box = el.getBoundingClientRect();
        if (box.width && (box.left < rect.left - 0.5 || box.right > rect.right + 0.5)) problems.push(`sticks out of the panel: ${el.tagName} ${el.textContent?.slice(0, 30)}`);
        if (el.matches("button, h2, h3, p") && el.scrollWidth > el.clientWidth + 1) problems.push(`overflowing text in the panel: ${el.textContent?.slice(0, 30)}`);
      }
      // The drawer's action bar and the cart's footer (the empty cart has none) are bordered on top.
      const bar = panel.lastElementChild!;
      if (bar.matches(".border-t") && Math.abs(bar.getBoundingClientRect().bottom - rect.bottom) > 0.5) problems.push("the panel's bottom bar is not at its bottom edge");
    }
    const shell = document.querySelector("header")!.parentElement!.getBoundingClientRect();
    if (width > 1680 && Math.abs(shell.width - 1680) > 1) problems.push("shell is not capped at 1680px");
    return problems;
  });
}

for (const [state, open] of Object.entries(STATES)) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`layout holds at every listed width, ${state} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        expect(await layoutProblems(page), `at ${width}px`).toEqual([]);
      }
    });
  }
}

const SWEEP = [...Array.from({ length: 41 }, (_, i) => 320 + i * 40), ...Array.from({ length: 41 }, (_, i) => 1920 - i * 40)];

test("drag-resizing from 320 to 1920 px and back keeps the layout and the state", async ({ page }) => {
  await startConversation(page);
  const messages = await chatRows(page).count();
  for (const width of SWEEP) {
    await page.setViewportSize({ width, height: 800 });
    expect(await layoutProblems(page), `at ${width}px`).toEqual([]);
  }
  await expect(chatRows(page)).toHaveCount(messages);
  await expect(page.getByRole("button", { name: `Show 8 products: ${LADAKH_TURN.headline}` })).toHaveAttribute("aria-pressed", "true");
});

test("drag-resizing with the landing showing keeps the layout and the draft", async ({ page }) => {
  await openLanding(page);
  await page.getByLabel("Message").fill("half-typed");
  for (const width of SWEEP) {
    await page.setViewportSize({ width, height: 800 });
    expect(await layoutProblems(page), `at ${width}px`).toEqual([]);
  }
  await expect(page.getByRole("list", { name: "Example requests" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByLabel("Message")).toHaveValue("half-typed");
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
