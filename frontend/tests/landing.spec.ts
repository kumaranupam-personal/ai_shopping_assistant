// The landing before the first message (docs/06-frontend.md, Layout > Landing; Loading, empty and error states).
import { expect, test, type Page } from "@playwright/test";

import { API, LADAKH_TURN, chatRows, message, mockApi, send, sessionReady } from "./mock-api";

const HEADING = "What are you shopping for?";
const heading = (page: Page) => page.getByRole("heading", { level: 1, name: HEADING });
const prompts = (page: Page) => page.getByRole("list", { name: "Example requests" }).getByRole("button");
const categories = (page: Page) => page.getByRole("list", { name: "Categories" }).getByRole("button");
const CATEGORY_NAMES = ["Jackets", "Shoes", "Phones", "Laptops", "Backpacks", "Watches", "Kurtas", "Kitchen appliances"];

async function openLanding(page: Page) {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await sessionReady(page);
  await expect(heading(page)).toBeVisible();
}

test("the heading, composer, 4 prompt cards and 8 category chips show at wide and narrow widths", async ({ page }) => {
  await openLanding(page);
  for (const width of [1280, 400]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(heading(page)).toBeVisible();
    await expect(page.getByText("Tell Saathi what you need and your budget, in English or Hinglish.")).toBeVisible();
    await expect(page.getByLabel("Message")).toBeVisible();
    await expect(prompts(page)).toHaveCount(4);
    await expect(categories(page)).toHaveText(CATEGORY_NAMES);
    // No chat or results panel until the conversation has a message.
    await expect(page.getByRole("region", { name: "Chat" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Results" })).toHaveCount(0);
  }
});

test("the header's about link opens the about page in a new tab, as text, an icon button or not at all by width", async ({ page }) => {
  await openLanding(page);
  const link = page.getByRole("banner").getByRole("link", { name: "How Saathi works" });
  await expect(link).toHaveAttribute("href", "/about/");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const wordmarkFits = () => page.getByRole("banner").getByText("Saathi", { exact: true }).evaluate((el) => el.scrollWidth <= el.clientWidth);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(link.getByText("How Saathi works")).toBeInViewport(); // text from 640 px
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(link).toBeVisible();
  expect(await link.evaluate((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight])).toEqual([32, 32]); // an icon button below that
  expect(await wordmarkFits()).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(link).toBeVisible();
  expect(await wordmarkFits()).toBe(true);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(link).toBeHidden(); // no room below 360 px
  expect(await wordmarkFits()).toBe(true);
});

test("sending from the composer replaces the landing and focuses the chat's composer", async ({ page }) => {
  await openLanding(page);
  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  await expect(heading(page)).toHaveCount(0); // at once, not after the reply
  await expect(message(page, "warm jacket under 8k")).toBeVisible();
  const composer = page.getByRole("region", { name: "Chat" }).getByLabel("Message");
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("");
  await message(page, LADAKH_TURN.reply).waitFor();
});

test("a prompt card sends its message and focuses the message list", async ({ page }) => {
  await openLanding(page);
  await prompts(page).filter({ hasText: "Gaming laptop" }).click();
  await expect(heading(page)).toHaveCount(0);
  await expect(message(page, "Gaming laptop with 16 GB RAM and dedicated graphics")).toBeVisible();
  await expect(page.getByRole("list", { name: "Conversation" })).toBeFocused();
  await message(page, LADAKH_TURN.reply).waitFor();
});

test("the kurta prompt card and a category chip send their documented messages", async ({ page }) => {
  await openLanding(page);
  await prompts(page).filter({ hasText: "Shaadi ke liye silk kurta" }).click();
  await expect(message(page, "Shaadi ke liye silk kurta, 5k tak")).toBeVisible();
  await message(page, LADAKH_TURN.reply).waitFor();

  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await categories(page).filter({ hasText: "Kitchen appliances" }).click();
  await expect(heading(page)).toHaveCount(0);
  await expect(message(page, "Show me kitchen appliances")).toBeVisible();
  await expect(page.getByRole("list", { name: "Conversation" })).toBeFocused();
});

test("a new chat brings the landing back", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await expect(heading(page)).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await expect(heading(page)).toBeVisible();
  await expect(prompts(page)).toHaveCount(4);
  await expect(chatRows(page)).toHaveCount(0);
});

test("the main area stays empty while a restore loads", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await page.route(`${API}/sessions/*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fallback();
  });
  // Record what the main area first shows: it must be the restored conversation, never the landing.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const main = document.querySelector("main");
      const w = window as unknown as { first?: string };
      if (main && main.childElementCount > 0 && !w.first) w.first = main.querySelector("h1") ? "landing" : main.querySelector("[aria-label=Chat]") ? "chat" : "other";
    }).observe(document, { subtree: true, childList: true });
  });
  await page.reload();
  await expect(message(page, LADAKH_TURN.reply)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { first?: string }).first)).toBe("chat");
});

test("an empty composer is one line tall in both styles", async ({ page }) => {
  await openLanding(page);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByLabel("Message")).toHaveJSProperty("offsetHeight", 40); // a 24 px line and 8 px above and below
  }
  // Cleared where the placeholder wraps: the placeholder counts toward scrollHeight, so it must not size the box.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByLabel("Message").fill("x");
  await page.getByLabel("Message").fill("");
  await expect(page.getByLabel("Message")).toHaveJSProperty("offsetHeight", 40);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel("Message").fill("a\nb\nc");
  expect(await page.getByLabel("Message").evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(3 * 24 + 16); // it grows with its text
  await page.getByLabel("Message").press("Enter");
  const composer = page.getByRole("region", { name: "Chat" }).getByLabel("Message");
  await expect(composer).toHaveJSProperty("offsetHeight", 40);
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(composer).toHaveJSProperty("offsetHeight", 40);
});

test("text typed on the landing survives crossing the 1024 px breakpoint", async ({ page }) => {
  await openLanding(page);
  await page.getByLabel("Message").fill("half-typed");
  for (const width of [900, 1100, 375, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByLabel("Message")).toHaveValue("half-typed");
  }
});

test("a first visit shows the landing while its session is created, and keeps what was typed meanwhile", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.route(`${API}/sessions`, async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fallback();
  });
  await page.goto("/");
  await expect(heading(page)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("sessionId"))).toBeNull(); // shown before the session exists
  await expect(prompts(page).first()).toBeDisabled();
  await page.getByLabel("Message").fill("half-typed");
  await sessionReady(page);
  await expect(prompts(page).first()).toBeEnabled();
  await expect(page.getByLabel("Message")).toHaveValue("half-typed");
});

test("without a session, the send button, prompt cards and category chips are inactive", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.route(`${API}/sessions`, (route) =>
    route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.goto("/");
  await expect(heading(page)).toBeVisible();
  await expect(page.getByRole("status").getByText("Can't reach the store right now. Reload the page to try again.")).toBeVisible();
  for (const button of await prompts(page).all()) await expect(button).toBeDisabled();
  for (const button of await categories(page).all()) await expect(button).toBeDisabled();
  await page.getByLabel("Message").fill("warm jacket");
  await expect(page.getByRole("button", { name: "Send" })).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Message").press("Enter");
  await expect(heading(page)).toBeVisible(); // nothing was sent
});
