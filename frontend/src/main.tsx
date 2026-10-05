import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces/opsz.css"; // with the optical-size axis, so large headings get the display cut
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
