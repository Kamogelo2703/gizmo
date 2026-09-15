import { useApp } from "./store.jsx";

/** Header that lives inside the scrollable stage so title + toggle scroll away. */
export default function TopBar() {
  const { activeInterface, mainTextDisplay, toggleInterface, v2View } = useApp();
  // Interface 2 home matches the old full-bleed hero — no brand stamp above the photo.
  const hideTitle = activeInterface === "v2" && v2View === "home";
  const title = hideTitle ? "" : mainTextDisplay || "";

  return (
    <header className={`top${hideTitle ? " is-v2-home" : ""}`}>
      <p className="username" id="username">
        {title}
      </p>
      <button
        className="iface-toggle"
        type="button"
        aria-label="Switch interface"
        title="Switch interface"
        onClick={toggleInterface}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7.5h11.5M15.5 7.5 13 5m2.5 2.5L13 10M20 16.5H8.5M8.5 16.5 11 14M8.5 16.5 11 19"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="3.5" y="14" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
          <rect x="15.5" y="5" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </header>
  );
}
