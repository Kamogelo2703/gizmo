import { useApp } from "./store.jsx";
import MetaTraderPanel from "./MetaTraderPanel.jsx";

export default function ZetaInterface() {
  const {
    activeBot,
    bots,
    selectBot,
    removeActiveBot,
    setPairsOpen,
    zetaView,
    setZetaView,
    v2Running,
    setV2Running,
    showToast,
    setAdminOpen,
    setAdminPage,
    setLockStep,
    getSignup,
    coverEmail,
  } = useApp();

  const running = v2Running;

  function toggleRun() {
    const next = !running;
    setV2Running(next);
    showToast(next ? `${activeBot?.name || "Bot"} started` : "Bot stopped");
  }

  function openLicense() {
    const signup = getSignup(coverEmail);
    if (signup?.status === "approved") setLockStep("license");
    else if (signup) setLockStep("pending");
    else setLockStep("cover");
    // Force lock UI even if bots exist? Only when activating license for removed bots
    // Use temporary approach: if no active bot, CoverLock shows itself
    if (bots.some((b) => b.active)) {
      // still allow opening admin activate via selecting removed bots - simplify: toast
      showToast("Use Admin → License Keys for activation keys");
    }
  }

  return (
    <div className="iface-layer is-active" data-iface="zeta">
      <main className="stage">
        {zetaView === "home" && (
          <section className="view is-active">
            <div className="hero">
              <div className="avatar-wrap">
                <img
                  className="avatar"
                  src={activeBot?.photo || "/logo.png"}
                  alt=""
                  width="160"
                  height="160"
                />
              </div>
              <p className="kicker">You are trading with</p>
              <h1 className="brand">{activeBot?.name || "No active bot"}</h1>
              <p className="powered">
                POWERED BY <span className="apexea-hotspot">ApexEA</span>
              </p>
            </div>

            <div className="action-deck" role="group" aria-label="Trading controls">
              <div className="action-row">
                <button className="glass-btn" type="button" onClick={() => setPairsOpen(true)}>
                  <span>Pairs</span>
                </button>
                <button
                  className={`stop-btn${running ? " is-running" : ""}`}
                  type="button"
                  onClick={toggleRun}
                >
                  <span className="stop-label">{running ? "STOP" : "START"}</span>
                </button>
                <button className="glass-btn" type="button" onClick={removeActiveBot}>
                  <span>Remove bot</span>
                </button>
              </div>
              <p className="powered-badge">
                Powered by <span className="apexea-hotspot">ApexEA</span>
              </p>
            </div>

            <section className="robots" aria-label="Robot list">
              <h2 className="robots-title">ROBOT LIST:</h2>
              {bots
                .filter((b) => b.active)
                .map((bot) => (
                  <button
                    key={bot.id}
                    className={`robot-row${bot.selected ? " is-active" : ""}`}
                    type="button"
                    onClick={() => selectBot(bot.id)}
                  >
                    <img src={bot.photo || "/logo.png"} alt="" width="36" height="36" />
                    <span>{bot.name}</span>
                  </button>
                ))}
              <button
                className="robot-row robot-add"
                type="button"
                onClick={() => {
                  setAdminPage("manage-ea");
                  setAdminOpen(true);
                }}
              >
                <span className="plus">+</span>
                <span>Add New Trading Bot</span>
              </button>
              <button className="robot-row robot-activate" type="button" onClick={openLicense}>
                <span className="plus">🔑</span>
                <span>Activate with License Key</span>
              </button>
            </section>
          </section>
        )}

        {zetaView === "scanner" && (
          <section className="view is-active">
            <header className="scanner-top">
              <div className="scanner-title-wrap">
                <span className="scanner-dot" />
                <h2 className="scanner-title">Scanner</h2>
              </div>
            </header>
            <div className="scanner-hero">
              <div className="scanner-orb">
                <img src="/logo.png" alt="" width="120" height="120" />
              </div>
              <p className="scanner-brand">{activeBot?.name || "ApexEA"}</p>
              <h3 className="scanner-heading">Chart Scanner</h3>
              <p className="scanner-sub">Upload a screenshot to get AI signals</p>
              <button
                className="upload-btn"
                type="button"
                onClick={() => showToast("Scanner ready")}
              >
                Upload Chart
              </button>
            </div>
          </section>
        )}

        {zetaView === "metatrader" && (
          <section className="view is-active view-metatrader">
            <MetaTraderPanel variant="zeta" />
          </section>
        )}
      </main>

      <nav className="tabbar" aria-label="Primary">
        {[
          ["home", "Home"],
          ["scanner", "Scanner"],
          ["metatrader", "MetaTrader"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab${zetaView === id ? " is-active" : ""}`}
            type="button"
            onClick={() => setZetaView(id)}
          >
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
