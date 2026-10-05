// Product tiles (docs/06-frontend.md, Visual design > Product tiles): a card without an image, or whose image fails,
// shows a flat tile with its category's icon and a dot for each of its colours, in order.
import { expect, test } from "@playwright/test";

import { LADAKH_TURN, mockApi, send } from "./mock-api";
import products from "./fixtures/products.json" with { type: "json" };

for (const colorScheme of ["light", "dark"] as const) {
  test(`cards without an image, or whose image fails, show their category's icon and colour dots (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await mockApi(page, [LADAKH_TURN]);
    await page.route("https://placehold.co/**", (route) => route.fulfill({ status: 404 })); // the one card with an image fails
    await page.goto("/");
    await send(page, "warm jacket under 8k", LADAKH_TURN);

    const results = page.getByRole("region", { name: "Results" });
    const tiles = results.locator("[data-tile]").filter({ visible: true });
    await expect(tiles).toHaveCount(LADAKH_TURN.ids.length);
    await expect(tiles.locator("svg.lucide-shirt")).toHaveCount(LADAKH_TURN.ids.length); // the jackets' category icon

    // Card order follows the turn, so each tile's dots can be read against its product's colours.
    const dots = await tiles.evaluateAll((els) => els.map((el) => [...el.querySelectorAll<HTMLElement>("span span")].map((dot) => dot.style.backgroundColor)));
    expect(dots).toEqual(LADAKH_TURN.ids.map((id) => products[id].card.colors));

    // A flat tile background and a muted icon, both from the tokens; no colour label.
    const look = await tiles.first().evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      document.body.append(probe);
      const resolve = (token: string) => ((probe.style.color = root.getPropertyValue(token)), getComputedStyle(probe).color);
      const result = {
        background: getComputedStyle(el).backgroundColor === resolve("--tile"),
        icon: getComputedStyle(el).color === resolve("--fg-muted"),
        dotBorder: getComputedStyle(el.querySelector("span span")!).borderTopColor === resolve("--line-strong"),
        text: el.textContent,
      };
      probe.remove();
      return result;
    });
    expect(look).toEqual({ background: true, icon: true, dotBorder: true, text: "" });

    await page.setViewportSize({ width: 400, height: 800 }); // the narrow strip shows the icon alone
    await expect(tiles).toHaveCount(LADAKH_TURN.ids.length);
    await expect(tiles.locator("svg.lucide-shirt")).toHaveCount(LADAKH_TURN.ids.length);
    await expect(tiles.locator("span")).toHaveCount(0);
  });
}
