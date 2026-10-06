// Product tiles in the browser (docs/07-evaluation.md; docs/06-frontend.md, Visual design > Product tiles and Cards).
import { expect, test, type Locator, type Page } from "@playwright/test";

import { LADAKH_TURN, mockApi, send, type ScriptedTurn } from "./mock-api";
import products from "./fixtures/products.json" with { type: "json" };

// The spec's own values, so the tests check the app against docs/06 rather than against itself.
const SWATCHES: Record<string, string> = {
  black: "#2B2B2B", white: "#FFFFFF", grey: "#8A8F93", navy: "#2F4170", blue: "#3F6FB5",
  red: "#B5443B", green: "#3F7D54", olive: "#7A7A3C", brown: "#7A5438", beige: "#C9B48F",
  pink: "#D58CA3", maroon: "#7A2E3A", yellow: "#D9B441", silver: "#AEB4BA", gold: "#B8923A",
};
const TILE = { light: { tile: "#EFEBE1", tint: "10%" }, dark: { tile: "#212C27", tint: "12%" } };

type Id = keyof typeof products;
const KURTA = products["KRT-00001"];
const WATCH = products["WCH-00001"];
const FLEECE = products["JKT-00002"]; // the one product with an image
// Eight jackets, a kurta and a watch, so three categories' icons show side by side.
const TURN: ScriptedTurn = { ...LADAKH_TURN, cards: [KURTA.card, WATCH.card] };
const TURN_IDS: Id[] = [...LADAKH_TURN.ids, "KRT-00001", "WCH-00001"];
const ICONS: Record<string, string> = { jackets: "lucide-jacket", kurtas: "lucide-kurta", watches: "lucide-watch" };

const results = (page: Page) => page.getByRole("region", { name: "Results" });
const cardButton = (scope: Page | Locator, title: string) => scope.getByRole("button", { name: new RegExp(`^${title}, ₹`) }).filter({ visible: true });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Product details" });

/** Resolves CSS colours in the page, so expected values compare with computed ones in the same format. */
const resolveColors = (page: Page, colors: string[]) =>
  page.evaluate((list) => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const out = list.map((c) => ((probe.style.backgroundColor = ""), (probe.style.backgroundColor = c), getComputedStyle(probe).backgroundColor));
    probe.remove();
    return out;
  }, colors);

