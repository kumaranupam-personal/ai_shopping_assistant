// A stand-in for the backend API (docs/05-api.md) with recorded product data, so browser tests need no server or key.
import { expect, type Page } from "@playwright/test";

import type { Card } from "../src/api";
import products from "./fixtures/products.json" with { type: "json" };

export const API = "http://localhost:8000/api";

export type ScriptedTurn = {
  headline: string;
  suggestions: string[];
  ids: (keyof typeof products)[];
  cards?: Card[]; // extra cards after the recorded ones, for card rules the fixture doesn't cover
  reply: string;
  hang?: boolean; // never answer, like a slow model; used to reload mid-turn
};

export const LADAKH_TURN: ScriptedTurn = {
  headline: "Warm jackets for Ladakh in December, size L, under ₹8,000",
  suggestions: ["Only waterproof", "Lightest options", "Under ₹5,000"],
  ids: ["JKT-00001", "JKT-00005", "JKT-00008", "JKT-00002", "JKT-00003", "JKT-00004", "JKT-00006", "JKT-00007"],
  reply: "Here are 8 warm jackets in size L under ₹8,000.",
};

/** What GET /api/featured returns: a few recorded cards under the fixed headline. */
export const FEATURED = {
  headline: "Popular picks",
  suggestions: [],
  products: (["JKT-00001", "JKT-00002", "JKT-00003"] as const).map((id) => products[id].card),
};

export const WATERPROOF_TURN: ScriptedTurn = {
  headline: "Waterproof warm jackets, size L, under ₹8,000",
  suggestions: ["Compare top 2"],
  ids: ["JKT-00002", "JKT-00004"],
  reply: "These 2 are waterproof.",
};

const IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#ddd"/></svg>`;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Routes API calls and product images for one page. Turns are played in order, one per chat request. */
export async function mockApi(page: Page, turns: ScriptedTurn[]) {
  const sessions = new Map<string, unknown[]>(); // session id -> committed transcript entries
  let sessionCount = 0;
  let turnCount = 0;

  await page.route("https://placehold.co/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: IMAGE }));
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api", "");
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
    const notFound = () => json(404, { error: { code: "session_not_found", message: "This chat session doesn't exist or has expired." } });

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.method() === "POST" && path === "/sessions") {
      const id = `session-${++sessionCount}`;
      sessions.set(id, []);
      return json(201, { session_id: id });
    }
    if (request.method() === "GET" && path.startsWith("/sessions/")) {
      const id = decodeURIComponent(path.slice("/sessions/".length));
      const entries = sessions.get(id);
      return entries ? json(200, { session_id: id, turn_count: entries.length / 3, entries }) : notFound();
    }
    if (request.method() === "GET" && path === "/featured") return json(200, FEATURED);
    if (request.method() === "GET" && path.startsWith("/products/")) {
      const product = products[decodeURIComponent(path.slice("/products/".length)) as keyof typeof products];
      return product ? json(200, product) : json(404, { error: { code: "product_not_found", message: "This product doesn't exist." } });
    }
    if (request.method() === "POST" && path === "/chat") {
      const { session_id: id, message } = request.postDataJSON();
      const entries = sessions.get(id);
      if (!entries) return notFound();
      const turn = turns[turnCount++ % turns.length];
      if (turn.hang) return; // left pending; a reload abandons it
      const resultSet = { headline: turn.headline, suggestions: turn.suggestions, products: [...turn.ids.map((i) => products[i].card), ...(turn.cards ?? [])] };
      entries.push({ type: "user", text: message }, { type: "products", ...resultSet }, { type: "assistant", text: turn.reply });
      const body =
        frame("status", { text: "Searching jackets under ₹8,000 in size L" }) +
        frame("products", resultSet) +
        frame("text", { text: turn.reply }) +
        frame("done", { turn: entries.length / 3 });
      return route.fulfill({ status: 200, headers: CORS, contentType: "text/event-stream", body });
    }
    return route.fallback();
  });
}

/** Every row in the chat list: messages, result markers and error rows. */
export const chatRows = (page: Page) => page.getByRole("region", { name: "Chat" }).getByRole("list", { name: "Conversation" }).getByRole("listitem");

/** A message in the chat list (the live region repeats assistant text, so page-wide text matches twice; the landing's prompts never match). */
export const message = (page: Page, text: string) => page.getByRole("region", { name: "Chat" }).getByRole("list", { name: "Conversation" }).getByText(text);

/** Resolves once the app has a session, so tests don't race its creation. */
export const sessionReady = (page: Page) => page.waitForFunction(() => sessionStorage.getItem("saathi.sessionId"));

/** Types a message and waits until the turn's reply is shown (one more copy of it, so repeated turns work). */
export async function send(page: Page, text: string, turn: ScriptedTurn) {
  await sessionReady(page);
  const replies = message(page, turn.reply);
  const before = await replies.count();
  await page.getByLabel("Message").fill(text);
  await page.getByLabel("Message").press("Enter");
  await expect(replies).toHaveCount(before + 1);
}
