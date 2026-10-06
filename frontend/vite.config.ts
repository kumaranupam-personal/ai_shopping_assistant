import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";

import { about } from "./src/about/content.ts";

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Fills the about page's title and description from its content file (docs/12-about-page.md, Serving). */
function aboutMeta(): Plugin {
  return {
    name: "about-meta",
    transformIndexHtml: {
      order: "pre",
      // Function replacers, so a "$" in the text (a price, say) is never read as a replacement pattern.
      handler: (html) => html.replace("%ABOUT_TITLE%", () => escapeHtml(about.title)).replace("%ABOUT_DESCRIPTION%", () => escapeHtml(about.description)),
    },
  };
}

/** Where the app lives on its domain (docs/13-deployment.md, Paths). */
const BASE = "/saathi/";

// Path -> [status, location]. The domain root redirects only for now (302), since another page may take it later.
const REDIRECTS: Record<string, [number, string]> = {
  "/": [302, `${BASE}about/`],
  "/saathi": [301, BASE],
  "/about": [301, `${BASE}about/`],
  "/about/": [301, `${BASE}about/`],
  "/saathi/about": [301, `${BASE}about/`],
};

/** The redirects the frontend container's nginx makes in production, in dev and preview too. */
function redirects(): Plugin {
  const redirect = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      const [path, query] = (req.url ?? "").split(/\?(.*)/s);
      const target = REDIRECTS[path];
      if (!target) return next();
      res.writeHead(target[0], { Location: query ? `${target[1]}?${query}` : target[1] });
      res.end();
    });
  };
  return { name: "redirects", configureServer: redirect, configurePreviewServer: redirect };
}

// Two pages under BASE: the chat at /saathi/ and the about page at /saathi/about/ (docs/12-about-page.md), in dev, the
// build and preview.
export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), aboutMeta(), redirects()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        chat: fileURLToPath(new URL("index.html", import.meta.url)),
        about: fileURLToPath(new URL("about/index.html", import.meta.url)),
      },
    },
  },
});
