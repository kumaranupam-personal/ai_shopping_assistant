// The typing indicator and the card entrance (docs/06-frontend.md, Motion).
import { expect, test, type Locator, type Page } from "@playwright/test";

import { FEATURED, LADAKH_TURN, WATERPROOF_TURN, message, mockApi, send, sessionReady } from "./mock-api";

const typingDots = (page: Page) => page.getByRole("region", { name: "Chat" }).locator(".animate-typing");
// The wide grid's cards; the hidden strip has its own copies.
const gridCards = (page: Page) => page.getByRole("region", { name: "Results" }).locator(".animate-rise").filter({ visible: true });
const delays = (page: Page) => gridCards(page).evaluateAll((cards) => cards.map((card) => getComputedStyle(card).animationDelay));
/** The distinct "duration delay iterations" of the elements' animations. */
const timings = (elements: Locator) =>
  elements.evaluateAll((els) => {
    const timing = (el: Element) => {
      const style = getComputedStyle(el);
      return `${style.animationDuration} ${style.animationDelay} ${style.animationIterationCount}`;
    };
    return [...new Set(els.map(timing))];
  });

test("the typing indicator shows while a turn waits for its reply", async ({ page }) => {
  await mockApi(page, [{ ...LADAKH_TURN, hang: true }]);
  await page.goto("./");
  await sessionReady(page);
  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  await expect(typingDots(page)).toHaveCount(3);
});

test("when the reply arrives the indicator goes, and the new cards enter one after another, the last by 480 ms", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("./");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await expect(typingDots(page)).toHaveCount(0);
  expect(await delays(page)).toEqual(["0s", "0.06s", "0.12s", "0.18s", "0.24s", "0.3s", "0.36s", "0.42s"]);
});

// Cards playing the entrance anywhere in the main area: the landing has no Results region.
const enteringCards = (page: Page) => page.locator("main .animate-rise").filter({ visible: true });

test("the featured cards enter on the landing, and leaving the landing doesn't replay it", async ({ page }) => {
  await mockApi(page, [{ ...LADAKH_TURN, hang: true }]);
  await page.goto("./");
  await expect(enteringCards(page)).toHaveCount(FEATURED.products.length); // the featured list's first appearance
  await sessionReady(page);
  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  await expect(page.getByRole("region", { name: "Results" }).getByRole("heading", { name: FEATURED.headline })).toBeVisible();
  await expect(enteringCards(page)).toHaveCount(0);
});

test("reselecting an earlier result set, restoring a session or a new chat doesn't replay the entrance", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN, WATERPROOF_TURN]);
  await page.goto("./");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await send(page, "only waterproof", WATERPROOF_TURN);
  await expect(gridCards(page)).toHaveCount(WATERPROOF_TURN.ids.length);

  await page.getByRole("button", { name: `Show 8 products: ${LADAKH_TURN.headline}` }).click();
  await expect(page.getByRole("heading", { name: LADAKH_TURN.headline })).toBeVisible();
  await expect(gridCards(page)).toHaveCount(0);
  await page.getByRole("button", { name: `Show 2 products: ${WATERPROOF_TURN.headline}` }).click(); // back to the newest set
  await expect(page.getByRole("heading", { name: WATERPROOF_TURN.headline })).toBeVisible();
  await expect(gridCards(page)).toHaveCount(0);

  await page.reload();
  await expect(message(page, WATERPROOF_TURN.reply)).toBeVisible();
  await expect(gridCards(page)).toHaveCount(0);

  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: FEATURED.headline })).toBeVisible();
  await expect(enteringCards(page)).toHaveCount(0);
});

test("under reduced motion, cards appear at once, the typing dots stay still and a hovered card doesn't rise", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page, [LADAKH_TURN, { ...WATERPROOF_TURN, hang: true }]);
  await page.goto("./");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  expect(await timings(gridCards(page))).toEqual(["0s 0s 1"]);
  const card = page.getByRole("region", { name: "Results" }).getByRole("button", { name: /, ₹/ }).filter({ visible: true }).first();
  await card.hover();
  expect(await card.evaluate((el) => getComputedStyle(el).translate)).toBe("none");

  await page.getByLabel("Message").fill("only waterproof");
  await page.getByLabel("Message").press("Enter");
  await expect(typingDots(page)).toHaveCount(3);
  expect(await timings(typingDots(page))).toEqual(["0s 0s 1"]);
});
