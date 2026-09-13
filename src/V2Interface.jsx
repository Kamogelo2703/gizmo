import { useState } from "react";
import { useApp } from "./store.jsx";
import MetaTraderPanel from "./MetaTraderPanel.jsx";

export default function V2Interface() {
  const {
    activeBot,
    bots,
    selectBot,
    removeActiveBot,
    v2View,
    setV2View,
    v2Running,
    setV2Running,
    v2SymTab,
    setV2SymTab,
    catalog,
    appSymbols,
    getSymbolMeta,
    saveSymbolMeta,
    removeSymbolEverywhere,
    editingSymbol,
    setEditingSymbol,
    showToast,
    coverEmail,
  } = useApp();

  const [lotSize, setLotSize] = useState(0.01);
  const [action, setAction] = useState("BOTH");
  const [platform, setPlatform] = useState("MT5");
  const [trades, setTrades] = useState(1);

  const allowed = catalog.filter((s) => appSymbols.has(s));
  const list = v2SymTab === "allowed" ? allowed : catalog;

  function openEdit(symbol) {
    const meta = getSymbolMeta(symbol);
    setEditingSymbol(symbol);
    setLotSize(meta.lotSize);
    setAction(meta.action);
    setPlatform(meta.platform);
    setTrades(meta.trades);
    setV2View("symbol-edit");
  }

  return (
    <div className="iface-layer is-active" data-iface="v2">
      <main className="v2-stage">
        {v2View === "home" && (
          <section className="v2-view is-active">
            <div className="v2-hero-banner">
              <img
                className="v2-hero-image"
                src={activeBot?.photo || "/logo.png"}
                alt=""
              />
              <div className="v2-hero-shade" aria-hidden="true" />
              <div className="v2-hero-copy">
                <p className="v2-hero-kicker">AI TRADING SYSTEM</p>
                <h1 className="v2-hero-title">GOAT SCALPER EA</h1>
              </div>
            </div>

            <p className="v2-user-name">Kamogelo</p>
            {coverEmail ? <p className="v2-user-meta">{coverEmail}</p> : null}

            <div className="v2-action-card">
              <button
                className={`v2-action-btn${v2Running ? " is-running" : ""}`}
                type="button"
                id="v2-trade-btn"
                onClick={() => {
                  const next = !v2Running;
                  setV2Running(next);
                  showToast(next ? `${activeBot?.name || "Bot"} started` : "Bot stopped");
                }}
              >
                <span className="v2-action-icon is-trade" aria-hidden="true">
                  {v2Running ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.5v13l11-6.5L8 5.5z" />
                    </svg>
                  )}
                </span>
                <span className="v2-action-label">{v2Running ? "STOP" : "TRADE"}</span>
              </button>
              <button
                className="v2-action-btn"
                type="button"
                onClick={() => {
                  setV2SymTab("allowed");
                  setV2View("quotes");
                }}
              >
                <span className="v2-action-icon is-quotes" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v18M3 12h18M6.5 6.5l11 11M17.5 6.5l-11 11" />
                  </svg>
                </span>
                <span className="v2-action-label">QUOTES</span>
              </button>
              <button className="v2-action-btn" type="button" onClick={removeActiveBot}>
                <span className="v2-action-icon is-remove" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="v2-action-label">REMOVE</span>
              </button>
            </div>

            <section className="v2-robots">
              <h2 className="v2-robots-title">CONNECTED ROBOTS</h2>
              <div className="v2-robot-list">
                {bots.filter((b) => b.active).length === 0 ? (
                  <p className="v2-robot-empty">No connected robots</p>
                ) : (
                  bots
                    .filter((b) => b.active)
                    .map((bot) => (
                      <button
                        key={bot.id}
                        className={`v2-robot-row${bot.id === activeBot?.id ? " is-active" : ""}`}
                        type="button"
                        onClick={() => selectBot(bot.id)}
                      >
                        <span className="v2-robot-thumb">
                          <img src={bot.photo || "/logo.png"} alt="" />
                        </span>
                        <span className="v2-robot-name">{bot.name}</span>
                      </button>
                    ))
                )}
              </div>
            </section>
          </section>
        )}

        {v2View === "quotes" && (
          <section className="v2-view is-active">
            <header className="v2-screen-top">
              <button className="v2-back" type="button" onClick={() => setV2View("home")}>
                ←
              </button>
              <h2 className="v2-screen-title">{activeBot?.name || "Quotes"}</h2>
              <span className="v2-screen-spacer" />
            </header>
            <div className="v2-sym-tabs">
              <button
                className={`v2-sym-tab${v2SymTab === "allowed" ? " is-active" : ""}`}
                type="button"
                onClick={() => setV2SymTab("allowed")}
              >
                Allowed Symbols
              </button>
              <button
                className={`v2-sym-tab${v2SymTab === "all" ? " is-active" : ""}`}
                type="button"
                onClick={() => setV2SymTab("all")}
              >
                All Symbols
              </button>
            </div>
            <p className="v2-sym-help">
              {v2SymTab === "allowed"
                ? "These are Symbols you have selected for your EA to trade."
                : "All available symbols. Tap one to configure it for your EA."}
            </p>
            <div className="v2-sym-card">
              {list.length === 0 ? (
                <p className="v2-sym-empty">No symbols yet — choose them in Manage EA</p>
              ) : (
                list.map((symbol) => {
                  const meta = getSymbolMeta(symbol);
                  return (
                    <button
                      key={symbol}
                      className="v2-sym-row"
                      type="button"
                      onClick={() => openEdit(symbol)}
                    >
                      <strong>{symbol}</strong>
                      <span className="v2-sym-chevron">›</span>
                      <div className="v2-sym-meta">
                        <span>Lot Size {meta.lotSize}</span>
                        <span>Action {meta.action}</span>
                        <span>{meta.platform}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        )}

        {v2View === "symbol-edit" && (
          <section className="v2-view is-active">
            <header className="v2-screen-top">
              <button className="v2-back" type="button" onClick={() => setV2View("quotes")}>
                ←
              </button>
              <h2 className="v2-screen-title">{editingSymbol}</h2>
              <button
                className="v2-trash"
                type="button"
                onClick={() => {
                  removeSymbolEverywhere(editingSymbol);
                  setV2View("quotes");
                }}
              >
                🗑
              </button>
            </header>
            <form
              className="v2-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                saveSymbolMeta(editingSymbol, {
                  lotSize: Number(lotSize) || 0.01,
                  action,
                  platform,
                  trades: Math.max(1, Math.floor(Number(trades) || 1)),
                });
                setV2View("quotes");
              }}
            >
              <label className="v2-field">
                <span>Lot Size</span>
                <input
                  className="v2-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={lotSize}
                  onChange={(e) => setLotSize(e.target.value)}
                />
              </label>
              <label className="v2-field">
                <span>Action</span>
                <select className="v2-input" value={action} onChange={(e) => setAction(e.target.value)}>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                  <option value="BOTH">BOTH</option>
                </select>
              </label>
              <label className="v2-field">
                <span>Platform</span>
                <select
                  className="v2-input"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  <option value="MT4">MT4</option>
                  <option value="MT5">MT5</option>
                </select>
              </label>
              <label className="v2-field">
                <span>Number of Trades</span>
                <input
                  className="v2-input"
                  type="number"
                  min="1"
                  value={trades}
                  onChange={(e) => setTrades(e.target.value)}
                />
              </label>
              <button className="v2-save-btn" type="submit">
                Save Symbol
              </button>
            </form>
          </section>
        )}

        {v2View === "metatrader" && (
          <section className="v2-view is-active v2-view-metatrader">
            <MetaTraderPanel variant="v2" />
          </section>
        )}
      </main>

      <nav className="v2-tabbar" aria-label="V2 primary">
        <button
          className={`v2-tab${v2View !== "metatrader" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("home")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5z" strokeLinejoin="round" />
          </svg>
          <span>HOME</span>
        </button>
        <button
          className={`v2-tab${v2View === "metatrader" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("metatrader")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M8 21h8M12 18v3" strokeLinecap="round" />
          </svg>
          <span>METATRADER</span>
        </button>
      </nav>
    </div>
  );
}
