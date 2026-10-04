// Chat behaviors that once regressed: the composer draft, "Jump to latest" and the results sheet across breakpoints.
import { expect, test } from "@playwright/test";

import { API, LADAKH_TURN, WATERPROOF_TURN, message, mockApi, send, sessionReady } from "./mock-api";

test("a suggestion chip keeps a half-typed draft", async ({ page }) => {
  await mockApi(page, [LADAKH_TURN, WATERPROOF_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await page.getByLabel("Message").fill("half-typed");
  await page.getByRole("button", { name: "Only waterproof" }).click();
  await message(page, WATERPROOF_TURN.reply).waitFor();
  await expect(page.getByLabel("Message")).toHaveValue("half-typed");
});

test("New chat clears \"Jump to latest\" left over from scrolling up", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  for (let i = 0; i < 3; i++) await send(page, "warm jacket ".repeat(40), LADAKH_TURN);
  await page.getByRole("region", { name: "Chat" }).locator(".overflow-y-auto").evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("button", { name: "Jump to latest" })).toHaveCount(0);
});

test("the results sheet stays usable after widening past the narrow layout", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", LADAKH_TURN);
  await page.getByRole("button", { name: /^View all/ }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  const sheet = page.getByRole("dialog", { name: "All results" });
  await expect(sheet).toBeVisible(); // never an invisible modal that leaves the page inert
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByLabel("Message").click();
  await expect(page.getByLabel("Message")).toBeFocused();
});

test("Jump to latest jumps without smooth scrolling under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 500 });
  await mockApi(page, [LADAKH_TURN]);
  await page.goto("/");
  for (let i = 0; i < 3; i++) await send(page, "warm jacket ".repeat(40), LADAKH_TURN);
  const list = page.getByRole("region", { name: "Chat" }).locator(".overflow-y-auto");
  await list.evaluate((el) => el.scrollTo({ top: 0 }));
  await page.getByRole("button", { name: "Jump to latest" }).click();
  // Read in the same task as nothing else: a smooth scroll would still be near the top.
  expect(await list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2);
});

test("a New chat that can't create a session keeps the running turn", async ({ page }) => {
  await mockApi(page, [{ ...LADAKH_TURN, hang: true }]);
  await page.goto("/");
  await sessionReady(page);
  await page.getByLabel("Message").fill("warm jacket under 8k");
  await page.getByLabel("Message").press("Enter");
  const status = page.getByRole("region", { name: "Chat" }).getByText("Thinking");
  await expect(status).toBeVisible();
  const busy = "The store is busy right now. Try again in a moment.";
  await page.route(`${API}/sessions`, (route) =>
    route.fulfill({
      status: 503,
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "server_busy", message: busy } }),
    }),
  );
  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("status").getByText(busy)).toBeVisible();
  await expect(status).toBeVisible(); // the turn is still running
  await expect(message(page, "warm jacket under 8k")).toBeVisible();
});
