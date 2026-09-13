import { useState } from "react";
import ChartScanner from "./ChartScanner.jsx";
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
    mentorDisplayName,
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
            <p className="v2-top-title">
              <span className="v2-top-icon">✦</span>
              <span>{activeBot?.name || "No active bot"}</span>
            </p>
            <div className="v2-hero">
              <div className="v2-avatar-wrap">
                <img
                  className="v2-avatar"
                  src={activeBot?.photo || "/logo.png"}
                  alt=""
                />
              </div>
              <h1 className="v2-bot-name">{activeBot?.name || "No active bot"}</h1>
              {mentorDisplayName ? (
                <p className="v2-account">{mentorDisplayName}</p>
              ) : null}
            </div>
            <div className="v2-pill-bar">
              <button
                className={`v2-pill-btn${v2Running ? " is-running" : ""}`}
                type="button"
                id="v2-trade-btn"
                onClick={() => {
                  const next = !v2Running;
                  setV2Running(next);
                  showToast(next ? `${activeBot?.name || "Bot"} started` : "Bot stopped");
                }}
              >
                <span className="v2-pill-icon is-trade" aria-hidden="true">
                  {v2Running ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="3.5" width="6.5" height="17" rx="1.6" />
                      <rect x="13.5" y="3.5" width="6.5" height="17" rx="1.6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.5 3.8v16.4L20.2 12 6.5 3.8z" />
                    </svg>
                  )}
                </span>
                <span className="v2-pill-label">{v2Running ? "STOP" : "TRADE"}</span>
              </button>
              <button
                className="v2-pill-btn"
                type="button"
                onClick={() => {
                  setV2SymTab("allowed");
                  setV2View("quotes");
                }}
              >
                <span className="v2-pill-icon is-quotes" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <path d="M4 16.5 8.5 12l3.2 3.2L16 9.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14.2 7.2l1.1-2.2 1.1 2.2 2.2.3-1.7 1.5.5 2.2-2.1-1.2-2.1 1.2.5-2.2-1.7-1.5 2.2-.3z" fill="currentColor" stroke="none" />
                    <path d="M18.6 5.4l.55-1.1.55 1.1 1.1.15-.85.75.25 1.1-1.05-.6-1.05.6.25-1.1-.85-.75 1.1-.15z" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="v2-pill-label">QUOTES</span>
              </button>
              <button className="v2-pill-btn" type="button" onClick={removeActiveBot}>
                <span className="v2-pill-icon is-remove" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M8 7h8l-.7 11.2a1.6 1.6 0 0 1-1.6 1.5H10.3a1.6 1.6 0 0 1-1.6-1.5L8 7z" strokeLinejoin="round" />
                    <path d="M7 7h10M10 7V5.8A1.3 1.3 0 0 1 11.3 4.5h1.4A1.3 1.3 0 0 1 14 5.8V7" strokeLinecap="round" />
                    <path d="m10.2 11 3.6 3.6M13.8 11l-3.6 3.6" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="v2-pill-label">REMOVE</span>
              </button>
            </div>
            <section className="v2-robots">
              <h2 className="v2-robots-title">CONNECTED ROBOTS:</h2>
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
                        <img src={bot.photo || "/logo.png"} alt="" width="54" height="54" />
                        <span>{bot.name}</span>
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

        {v2View === "scanner" && (
          <section className="v2-view is-active">
            <ChartScanner />
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
          className={`v2-tab${v2View === "home" || v2View === "quotes" || v2View === "symbol-edit" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("home")}
        >
          <span>HOME</span>
        </button>
        <button
          className={`v2-tab${v2View === "scanner" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("scanner")}
        >
          <span>CHART SCANNER</span>
        </button>
        <button
          className={`v2-tab${v2View === "metatrader" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("metatrader")}
        >
          <span>METATRADER</span>
        </button>
      </nav>
    </div>
  );
}
