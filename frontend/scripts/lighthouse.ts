// `npm run lighthouse`: builds the app, serves the production build and checks Lighthouse desktop scores against the
// quality bar in docs/06-frontend.md. A minimal stand-in API answers the first page load, so no backend is needed.
import { createServer } from "node:http";

import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { build, preview } from "vite";

const MINIMUM = { performance: 90, accessibility: 95, "best-practices": 95 };

const api = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "POST" && request.url === "/api/sessions") {
    response.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ session_id: "lighthouse" }));
  } else {
    response.writeHead(request.method === "OPTIONS" ? 204 : 404).end();
  }
});

await build({ logLevel: "warn" });
const site = await preview({ preview: { port: 4173, strictPort: true } });
await new Promise<void>((resolve) => api.listen(8000, resolve));
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless=new"] });

let failed = false;
try {
  const result = await lighthouse("http://localhost:4173", { port: chrome.port, logLevel: "error" }, desktopConfig);
  for (const [category, minimum] of Object.entries(MINIMUM)) {
    const score = Math.round((result!.lhr.categories[category].score ?? 0) * 100);
    console.log(`${category}: ${score} (minimum ${minimum})`);
    failed ||= score < minimum;
  }
} finally {
  chrome.kill();
  api.close();
  await site.close();
}
process.exitCode = failed ? 1 : 0;
