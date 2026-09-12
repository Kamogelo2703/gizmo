import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppProvider } from "./store.jsx";
import "./styles.css";

// Stop the whole page from panning sideways on phones (iOS rubber-band / trackpad).
// Vertical scrolling inside .phone / overflow areas still works.
(() => {
  let startX = 0;
  let startY = 0;
  let locking = false;

  window.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      locking = false;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!locking) {
        // Decide once the gesture commits: only block clearly-horizontal pans.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        locking = Math.abs(dx) > Math.abs(dy);
      }
      if (locking) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
})();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
