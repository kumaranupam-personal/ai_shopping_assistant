// Session restore in the browser (docs/07-evaluation.md; docs/06-frontend.md, Session lifecycle).
import { expect, test } from "@playwright/test";

import { API, LADAKH_TURN, chatRows, message, mockApi, send, sessionReady } from "./mock-api";

test("reloading restores messages, result markers and the latest result set", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await page.reload();
  await expect(message(page, "warm jacket under 8k")).toBeVisible();
  await expect(page.getByRole("button", { name: `Showed 8 products: ${LADAKH_TURN.headline}` })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: LADAKH_TURN.headline })).toBeVisible();
  await expect(message(page, LADAKH_TURN.reply)).toBeVisible();
});

test("a new tab starts a new session", async ({ page, context }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  const other = await context.newPage();
  await mockApi(other, [LADAKH_TURN]);
  // Record what the new tab finds in sessionStorage before the app runs.
  await other.addInitScript(() => ((window as unknown as { inherited: string | null }).inherited = sessionStorage.getItem("sessionId")));
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "What are you shopping for?" }).first()).toBeVisible();
  expect(await other.evaluate(() => (window as unknown as { inherited: string | null }).inherited)).toBeNull();
  expect(await other.evaluate(() => sessionStorage.getItem("sessionId"))).toBeTruthy(); // its own, newly created
  await expect(chatRows(other)).toHaveCount(0);
});

test("an expired session shows the notice", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await sessionReady(page);
  await page.evaluate(() => sessionStorage.setItem("sessionId", "expired-session"));
  await page.reload();
  await expect(page.getByText("Your previous chat expired. Starting a new one.")).toBeVisible();
});

test("reloading during a turn puts the interrupted message back in the composer", async ({ page }) => {
  await mockApi(page, [{ ...LADAKH_TURN, hang: true }]);
  await page.goto("/");
  await sessionReady(page);
  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  await expect(message(page, "warm jacket under 8k")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Message")).toHaveValue("warm jacket under 8k");
  await expect(chatRows(page)).toHaveCount(0);
});

test("a chat at its message limit offers New chat instead of Retry", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN]);
  const limit = "This chat has reached its message limit. Start a new chat.";
  await page.route(`${API}/chat`, (route) =>
    route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({
      status: 429,
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_full", message: limit } }),
    }),
  );
  await page.goto("/");
  await sessionReady(page);
  await page.getByLabel("Message").fill("one more jacket");
  await page.getByLabel("Message").press("Enter");
  const chat = page.getByRole("region", { name: "Chat" });
  await expect(chat.getByRole("alert")).toContainText(limit);
  await expect(chat.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await chat.getByRole("button", { name: "New chat" }).click();
  await expect(chatRows(page)).toHaveCount(0);
});
