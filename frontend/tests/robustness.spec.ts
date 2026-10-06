// Bad data from the API never ends the chat or blanks the page (docs/06-frontend.md, Images, Render failure, Malformed events).
import { expect, test, type Page } from "@playwright/test";

import { API, chatRows, message, mockApi, sessionReady } from "./mock-api";
import products from "./fixtures/products.json" with { type: "json" };

const CORS = { "Access-Control-Allow-Origin": "*" };
const FLEECE = products["JKT-00002"].card; // the one recorded product with an image

/** Answers every chat request with these raw stream frames. */
async function streamFrames(page: Page, body: string) {
  await page.route(`${API}/chat`, (route) =>
    route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ status: 200, headers: CORS, contentType: "text/event-stream", body }),
  );
}

async function sendMessage(page: Page, text: string) {
  await sessionReady(page);
  await page.getByLabel("Message").fill(text);
  await page.getByLabel("Message").press("Enter");
}

test("malformed stream frames are skipped and the rest of the turn is shown", async ({ page }) => {
  await mockApi(page, []);
  await streamFrames(
    page,
    "event: text\ndata: {not json\n\n" +
      'event: status\ndata: {"text": 5}\n\n' +
      'event: text\ndata: {"text": ["a"]}\n\n' +
      'event: products\ndata: {"headline": "No products list"}\n\n' +
      'event: products\ndata: {"products": []}\n\n' + // no headline or suggestions: shown as an empty set, not thrown
      'event: text\ndata: {"text": "Here you go."}\n\n' +
      'event: done\ndata: {"turn": 1}\n\n',
  );
  await page.goto("./");
  await sendMessage(page, "warm jacket");
  await expect(message(page, "Here you go.")).toBeVisible();
  await expect(chatRows(page)).toHaveCount(3); // the user message, the empty set's marker and the one good reply: no error row
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a card missing fields renders without them, and an image_url that isn't http(s) shows the tile", async ({ page }) => {
  await mockApi(page, []);
  const { rating: _rating, highlights: _highlights, colors: _colors, ...partial } = FLEECE;
  const card = { ...partial, image_url: "javascript:alert(1)" };
  const products = { headline: "Odd cards", suggestions: [], products: [card] };
  await streamFrames(page, `event: products\ndata: ${JSON.stringify(products)}\n\nevent: done\ndata: {"turn": 1}\n\n`);
  await page.goto("./");
  await sendMessage(page, "warm jacket");
  const shown = page.getByRole("button", { name: new RegExp(`^${FLEECE.title}`) }).filter({ visible: true }).first();
  await expect(shown).toBeVisible();
  await expect(shown.locator("[data-tile]")).toHaveCount(1);
  await expect(shown.locator("img")).toHaveCount(0);
});

test("a render failure shows the fallback, and Start a new chat opens a fresh session and keeps the cart", async ({ page }) => {
  await mockApi(page, []);
  // A restored transcript entry whose text is an object, which React can't render.
  await page.route(`${API}/sessions/broken`, (route) =>
    route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ session_id: "broken", turn_count: 1, entries: [{ type: "user", text: { bad: true } }] }) }),
  );
  await page.goto("./");
  await sessionReady(page);
  const cart = JSON.stringify([{ id: "JKT-00002", size: "L", color: "navy" }]);
  await page.evaluate((cart) => {
    sessionStorage.setItem("saathi.sessionId", "broken");
    sessionStorage.setItem("saathi.pendingMessage", "half-sent");
    localStorage.setItem("saathi.cart", cart);
  }, cart);
  await page.reload();
  await expect(page.getByText("Something went wrong showing this chat.")).toBeVisible();

  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByText("Something went wrong showing this chat.")).toHaveCount(0);
  await expect(page.getByLabel("Message")).toHaveValue(""); // the pending message went with the session
  await page.waitForFunction(() => sessionStorage.getItem("saathi.sessionId")?.startsWith("session-"));
  expect(await page.evaluate(() => localStorage.getItem("saathi.cart"))).toBe(cart);
});
