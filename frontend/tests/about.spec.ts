// The about page in the browser (docs/07-evaluation.md; docs/12-about-page.md).
import { expect, test, type Page } from "@playwright/test";

import { about } from "../src/about/content.ts";

const { turns } = about;
const replay = (page: Page) => page.getByRole("region", { name: about.replay.heading });
const advance = (page: Page) => replay(page).getByRole("button", { name: /^(Next step|Next turn|Start over)$/ });
const stepCount = (page: Page) => replay(page).getByText(/^Step \d+ of \d+$/);
const active = (page: Page) =>
  page.evaluate(() => ({
    nodes: [...document.querySelectorAll<SVGElement>("[data-node][data-active]")].map((el) => el.dataset.node!).sort(),
    edges: [...document.querySelectorAll<SVGElement>("[data-edge][data-active]")].map((el) => el.dataset.edge!).sort(),
  }));
/** The page scrolls inside its own root, not the document. */
const scrollRoot = (page: Page, top: number) => page.locator("#root > div").evaluate((el, y) => el.scrollTo({ top: y }), top);
const replayTop = (page: Page) => replay(page).evaluate((el) => Math.round(el.getBoundingClientRect().top));
const bringReplayIntoView = (page: Page) => replay(page).evaluate((el) => el.scrollIntoView({ block: "start" }));