/** What a full-size tile shows, read from the DOM. */
function readTile(tile: Locator) {
  return tile.evaluate((el) => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.append(probe);
    const token = (name: string) => ((probe.style.color = root.getPropertyValue(name)), getComputedStyle(probe).color);
    const box = el.getBoundingClientRect();
    const icon = el.querySelector("svg")!;
    const iconBox = icon.getBoundingClientRect();
    const label = el.querySelector<HTMLElement>("[data-brand-label]");
    const labelBox = label?.getBoundingClientRect();
    const labelStyle = label && getComputedStyle(label);
    const dots = [...el.querySelectorAll<HTMLElement>("[data-color]")];
    const result = {
      icon: [...icon.classList].find((c) => c.startsWith("lucide-")),
      iconColor: getComputedStyle(icon).color === token("--fg-muted"),
      iconWidth: iconBox.width / box.width,
      iconHeight: iconBox.height / box.height,
      background: getComputedStyle(el).backgroundColor,
      dots: dots.map((dot) => dot.dataset.color),
      dotFills: dots.map((dot) => getComputedStyle(dot).backgroundColor),
      dotBorders: dots.every((dot) => getComputedStyle(dot).borderTopColor === token("--line-strong")),
      label: label && {
        text: label.textContent,
        font: labelStyle!.fontFamily.startsWith('"Fraunces'),
        size: labelStyle!.fontSize,
        color: labelStyle!.color === token("--fg"),
        oneLine: labelStyle!.whiteSpace === "nowrap" && labelStyle!.textOverflow === "ellipsis",
        left: Math.round(labelBox!.left - box.left),
        bottom: Math.round(box.bottom - labelBox!.bottom),
        right: Math.round(box.right - labelBox!.right),
      },
      aspect: Math.round((box.width / box.height) * 100) / 100,
    };
    probe.remove();
    return result;
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  const { tile, tint } = TILE[colorScheme];
  const expected = async (page: Page, id: Id) => {
    const { colors } = products[id].card;
    const [background, ...dotFills] = await resolveColors(page, [`color-mix(in oklab, ${tile}, ${SWATCHES[colors[0]]} ${tint})`, ...colors.map((c) => SWATCHES[c])]);
    return { background, dotFills, dots: colors };
  };

  test(`tiles show the icon, the dots in their swatches, the tint and the brand label, with no brand line (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await mockApi(page, [TURN]);
    await page.route("https://placehold.co/**", (route) => route.fulfill({ status: 404 })); // the one image fails
    await page.goto("./");
    // Jackets and kurtas have icons of their own, unlike each other and every other category's (the chips share them).
    const chipIcons = await page.getByRole("list", { name: "Categories" }).locator("svg").evaluateAll((icons) => icons.map((icon) => icon.getAttribute("class")));
    expect(chipIcons).toHaveLength(8);
    expect(new Set(chipIcons).size).toBe(8);
    expect(chipIcons[0]).toContain(ICONS.jackets);
    expect(chipIcons[6]).toContain(ICONS.kurtas);
    await send(page, "warm jacket under 8k", TURN);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

    const tiles = results(page).locator("[data-tile]").filter({ visible: true });
    await expect(tiles).toHaveCount(TURN_IDS.length); // the failed image fell back to a tile too
    for (const [i, id] of TURN_IDS.entries()) {
      const { card } = products[id];
      const shown = await readTile(tiles.nth(i));
      expect(shown, id).toMatchObject({
        icon: ICONS[card.category],
        iconColor: true,
        dotBorders: true,
        label: { text: card.brand, font: true, size: "13px", color: true, oneLine: true, left: 10, bottom: 10 },
        aspect: 1,
        ...(await expected(page, id)),
      });
      expect(shown.iconWidth, id).toBeCloseTo(1 / 3, 1);
      expect(shown.label!.right, id).toBeGreaterThanOrEqual(40); // clear of the in-cart mark
      // The card shows no brand line under its tile.
      await expect(cardButton(results(page), card.title).locator("[data-brand-line]"), id).toBeHidden();
    }
  });

  test(`a card with an image shows the brand under it and no label (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await mockApi(page, [TURN]);
    await page.goto("./");
    await send(page, "warm jacket under 8k", TURN);
    const card = cardButton(results(page), FLEECE.title);
    await expect(card.locator("img")).toHaveJSProperty("complete", true);
    await expect(card.locator("[data-tile]")).toHaveCount(0);
    await expect(card.locator("[data-brand-label]")).toHaveCount(0);
    await expect(card.locator("[data-brand-line]")).toBeVisible();
    await expect(card.locator("[data-brand-line]")).toHaveText(FLEECE.brand);
  });

  test(`strip tiles and cart rows show the icon on the tint, with no dots or label (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() =>
      localStorage.setItem("saathi.cart", JSON.stringify([{ id: "KRT-00001", size: "M", color: "gold" }, { id: "JKT-00008", size: "L", color: "silver" }])),
    );
    await page.setViewportSize({ width: 375, height: 800 });
    await mockApi(page, [TURN]);
    await page.goto("./");
    await send(page, "warm jacket under 8k", TURN);

    const check = async (tiles: Locator, ids: Id[]) => {
      await expect(tiles).toHaveCount(ids.length);
      for (const [i, id] of ids.entries()) {
        const shown = await readTile(tiles.nth(i));
        const { background } = await expected(page, id);
        expect(shown, id).toMatchObject({ icon: ICONS[products[id].card.category], iconColor: true, background, dots: [], label: null });
        await expect(tiles.nth(i)).toHaveText("");
      }
    };
    const strip = results(page).locator("[data-tile]").filter({ visible: true });
    await check(strip, TURN_IDS.filter((id) => id !== "JKT-00002")); // the fleece's image loads
    await expect(results(page).locator("img").filter({ visible: true })).toHaveCount(1);

    await page.getByRole("banner").getByRole("button", { name: /^Cart/ }).click();
    const panel = page.getByRole("dialog", { name: "Cart" });
    await expect(panel.getByRole("button", { name: /^Remove / })).toHaveCount(2);
    await check(panel.locator("[data-tile]"), ["KRT-00001", "JKT-00008"]);
    for (const tileBox of await panel.locator("[data-tile]").all()) expect((await tileBox.boundingBox())!.width).toBe(64);
  });

  test(`the drawer shows a tile as the 2:1 banner and an image square with the brand under it (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page, [TURN]);
    await page.goto("./");
    await send(page, "warm jacket under 8k", TURN);

    await cardButton(results(page), KURTA.title).click();
    await expect(drawer(page).getByRole("button", { name: "Select a size" })).toBeVisible();
    await page.waitForFunction(() => document.querySelector("dialog[open] > div")?.getAnimations().length === 0);
    const banner = drawer(page).locator("[data-tile]");
    const shown = await readTile(banner);
    expect(shown).toMatchObject({
      icon: "lucide-kurta",
      aspect: 2,
      label: { text: KURTA.brand, font: true, size: "13px", color: true, oneLine: true, left: 10, bottom: 10 },
      ...(await expected(page, "KRT-00001")),
    });
    expect(shown.iconHeight).toBeCloseTo(0.4, 1);
    // As wide as the drawer's content, with 12 px corners.
    const frame = await banner.evaluate((el) => {
      const outer = el.parentElement!;
      const content = outer.parentElement!.getBoundingClientRect();
      return { width: Math.round(outer.getBoundingClientRect().width - content.width), radius: getComputedStyle(outer).borderTopLeftRadius };
    });
    expect(frame).toEqual({ width: 0, radius: "12px" });
    await expect(drawer(page).locator("[data-brand-line]")).toBeHidden();
    // The title, price and action bar are all in view at 1280 by 800.
    await expect(drawer(page).getByRole("heading", { name: KURTA.title })).toBeInViewport({ ratio: 1 });
    await expect(drawer(page).getByText("₹4,799", { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(drawer(page).getByRole("button", { name: "Select a size" })).toBeInViewport({ ratio: 1 });
    // The colour choices use the swatches.
    const fills = await drawer(page)
      .getByRole("radiogroup", { name: "Color" })
      .locator("[data-color]")
      .evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).backgroundColor));
    expect(fills).toEqual(await resolveColors(page, KURTA.colors.map((c) => SWATCHES[c])));
    await page.keyboard.press("Escape");

    await cardButton(results(page), FLEECE.title).click();
    const image = drawer(page).locator("img");
    await expect(image).toHaveJSProperty("complete", true);
    await expect(drawer(page).locator("[data-tile]")).toHaveCount(0);
    const box = (await image.boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(box.height));
    await expect(drawer(page).locator("[data-brand-line]")).toBeVisible();
    await expect(drawer(page).locator("[data-brand-line]")).toHaveText(FLEECE.brand);
  });
}

test("the drawer's loading skeleton has the banner's shape", async ({ page }) => {
  await mockApi(page, [TURN]);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/products/KRT-00001`, async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto("./");
  await send(page, "warm jacket under 8k", TURN);
  await cardButton(results(page), KURTA.title).click();
  const skeleton = drawer(page).getByLabel("Loading");
  await expect(skeleton).toBeVisible();
  const box = (await skeleton.boundingBox())!;
  expect(Math.round((box.width / box.height) * 100) / 100).toBe(2);
  release();
  await expect(drawer(page).locator("[data-tile]")).toBeVisible();
});
