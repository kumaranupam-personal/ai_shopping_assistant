// The app lives under /saathi/ and the old addresses lead there (docs/13-deployment.md, Paths; docs/12-about-page.md, Serving).
import { expect, test } from "@playwright/test";

// Old or bare address -> [status, location], with the query kept.
const REDIRECTS: [string, number, string][] = [
  ["/", 302, "/saathi/"],
  ["/saathi", 301, "/saathi/"],
  ["/about", 301, "/saathi/about/"],
  ["/about/", 301, "/saathi/about/"],
  ["/saathi/about", 301, "/saathi/about/"],
  ["/about?ref=x", 301, "/saathi/about/?ref=x"],
];

for (const [path, status, location] of REDIRECTS) {
  test(`${path} redirects to ${location}`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(status);
    expect(response.headers()["location"]).toBe(location);
  });
}

test("the chat and the about page are served under /saathi/ with their files", async ({ page }) => {
  await page.route("http://localhost:8000/**", (route) => route.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": "*" } }));
  const missing: string[] = [];
  page.on("response", (response) => response.status() === 404 && missing.push(response.url()));
  for (const path of ["/saathi/", "/saathi/about/"]) {
    const response = await page.goto(path);
    expect(response!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
  }
  expect(missing).toEqual([]); // scripts, styles, fonts and the favicon all load from under /saathi/
});