test("shows its sections in order with the content file's text", async ({ page }) => {
  await page.goto("/about/");
  await expect(page).toHaveTitle(about.title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", about.description);
  await expect(page.getByRole("banner")).toContainText(about.header.wordmark);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(about.hero.heading);
  await expect(page.getByText(about.hero.line)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([about.replay.heading, about.features.heading, about.evidence.heading, about.closing.heading]);
  await expect(page.getByText(about.replay.line)).toBeVisible();
  await expect(replay(page).getByRole("tab")).toHaveText(turns.map((turn) => turn.tab));
  await expect(page.getByRole("img", { name: about.diagram.label })).toBeVisible();
  for (const label of Object.values(about.diagram.nodes).flat()) await expect(page.locator("svg text").getByText(label, { exact: true })).toHaveCount(1);
  await expect(page.locator("main li h3")).toHaveText(about.features.cards.map((card) => card.title));
  for (const card of about.features.cards) await expect(page.getByText(card.text)).toBeVisible();
  await expect(page.getByRole("term")).toHaveText(about.evidence.tiles.map((tile) => tile.label));
  await expect(page.getByRole("definition")).toHaveText(about.evidence.tiles.map((tile) => tile.value));
  await expect(page.getByText(about.evidence.note.text)).toBeVisible();
  await expect(page.getByText(about.closing.line)).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText(about.footer.text);
  // The sections come in the documented order.
  const order = await page.evaluate((texts) => texts.map((text) => [...document.querySelectorAll("h1, h2")].findIndex((el) => el.textContent === text)), [
    about.hero.heading,
    about.replay.heading,
    about.features.heading,
    about.evidence.heading,
    about.closing.heading,
  ]);
  expect(order).toEqual([0, 1, 2, 3, 4]);
});

test("each call to action opens the chat in a new tab, and every new-tab link is marked", async ({ page, context }) => {
  await page.goto("/about/");
  const ctas = page.getByRole("link", { name: new RegExp(`^(${about.header.cta}|${about.hero.cta}|${about.closing.cta})$`) });
  await expect(ctas).toHaveCount(3);
  for (const cta of await ctas.all()) {
    await expect(cta).toHaveAttribute("href", "/");
    await expect(cta).toHaveAttribute("target", "_blank");
    await expect(cta).toHaveAttribute("rel", /noopener/);
  }
  for (const link of await page.locator('a[target="_blank"]').all()) {
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link.locator("svg.lucide-arrow-up-right")).toHaveCount(1);
  }
  await expect(page.getByRole("link", { name: about.header.github })).toHaveCount(2); // header and footer
  for (const link of await page.getByRole("link", { name: about.header.github }).all()) await expect(link).toHaveAttribute("href", about.repositoryUrl);

  // The chat opens in a new tab; its API calls are stubbed so it stays quiet.
  await context.route("http://localhost:8000/**", (route) => route.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": "*" } }));
  for (const cta of await ctas.all()) {
    const [chat] = await Promise.all([context.waitForEvent("page"), cta.click()]);
    await chat.waitForLoadState("domcontentloaded");
    expect(new URL(chat.url()).pathname).toBe("/");
    await chat.close();
  }
});

test("the in-page links scroll the replay to the top of the view, at once under reduced motion", async ({ page }) => {
  await page.goto("/about/");
  expect(await replayTop(page)).toBeGreaterThan(200);
  await page.getByRole("link", { name: about.hero.secondary }).click();
  await expect.poll(() => replayTop(page)).toBe(16); // its scroll margin

  await scrollRoot(page, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("banner").getByRole("link", { name: about.header.howItWorks }).click();
  expect(await replayTop(page)).toBe(16); // no smooth scroll to wait for
});

test("the tabs and buttons move through every step, each lighting exactly its nodes and edges", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // no autoplay, so only the clicks move the replay
  await page.goto("/about/");
  for (const [t, turn] of turns.entries()) {
    await expect(replay(page).getByRole("tab", { name: turn.tab })).toHaveAttribute("aria-selected", "true");
    await expect(replay(page).getByRole("tabpanel").locator("p").first()).toHaveText(turn.message); // the message bubble
    await expect(replay(page).getByText(turn.summary)).toBeVisible();
    for (const [s, step] of turn.steps.entries()) {
      await expect(stepCount(page)).toHaveText(`Step ${s + 1} of ${turn.steps.length}`);
      await expect(replay(page).getByRole("heading", { level: 3 })).toHaveText(step.title);
      await expect(replay(page).getByText(step.description)).toBeVisible();
      await expect(replay(page).locator("pre")).toHaveText(step.code.replace(/\n/g, ""));
      expect(await active(page)).toEqual({ nodes: [...step.nodes].sort(), edges: [...step.edges].sort() });
      await expect(replay(page).getByRole("button", { name: "Back" })).toHaveCount(s === 0 ? 0 : 1);
      const last = s === turn.steps.length - 1;
      await expect(advance(page)).toHaveText(!last ? "Next step" : t === turns.length - 1 ? "Start over" : "Next turn");
      await advance(page).click();
    }
  }
  // Start over returns to the first turn's first step.
  await expect(replay(page).getByRole("tab", { name: turns[0].tab })).toHaveAttribute("aria-selected", "true");
  await expect(stepCount(page)).toHaveText(`Step 1 of ${turns[0].steps.length}`);

  // Back goes to the previous step.
  await advance(page).click();
  await advance(page).click();
  await replay(page).getByRole("button", { name: "Back" }).click();
  await expect(stepCount(page)).toHaveText(`Step 2 of ${turns[0].steps.length}`);

  // A tab shows its turn's first step, and the arrow keys move between tabs.
  await replay(page).getByRole("tab", { name: turns[2].tab }).click();
  await expect(stepCount(page)).toHaveText(`Step 1 of ${turns[2].steps.length}`);
  await page.keyboard.press("ArrowRight");
  await expect(replay(page).getByRole("tab", { name: turns[0].tab })).toBeFocused();
  await expect(replay(page).getByRole("tab", { name: turns[0].tab })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(replay(page).getByRole("tab", { name: turns[2].tab })).toHaveAttribute("aria-selected", "true");
});

test("a \"+\" line in a code block is marked", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/");
  const t = turns.findIndex((turn) => turn.steps.some((step) => step.code.split("\n").some((line) => line.startsWith("+"))));
  const s = turns[t].steps.findIndex((step) => step.code.split("\n").some((line) => line.startsWith("+")));
  await replay(page).getByRole("tab", { name: turns[t].tab }).click();
  for (let i = 0; i < s; i++) await advance(page).click();
  const added = replay(page).locator("pre [data-added]");
  await expect(added).toHaveCount(turns[t].steps[s].code.split("\n").filter((line) => line.startsWith("+")).length);
  const colors = await added.first().evaluate((el) => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (token: string) => ((probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(token)), getComputedStyle(probe).color);
    const result = { background: getComputedStyle(el).backgroundColor === resolve("--panel-accent"), text: getComputedStyle(el).color === resolve("--panel-accent-fg") };
    probe.remove();
    return result;
  });
  expect(colors).toEqual({ background: true, text: true });
  await expect(replay(page).locator("pre span:not([data-added])").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("a turn with a trace URL links to it, and one without shows no link", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Serve the built page with the second turn's trace URL removed, so both cases show on the published content.
  const dropped = turns[1].traceUrl!;
  await page.route("**/assets/about-*.js", async (route) => {
    const response = await route.fetch();
    // The minifier may quote the URL with backticks, double or single quotes.
    const body = ["`", '"', "'"].reduce((text, q) => text.split(q + dropped + q).join("null"), await response.text());
    await route.fulfill({ response, body });
  });
  await page.goto("/about/");
  const link = replay(page).getByRole("link", { name: about.replay.traceLink });
  for (const [t, turn] of turns.entries()) {
    await replay(page).getByRole("tab", { name: turn.tab }).click();
    await expect(replay(page).getByText(turn.summary)).toBeVisible();
    if (t === 1) {
      await expect(link).toHaveCount(0);
      continue;
    }
    await expect(link).toHaveAttribute("href", turn.traceUrl!);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

test("as published, each turn links to its trace when it has one", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/");
  for (const turn of turns) {
    await replay(page).getByRole("tab", { name: turn.tab }).click();
    await expect(replay(page).getByRole("link", { name: about.replay.traceLink })).toHaveCount(turn.traceUrl ? 1 : 0);
  }
});

test.describe("autoplay", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("runs once through the first turn when the replay comes into view, then stops on its last step", async ({ page }) => {
    await page.goto("/about/");
    await page.clock.runFor(5000);
    await expect(stepCount(page)).toHaveText(`Step 1 of ${turns[0].steps.length}`); // not in view yet
    await bringReplayIntoView(page);
    await expect.poll(async () => (await page.clock.runFor(500), stepCount(page).textContent())).toBe(`Step 2 of ${turns[0].steps.length}`);
    await page.clock.runFor(2500 * turns[0].steps.length * 2);
    await expect(stepCount(page)).toHaveText(`Step ${turns[0].steps.length} of ${turns[0].steps.length}`);
    await expect(replay(page).getByRole("tab", { name: turns[0].tab })).toHaveAttribute("aria-selected", "true");

    // Coming back into view doesn't start it again.
    await scrollRoot(page, 0);
    await page.clock.runFor(1000);
    await bringReplayIntoView(page);
    await page.clock.runFor(10_000);
    await expect(stepCount(page)).toHaveText(`Step ${turns[0].steps.length} of ${turns[0].steps.length}`);
  });

  test("stops for good on a click inside the replay", async ({ page }) => {
    await page.goto("/about/");
    await bringReplayIntoView(page);
    await expect.poll(async () => (await page.clock.runFor(500), stepCount(page).textContent())).toBe(`Step 2 of ${turns[0].steps.length}`);
    await replay(page).getByRole("heading", { level: 3 }).click();
    await page.clock.runFor(10_000);
    await expect(stepCount(page)).toHaveText(`Step 2 of ${turns[0].steps.length}`);
  });

  test("never runs under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/about/");
    await bringReplayIntoView(page);
    await page.clock.runFor(10_000);
    await expect(stepCount(page)).toHaveText(`Step 1 of ${turns[0].steps.length}`);
  });
});

test("below 768 px the diagram scrolls inside its box, following the step, and the page doesn't scroll sideways", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/about/");
  // Below 640 px the header keeps only the wordmark, the theme switch and the call to action.
  await expect(page.getByRole("banner").getByRole("link", { name: about.header.howItWorks })).toBeHidden();
  await expect(page.getByRole("banner").getByRole("link", { name: about.header.github })).toBeHidden();
  await expect(page.getByRole("banner").getByText(about.header.wordmark, { exact: true })).toHaveJSProperty("scrollWidth", await page.getByRole("banner").getByText(about.header.wordmark, { exact: true }).evaluate((el) => el.clientWidth));
  const scroller = page.locator("[data-diagram-scroller]");
  const sizes = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator("#root > div").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // Each step brings its first active node into the box's view.
  for (const turn of turns) {
    await replay(page).getByRole("tab", { name: turn.tab }).click();
    for (const [s, step] of turn.steps.entries()) {
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const box = document.querySelector("[data-diagram-scroller]")!.getBoundingClientRect();
            const node = document.querySelector(`[data-node="${id}"]`)!.getBoundingClientRect();
            return node.left >= box.left - 1 && node.right <= box.right + 1;
          }, step.nodes[0]),
        )
        .toBe(true);
      if (s < turn.steps.length - 1) await advance(page).click();
    }
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`from load to the last step it sends nothing outside its origin, creates no session and logs no errors (${colorScheme})`, async ({ page, baseURL }) => {
    const outside: string[] = [];
    const logged: string[] = [];
    page.on("request", (request) => new URL(request.url()).origin !== new URL(baseURL!).origin && outside.push(request.url()));
    page.on("console", (message) => ["error", "warning"].includes(message.type()) && logged.push(message.text()));
    page.on("pageerror", (error) => logged.push(error.message));
    await page.emulateMedia({ colorScheme });
    await page.goto("/about/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    for (const turn of turns) for (let s = 0; s < turn.steps.length; s++) await advance(page).click();
    await expect(stepCount(page)).toHaveText(`Step 1 of ${turns[0].steps.length}`); // back at the start, every step seen
    await page.getByRole("button", { name: colorScheme === "light" ? "Dark theme" : "Light theme" }).click();
    await page.getByRole("link", { name: about.hero.secondary }).click();
    await page.waitForLoadState("networkidle");
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem("sessionId"))).toBeNull();
    expect(logged).toEqual([]);
  });
}
