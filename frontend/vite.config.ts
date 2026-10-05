import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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

// Two pages: the chat at / and the about page at /about/ (docs/12-about-page.md), in dev, the build and preview.
export default defineConfig({
  plugins: [react(), tailwindcss(), aboutMeta()],
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
