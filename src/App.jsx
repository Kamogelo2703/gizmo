import { useRef } from "react";
import AdminPortal from "./AdminPortal.jsx";
import CoverLock from "./CoverLock.jsx";
import PairsSheet from "./PairsSheet.jsx";
import V2Interface from "./V2Interface.jsx";
import ZetaInterface from "./ZetaInterface.jsx";
import { useApp } from "./store.jsx";

export default function App() {
  const {
    activeInterface,
    toggleInterface,
    hasActiveBot,
    adminOpen,
    setAdminOpen,
    setAdminPage,
    toast,
    showToast,
  } = useApp();

  const hotspotRef = useRef({ count: 0, first: 0 });

  function onBrandHotspot(event) {
    if (!event.target.closest(".apexea-hotspot")) return;
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - hotspotRef.current.first > 600) {
      hotspotRef.current = { count: 1, first: now };
    } else {
      hotspotRef.current.count += 1;
    }
    if (hotspotRef.current.count >= 3) {
      hotspotRef.current = { count: 0, first: 0 };
      setAdminPage("dashboard");
      setAdminOpen(true);
      showToast("Admin portal");
    }
  }

  return (
    <div
      className={`phone${hasActiveBot ? "" : " is-locked"}${adminOpen ? " is-admin-open" : ""}`}
      data-interface={activeInterface}
      onClick={onBrandHotspot}
    >
      <div className="glow" aria-hidden="true" />
      <div className="glow glow-soft" aria-hidden="true" />

      <header className="top">
        <p className="username" id="username" />
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

      {activeInterface === "zeta" ? <ZetaInterface /> : <V2Interface />}

      <CoverLock />
      <PairsSheet />
      <AdminPortal />

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
