// The about page's entry (docs/12-about-page.md). It shares only the tokens, fonts and theme with the chat: nothing
// here imports the API client, the chat state, Turnstile or the cart.
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces/opsz.css";
import "../index.css";
import "./about.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import AboutPage from "./AboutPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AboutPage />
  </StrictMode>,
);
