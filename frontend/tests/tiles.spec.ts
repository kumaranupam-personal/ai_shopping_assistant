// Product tiles (docs/06-frontend.md, Visual design): a card without an image, or whose image fails, shows its tile.
import { expect, test } from "@playwright/test";

import { LADAKH_TURN, mockApi, send } from "./mock-api";

for (const colorScheme of ["light", "dark"] as const) {
  test(`cards without an image, or whose image fails, show a tile in their tile colour (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await mockApi(page, [LADAKH_TURN]);
    await page.route("https://placehold.co/**", (route) => route.fulfill({ status: 404 })); // the one card with an image fails
    await page.goto("/");
    await send(page, "warm jacket under 8k", LADAKH_TURN);

    const tiles = page.getByRole("region", { name: "Results" }).locator("[data-tile]").filter({ visible: true });
    await expect(tiles).toHaveCount(LADAKH_TURN.ids.length);
    await expect(tiles.locator("svg.lucide-shirt")).toHaveCount(LADAKH_TURN.ids.length); // the jackets' category icon
    // The tile colour is the first one that isn't neutral, so the beige, navy and maroon jacket is navy.
    await expect(tiles.and(page.locator('[data-tile="navy"]'))).toHaveText("Navy · 3 colours"); // its image failed to load
    await expect(tiles.and(page.locator('[data-tile="pink"]'))).toHaveText("Pink · 2 colours"); // grey, then pink
    await expect(tiles.and(page.locator('[data-tile="black"]'))).toHaveText("Black · 2 colours"); // all neutral: the first
    await expect(tiles.and(page.locator('[data-tile="yellow"]'))).toHaveText("Yellow"); // one colour: no count

    const wash = (color: string) => tiles.and(page.locator(`[data-tile="${color}"]`)).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(new Set([await wash("yellow"), await wash("olive"), await wash("black")]).size).toBe(3);

    await page.setViewportSize({ width: 400, height: 800 }); // the narrow strip shows the icon on the wash
    await expect(tiles).toHaveCount(LADAKH_TURN.ids.length);
    await expect(tiles.locator("svg.lucide-shirt")).toHaveCount(LADAKH_TURN.ids.length);
  });
}
