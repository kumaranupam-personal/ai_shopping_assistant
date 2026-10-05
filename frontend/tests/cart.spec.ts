// The cart in the browser (docs/07-evaluation.md; docs/06-frontend.md, Cart).
import { expect, test, type Page } from "@playwright/test";

import type { CartItem } from "../src/cart";
import { API, LADAKH_TURN, mockApi, send, sessionReady, type ScriptedTurn } from "./mock-api";
import products from "./fixtures/products.json" with { type: "json" };

// The Ladakh jackets plus a watch, which has no sizes. JKT-00005 is out of stock.
const TURN: ScriptedTurn = { ...LADAKH_TURN, cards: [products["WCH-00001"].card] };
const FLEECE = products["JKT-00002"]; // sizes S to XXL; beige, navy, maroon
const RAIN = products["JKT-00005"]; // out of stock
const WATCH = products["WCH-00001"]; // no sizes; silver, black
const DENIM = products["JKT-00006"];

const cartButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Cart/ });
const cartPanel = (page: Page) => page.getByRole("dialog", { name: "Cart" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Product details" });
const action = (page: Page) => drawer(page).getByRole("button", { name: /^(Out of stock|Select a size|Added · View cart|Add to cart)$/ });
const rows = (page: Page) => cartPanel(page).getByRole("list", { name: "Items" }).getByRole("listitem");
const subtotal = (page: Page) => cartPanel(page).getByText("Subtotal").locator("xpath=following-sibling::*[1]");
const undoRow = (page: Page) => cartPanel(page).getByRole("status");
const undoText = (page: Page) => cartPanel(page).getByText(/^Removed /);
const card = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title}, ₹`) }).filter({ visible: true });
const names = (page: Page) => rows(page).getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
const storedCart = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("cart") ?? "null"));

/** Puts items in the cart before the app first loads in this tab (not again on reload). */
async function seedCart(page: Page, items: CartItem[] | string) {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem("cart-seeded")) return;
    sessionStorage.setItem("cart-seeded", "1");
    localStorage.setItem("cart", typeof value === "string" ? value : JSON.stringify(value));
  }, items);
}

async function openDrawer(page: Page, title: string) {
  await card(page, title).click();
  await expect(action(page)).toBeVisible(); // the product has loaded
}

async function openCart(page: Page) {
  await cartButton(page).click();
  await expect(cartPanel(page)).toBeVisible();
}

test("the action bar shows each state, a size must be chosen, and a second size adds a second item", async ({ page }) => {
  await mockApi(page, [TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", TURN);
  await expect(cartButton(page)).toHaveAccessibleName("Cart");

  await openDrawer(page, RAIN.title);
  await expect(action(page)).toHaveText("Out of stock");
  await expect(action(page)).toHaveAttribute("aria-disabled", "true");
  await action(page).click({ force: true }); // aria-disabled: Playwright won't click it otherwise
  await expect(cartButton(page)).toHaveAccessibleName("Cart");
  await page.keyboard.press("Escape");

  await openDrawer(page, FLEECE.title);
  await expect(action(page)).toHaveText("Select a size");
  await expect(action(page)).toHaveAttribute("aria-disabled", "true");
  await expect(drawer(page).getByRole("radiogroup", { name: "Size" }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(drawer(page).getByRole("radio", { name: "Beige" })).toBeChecked(); // the first color
  await expect(drawer(page).getByRole("heading", { name: "Color: Beige" })).toBeVisible();
  await action(page).click({ force: true }); // aria-disabled: Playwright won't click it otherwise
  await expect(cartButton(page)).toHaveAccessibleName("Cart");

  await drawer(page).getByRole("radio", { name: "M", exact: true }).check();
  await expect(action(page)).toHaveText("Add to cart");
  await expect(action(page)).not.toHaveAttribute("aria-disabled");
  await action(page).click();
  await expect(action(page)).toHaveText("Added · View cart");
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 1 item");

  // Arrow keys move the choice within a group.
  await drawer(page).getByRole("radio", { name: "M", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(drawer(page).getByRole("radio", { name: "L", exact: true })).toBeChecked();
  await expect(action(page)).toHaveText("Add to cart");
  await action(page).click();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 2 items");

  await drawer(page).getByRole("radio", { name: "Navy" }).check();
  await expect(drawer(page).getByRole("heading", { name: "Color: Navy" })).toBeVisible();
  await expect(action(page)).toHaveText("Add to cart"); // the same size in another color is another item
  expect(await storedCart(page)).toEqual([
    { id: FLEECE.id, size: "M", color: "beige" },
    { id: FLEECE.id, size: "L", color: "beige" },
  ]);
});

test("a product without sizes can be added at once", async ({ page }) => {
  await mockApi(page, [TURN]);
  await page.goto("/");
  await send(page, "warm jacket under 8k", TURN);
  await openDrawer(page, WATCH.title);
  await expect(drawer(page).getByRole("radiogroup", { name: "Size" })).toHaveCount(0);
  await expect(action(page)).toHaveText("Add to cart");
  await action(page).click();
  await expect(action(page)).toHaveText("Added · View cart");
  expect(await storedCart(page)).toEqual([{ id: WATCH.id, size: null, color: "silver" }]);
});

test("the panel lists items with size, color and current price, and the subtotal leaves out out-of-stock rows", async ({ page }) => {
  await seedCart(page, [
    { id: FLEECE.id, size: "M", color: "navy" },
    { id: RAIN.id, size: "S", color: "brown" },
    { id: WATCH.id, size: null, color: "silver" },
  ]);
  await mockApi(page, []);
  // The fleece's price changed since it was added: the row shows the new one.
  await page.route(`${API}/products/${FLEECE.id}`, (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "application/json",
      body: JSON.stringify({ ...FLEECE, card: { ...FLEECE.card, price: 3999 } }),
    }),
  );
  await page.goto("/");
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 3 items");
  await openCart(page);
  await expect.poll(() => names(page)).toEqual([
    `${FLEECE.title}, M, Navy, ₹3,999`,
    `Remove ${FLEECE.title}`,
    `${RAIN.title}, S, Brown, ₹3,629`,
    `Remove ${RAIN.title}`,
    `${WATCH.title}, Silver, ₹16,969`,
    `Remove ${WATCH.title}`,
  ]);
  await expect(rows(page).nth(0)).toContainText("M · Navy");
  await expect(rows(page).nth(2)).toContainText("Silver");
  await expect(rows(page).nth(1).getByText("Out of stock")).toBeVisible();
  await expect(rows(page).nth(0).getByText("Out of stock")).toHaveCount(0);
  await expect(subtotal(page)).toHaveText("₹20,968"); // 3,999 + 16,969, without the out-of-stock jacket
});

test("a row opens its product with that size and color selected", async ({ page }) => {
  await seedCart(page, [
    { id: FLEECE.id, size: "M", color: "navy" },
    { id: WATCH.id, size: null, color: "black" },
  ]);
  await mockApi(page, []);
  await page.goto("/");
  await openCart(page);
  await rows(page).getByRole("button", { name: new RegExp(`^${FLEECE.title}`) }).click();
  await expect(cartPanel(page)).toHaveCount(0); // one panel at a time
  await expect(action(page)).toHaveText("Added · View cart");
  await expect(drawer(page).getByRole("radio", { name: "M", exact: true })).toBeChecked();
  await expect(drawer(page).getByRole("radio", { name: "Navy" })).toBeChecked();

  await action(page).click(); // back to the cart
  await expect(drawer(page)).toHaveCount(0);
  await rows(page).getByRole("button", { name: new RegExp(`^${WATCH.title}`) }).click();
  await expect(drawer(page).getByRole("radio", { name: "Black" })).toBeChecked();
});

test("removing updates the count and subtotal, Undo puts the item back in place, and the last removal shows the empty state", async ({ page }) => {
  await seedCart(page, [
    { id: FLEECE.id, size: "M", color: "navy" },
    { id: DENIM.id, size: "S", color: "grey" },
    { id: WATCH.id, size: null, color: "silver" },
  ]);
  await mockApi(page, []);
  await page.goto("/");
  await openCart(page);
  await expect(subtotal(page)).toHaveText("₹22,647"); // 4,089 + 1,589 + 16,969

  await cartPanel(page).getByRole("button", { name: `Remove ${DENIM.title}` }).click();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 2 items");
  await expect(subtotal(page)).toHaveText("₹21,058");
  await expect(undoRow(page)).toHaveText(`Removed ${DENIM.title}.Undo`);
  await expect(undoRow(page).getByRole("button", { name: "Undo" })).toBeFocused(); // the removed row took the focused button with it
  await page.keyboard.press("Enter"); // so the keyboard undoes it at once
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 3 items");
  await expect(rows(page).nth(1)).toContainText(DENIM.title); // back in its place
  await expect(rows(page).nth(1).getByRole("button").first()).toBeFocused(); // and focus follows it
  await expect(undoText(page)).toHaveCount(0);

  // A newer removal replaces the undo row.
  await cartPanel(page).getByRole("button", { name: `Remove ${WATCH.title}` }).click();
  await cartPanel(page).getByRole("button", { name: `Remove ${FLEECE.title}` }).click();
  await expect(undoRow(page)).toHaveText(`Removed ${FLEECE.title}.Undo`);
  await expect(subtotal(page)).toHaveText("₹1,589");

  await cartPanel(page).getByRole("button", { name: `Remove ${DENIM.title}` }).click();
  await expect(cartButton(page)).toHaveAccessibleName("Cart");
  await expect(cartPanel(page).getByText("Your cart is empty.")).toBeVisible();
  await expect(cartPanel(page).getByRole("button", { name: "Checkout" })).toHaveCount(0); // no footer
  await cartPanel(page).getByRole("button", { name: "Keep shopping" }).click();
  await expect(cartPanel(page)).toHaveCount(0);
  await expect(cartButton(page)).toBeFocused();
});

test("the undo row goes after 5 seconds", async ({ page }) => {
  await seedCart(page, [{ id: DENIM.id, size: "S", color: "grey" }]);
  await mockApi(page, []);
  await page.goto("/");
  await openCart(page);
  await cartPanel(page).getByRole("button", { name: `Remove ${DENIM.title}` }).click();
  await expect(undoRow(page)).toHaveText(`Removed ${DENIM.title}.Undo`);
  await page.waitForTimeout(4000);
  await expect(undoText(page)).toBeVisible();
  await expect(undoRow(page).getByRole("button", { name: "Undo" })).toBeFocused();
  await expect(undoText(page)).toHaveCount(0, { timeout: 3000 });
  await expect(cartPanel(page).getByRole("heading", { name: "Your cart" })).toBeFocused(); // focus isn't dropped with the row
});

test("a removed catalog product is dropped, and a failed fetch shows its row message", async ({ page }) => {
  await seedCart(page, [
    { id: "JKT-99999", size: "M", color: "red" }, // no longer in the catalog
    { id: products["JKT-00003"].id, size: "M", color: "blue" },
    { id: DENIM.id, size: "S", color: "grey" },
  ]);
  await mockApi(page, []);
  await page.route(`${API}/products/JKT-00003`, (route) => route.fulfill({ status: 500, headers: { "Access-Control-Allow-Origin": "*" } }));
  await page.goto("/");
  await openCart(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 2 items");
  expect((await storedCart(page)).map((item: CartItem) => item.id)).toEqual(["JKT-00003", DENIM.id]);

  const failed = rows(page).nth(0);
  await expect(failed).toContainText("Couldn't load this item.");
  await expect(failed.getByRole("button")).toHaveCount(1); // it doesn't open the drawer
  await expect(failed.getByRole("button")).toHaveAccessibleName("Remove item");
  await expect(subtotal(page)).toHaveText("₹1,589");
  await failed.getByRole("button", { name: "Remove item" }).click();
  await expect(undoRow(page)).toHaveText("Removed item.Undo");
});

test("the cart survives a reload and a new chat", async ({ page }) => {
  await mockApi(page, [TURN]);
  await page.goto("/");
  await sessionReady(page);
  await openDrawer(page, FLEECE.title);
  await drawer(page).getByRole("radio", { name: "XL", exact: true }).check();
  await action(page).click();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 1 item");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 1 item");
  await send(page, "warm jacket under 8k", TURN);
  await page.getByRole("banner").getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 1 item");
  expect(await storedCart(page)).toEqual([{ id: FLEECE.id, size: "XL", color: "beige" }]);
});

test("a grid card in the cart shows the mark, and a strip card doesn't", async ({ page }) => {
  await seedCart(page, [{ id: FLEECE.id, size: "M", color: "navy" }]);
  await mockApi(page, []);
  await page.goto("/");
  const inCart = page.getByRole("button", { name: `${FLEECE.title}, ₹4,089, in cart` });
  await expect(inCart).toBeVisible();
  await expect(inCart.locator("[data-in-cart] svg.lucide-check")).toBeVisible();
  const other = card(page, products["JKT-00001"].title);
  await expect(other).toHaveAccessibleName(/₹5,299$/);
  await expect(other.locator("[data-in-cart]")).toHaveCount(0);

  await page.setViewportSize({ width: 400, height: 800 });
  const strip = card(page, FLEECE.title);
  await expect(strip).toHaveAccessibleName(`${FLEECE.title}, ₹4,089`);
  await expect(strip.locator("[data-in-cart]")).toHaveCount(0);
});

test("Checkout does nothing and explains why", async ({ page }) => {
  await seedCart(page, [{ id: DENIM.id, size: "S", color: "grey" }]);
  await mockApi(page, []);
  await page.goto("/");
  await openCart(page);
  const checkout = cartPanel(page).getByRole("button", { name: "Checkout" });
  await expect(checkout).toHaveAttribute("aria-disabled", "true");
  await expect(checkout).toHaveAccessibleDescription("Demo store. Checkout isn't available.");
  await expect(subtotal(page)).toHaveText("₹1,589");
  await checkout.click({ force: true });
  await expect(cartPanel(page)).toBeVisible();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 1 item");
});

test("focus returns to the opener, or to the cart button when the opener is gone", async ({ page }) => {
  await seedCart(page, [{ id: DENIM.id, size: "S", color: "grey" }]);
  await mockApi(page, []);
  await page.goto("/");

  await openDrawer(page, FLEECE.title); // a card opens the drawer
  await page.keyboard.press("Escape");
  await expect(card(page, FLEECE.title)).toBeFocused();

  await openCart(page); // the cart button opens the cart
  await page.keyboard.press("Escape");
  await expect(cartButton(page)).toBeFocused();

  await openCart(page); // a cart row opens the drawer, and the row is gone
  await rows(page).getByRole("button", { name: new RegExp(`^${DENIM.title}`) }).click();
  await expect(action(page)).toHaveText("Added · View cart");
  await drawer(page).getByRole("button", { name: "Close" }).click();
  await expect(cartButton(page)).toBeFocused();

  await openDrawer(page, products["JKT-00001"].title); // "View cart" opens the cart, and the drawer is gone
  await drawer(page).getByRole("radio", { name: "S", exact: true }).check();
  await action(page).click();
  await expect(action(page)).toHaveText("Added · View cart");
  await action(page).click();
  await expect(cartPanel(page)).toBeVisible();
  await cartPanel(page).getByRole("button", { name: "Close" }).click();
  await expect(cartButton(page)).toBeFocused();
});

test("the cart sends no request other than GET /api/products/{id}", async ({ page }) => {
  await seedCart(page, [{ id: DENIM.id, size: "S", color: "grey" }]);
  await mockApi(page, []);
  await page.goto("/");
  await sessionReady(page);
  await expect(page.getByRole("heading", { name: "Popular picks" })).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => request.url().startsWith(API) && requests.push(`${request.method()} ${new URL(request.url()).pathname}`));

  await openDrawer(page, FLEECE.title);
  await drawer(page).getByRole("radio", { name: "M", exact: true }).check();
  await action(page).click();
  await expect(action(page)).toHaveText("Added · View cart");
  await action(page).click(); // View cart
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).getByRole("button", { name: /^Remove/ })).toHaveCount(2); // both loaded
  await cartPanel(page).getByRole("button", { name: `Remove ${DENIM.title}` }).click();
  await undoRow(page).getByRole("button", { name: "Undo" }).click();
  await cartPanel(page).getByRole("button", { name: "Checkout" }).click({ force: true });
  await rows(page).getByRole("button", { name: new RegExp(`^${DENIM.title}`) }).click();
  await expect(action(page)).toHaveText("Added · View cart");
  await page.keyboard.press("Escape");

  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((request) => !/^GET \/api\/products\/[^/]+$/.test(request))).toEqual([]);
});

test("an unreadable saved cart counts as empty, and blocked storage keeps the cart for the page", async ({ page }) => {
  await seedCart(page, '{"not": "a cart"}');
  await mockApi(page, []);
  await page.goto("/");
  await expect(cartButton(page)).toHaveAccessibleName("Cart");

  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", { get: blocked });
  });
  await page.reload();
  await expect(cartButton(page)).toHaveAccessibleName("Cart");
  await openDrawer(page, FLEECE.title);
  await drawer(page).getByRole("radio", { name: "M", exact: true }).check();
  await action(page).click();
  await expect(cartButton(page)).toHaveAccessibleName("Cart, 1 item");
});

test("a change in one tab shows in another open tab", async ({ page, context }) => {
  await mockApi(page, []);
  await page.goto("/");
  const other = await context.newPage();
  await mockApi(other, []);
  await other.goto("/");
  await expect(cartButton(other)).toHaveAccessibleName("Cart");

  await openDrawer(page, FLEECE.title);
  await drawer(page).getByRole("radio", { name: "M", exact: true }).check();
  await action(page).click();
  await expect(cartButton(other)).toHaveAccessibleName("Cart, 1 item");
  await expect(other.getByRole("button", { name: `${FLEECE.title}, ₹4,089, in cart` })).toBeVisible();
});
