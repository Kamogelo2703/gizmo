import { useState } from "react";
import { useApp } from "./store.jsx";

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
              {coverEmail ? <p className="v2-account">{coverEmail}</p> : null}
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
                <span className="v2-pill-icon is-trade">▶</span>
                <span className="v2-pill-label">{v2Running ? "STOP" : "START"}</span>
              </button>
              <button
                className="v2-pill-btn"
                type="button"
                onClick={() => {
                  setV2SymTab("allowed");
                  setV2View("quotes");
                }}
              >
                <span className="v2-pill-icon is-quotes">✦</span>
                <span className="v2-pill-label">QUOTES</span>
              </button>
              <button className="v2-pill-btn" type="button" onClick={removeActiveBot}>
                <span className="v2-pill-icon is-remove">🗑</span>
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
                        <img src={bot.photo || "/logo.png"} alt="" width="42" height="42" />
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

        {v2View === "metatrader" && (
          <section className="v2-view is-active">
            <div className="v2-mt-empty">
              <h2>MetaTrader</h2>
              <p>Connect your MetaTrader account to sync trades.</p>
            </div>
          </section>
        )}
      </main>

      <nav className="v2-tabbar" aria-label="V2 primary">
        <button
          className={`v2-tab${v2View !== "metatrader" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("home")}
        >
          <span>HOME</span>
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
