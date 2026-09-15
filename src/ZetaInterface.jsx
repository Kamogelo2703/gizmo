import { mediaUrl, resolveBotPhotoSrc } from "./apiOrigin.js";
import { isNativeApp, useApp } from "./store.jsx";
import ChartScanner from "./ChartScanner.jsx";
import EconomicCalendarButton from "./EconomicCalendar.jsx";
import MetaTraderPanel from "./MetaTraderPanel.jsx";
import TopBar from "./TopBar.jsx";
import { buildBotTradeComment } from "./metaApi.js";
import TradeScriptOrb, { buildShortOpenTradeScript } from "./TradeScriptOrb.jsx";
import { useEffect, useState } from "react";

const START_PARTICLE_COUNT = isNativeApp() ? 6 : 18;

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
    setLockStep,
    getSignup,
    coverEmail,
    catalog,
    getSymbolMeta,
    orbTradeLive,
    clearOrbTrade,
  } = useApp();

  const [heroBroken, setHeroBroken] = useState("");
  const [heroFallback, setHeroFallback] = useState("/logo.png");
  useEffect(() => {
    setHeroBroken("");
    setHeroFallback("/logo.png");
  }, [activeBot?.id, activeBot?.photo]);

  const running = v2Running;
  const preferredHero = resolveBotPhotoSrc(activeBot, "/logo.png");
  const storedPhoto = mediaUrl(activeBot?.photo || "/logo.png");
  const heroSrc =
    heroBroken === preferredHero
      ? heroFallback || storedPhoto || "/logo.png"
      : preferredHero;
  const floatSrc = heroSrc;
  const tradeComment = buildBotTradeComment(activeBot?.name);
  const scriptSymbol =
    (activeBot?.symbols && activeBot.symbols[0]) || catalog?.[0] || "XAUUSD";
  const scriptMeta = getSymbolMeta?.(scriptSymbol) || {};
  const openTradeScript = buildShortOpenTradeScript({
    botName: activeBot?.name || "Bot",
    comment: tradeComment,
    symbol: orbTradeLive?.symbol || scriptSymbol,
    lotSize: orbTradeLive?.lotSize ?? scriptMeta?.lotSize ?? 0.01,
    action: orbTradeLive?.action || scriptMeta?.action || "BOTH",
  });

  function toggleRun() {
    const next = !running;
    setV2Running(next);
    if (!next) clearOrbTrade?.();
    showToast(next ? `${activeBot?.name || "Bot"} started` : "Bot stopped");
  }

  function openLicense() {
    const signup = getSignup(coverEmail);
    // Already unlocked: still open license entry so a new key can add another bot.
    if (bots.some((b) => b.active) || signup?.status === "approved") {
      setLockStep("license");
      return;
    }
    if (signup) setLockStep("pending");
    else setLockStep("cover");
  }

  return (
    <div className="iface-layer is-active" data-iface="zeta">
      <main className="stage">
        <TopBar />
        {zetaView === "home" && (
          <section className="view is-active view-home">
            <div className="hero">
              <EconomicCalendarButton variant="zeta" />
              <div className="avatar-wrap">
                <img
                  className="avatar"
                  key={`${activeBot?.id || "bot"}-${heroSrc.slice(0, 48)}`}
                  src={heroSrc}
                  alt=""
                  decoding="async"
                  fetchPriority="high"
                  onError={() => {
                    if (preferredHero && heroBroken !== preferredHero) {
                      // Prefer a working local/logo asset over a 404 API path.
                      const next =
                        storedPhoto &&
                        storedPhoto !== preferredHero &&
                        !String(storedPhoto).includes("/api/licenses/photo")
                          ? storedPhoto
                          : "/logo.png";
                      setHeroFallback(next);
                      setHeroBroken(preferredHero);
                    }
                  }}
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
                  <span className="stop-energy" aria-hidden="true">
                    {Array.from({ length: START_PARTICLE_COUNT }, (_, i) => (
                      <span key={i} className={`stop-particle stop-particle-${i + 1}`} />
                    ))}
                  </span>
                  <span className="stop-core-glow" aria-hidden="true" />
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
                    <img
                      src={resolveBotPhotoSrc(bot, "/logo.png")}
                      alt=""
                      width="36"
                      height="36"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/logo.png";
                      }}
                    />
                    <span>{bot.name}</span>
                  </button>
                ))}
              <button
                className="robot-row robot-add"
                type="button"
                onClick={openLicense}
              >
                <span className="plus">+</span>
                <span>Add New Trading Bot</span>
              </button>
            </section>
          </section>
        )}

        <ChartScanner active={zetaView === "scanner"} />

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

      <TradeScriptOrb
        visible={(running || Boolean(orbTradeLive)) && zetaView === "home"}
        photoSrc={floatSrc}
        botName={activeBot?.name || "Bot"}
        script={openTradeScript}
        comment={tradeComment}
        openingTrades={Boolean(orbTradeLive)}
        tradeLive={orbTradeLive}
        storageKey="apexea-float-pos-zeta"
        showToast={showToast}
      />
    </div>
  );
}
