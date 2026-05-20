import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

const el = document.getElementById("root");
if (!el) {
  document.body.innerHTML =
    "<p style=\"font-family:system-ui;padding:2rem\">Zeppole UI error: missing #root element.</p>";
} else {
  try {
    createRoot(el).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  } catch (e) {
    el.innerHTML = `<pre style="font-family:system-ui;padding:2rem;white-space:pre-wrap">${String(e)}</pre>`;
  }
}
