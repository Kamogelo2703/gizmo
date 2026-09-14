import { useEffect, useRef, useState } from "react";
import ChartScanner from "./ChartScanner.jsx";
import { buildBotTradeComment } from "./metaApi.js";
import { useApp } from "./store.jsx";
import MetaTraderPanel from "./MetaTraderPanel.jsx";
import TopBar from "./TopBar.jsx";

const FLOAT_POS_KEY = "apexea-v2-float-pos";
const FLOAT_SIZE = 58;
const DRAG_THRESHOLD = 8;

function loadFloatPos() {
  try {
    const raw = JSON.parse(localStorage.getItem(FLOAT_POS_KEY) || "null");
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      return { x: raw.x, y: raw.y };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveFloatPos(pos) {
  try {
    localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function buildOpenTradeScript({ botName, comment, symbol, lotSize, trades, action }) {
  const name = botName || "Bot";
  const sym = symbol || "XAUUSD";
  const lot = Number(lotSize) > 0 ? Number(lotSize) : 0.01;
  const count = Math.max(1, Math.floor(Number(trades) || 1));
  const mode = String(action || "BOTH").toUpperCase();
  return `// ApexEA · open-trade script
// Robot: ${name}
// Used when this bot opens MetaTrader fills

#property strict

input string InpBotName      = "${name}";
input string InpTradeComment = "${comment}";
input string InpSymbol       = "${sym}";
input double InpLotSize      = ${lot};
input int    InpTrades       = ${count};
input string InpAction       = "${mode}"; // BUY | SELL | BOTH

bool OpenApexTrade(ENUM_ORDER_TYPE type, double sl, double tp, string tag)
{
   MqlTradeRequest req = {};
   MqlTradeResult  res = {};

   req.action    = TRADE_ACTION_DEAL;
   req.symbol    = InpSymbol;
   req.volume    = InpLotSize;
   req.type      = type;
   req.price     = (type == ORDER_TYPE_BUY)
                     ? SymbolInfoDouble(InpSymbol, SYMBOL_ASK)
                     : SymbolInfoDouble(InpSymbol, SYMBOL_BID);
   req.sl        = sl;
   req.tp        = tp;
   req.deviation = 20;
   req.magic     = 2703;
   req.comment   = StringFormat("%s|%s", InpTradeComment, tag);

   return OrderSend(req, res);
}

// Scanner / bot fill pattern:
// OpenApexTrade(ORDER_TYPE_BUY,  sl, tp1, "TP1");
// OpenApexTrade(ORDER_TYPE_BUY,  sl, tp2, "TP2");
// OpenApexTrade(ORDER_TYPE_BUY,  sl, tp3, "TP3");
`;
}

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
    setLockStep,
    getSignup,
    coverEmail,
  } = useApp();

  const [lotSize, setLotSize] = useState(0.01);
  const [action, setAction] = useState("BOTH");
  const [platform, setPlatform] = useState("MT5");
  const [trades, setTrades] = useState(1);
  const [floatCycle, setFloatCycle] = useState(false);
  const [floatPos, setFloatPos] = useState(() => loadFloatPos());
  const [scriptOpen, setScriptOpen] = useState(false);
  const floatRef = useRef(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const allowed = catalog.filter((s) => appSymbols.has(s));
  const list = v2SymTab === "allowed" ? allowed : catalog;
  const activeRobots = bots.filter((b) => b.active);
  const heroSrc = activeBot?.photo || "/zeta-fire-portal.jpg";
  const floatSrc = activeBot?.photo || "/logo.png";
  const tradeComment = buildBotTradeComment(activeBot?.name);
  const scriptSymbol =
    editingSymbol ||
    (activeBot?.symbols && activeBot.symbols[0]) ||
    catalog[0] ||
    "XAUUSD";
  const scriptMeta = getSymbolMeta(scriptSymbol);
  const openTradeScript = buildOpenTradeScript({
    botName: activeBot?.name || "Bot",
    comment: tradeComment,
    symbol: scriptSymbol,
    lotSize: scriptMeta?.lotSize ?? lotSize,
    trades: scriptMeta?.trades ?? trades,
    action: scriptMeta?.action ?? action,
  });

  useEffect(() => {
    if (!scriptOpen) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setScriptOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scriptOpen]);

  function clampFloatPos(x, y) {
    const layer = floatRef.current?.offsetParent;
    const width = layer?.clientWidth || window.innerWidth;
    const height = layer?.clientHeight || window.innerHeight;
    const maxX = Math.max(8, width - FLOAT_SIZE - 8);
    const maxY = Math.max(8, height - FLOAT_SIZE - 8);
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    };
  }

  function onFloatPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    const node = floatRef.current;
    if (!node) return;
    const parent = node.offsetParent;
    const parentRect = parent?.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const current = floatPos || {
      x: rect.left - (parentRect?.left || 0),
      y: rect.top - (parentRect?.top || 0),
    };
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: current.x,
      origY: current.y,
    };
    node.setPointerCapture?.(event.pointerId);
  }

  function onFloatPointerMove(event) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const next = clampFloatPos(drag.origX + dx, drag.origY + dy);
    setFloatPos(next);
  }

  function onFloatPointerUp(event) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    try {
      floatRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    if (drag.moved) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const next = clampFloatPos(drag.origX + dx, drag.origY + dy);
      setFloatPos(next);
      saveFloatPos(next);
      return;
    }
    // Tap: show open-trade script — do not stop the robot.
    setScriptOpen(true);
  }

  async function copyOpenTradeScript() {
    try {
      await navigator.clipboard.writeText(openTradeScript);
      showToast("Trade script copied");
    } catch {
      showToast("Could not copy script");
    }
  }

  function openLicense() {
    const signup = getSignup(coverEmail);
    if (activeRobots.length > 0 || signup?.status === "approved") {
      setLockStep("license");
      return;
    }
    if (signup) setLockStep("pending");
    else setLockStep("cover");
  }

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
        {v2View !== "scanner" ? <TopBar /> : null}
        {v2View === "home" && (
          <section className="v2-view is-active v2-view-home">
            <div className="v2-home-hero">
              <div className="v2-home-hero-media" aria-hidden="true">
                <img className="v2-home-hero-img" src={heroSrc} alt="" />
                <div className="v2-home-hero-shade" />
              </div>
              <div className="v2-home-hero-copy">
                <p className="v2-home-hero-kicker">You are trading with</p>
                <h1 className="v2-home-hero-name">{activeBot?.name || "No active bot"}</h1>
              </div>
            </div>

            {/* Keep existing V2 pill look + button set */}
            <div className="v2-pill-bar">
              <button
                className={`v2-pill-btn${v2Running ? " is-running" : ""}`}
                type="button"
                id="v2-trade-btn"
                onClick={() => {
                  const next = !v2Running;
                  setV2Running(next);
                  // Floating cycle profile pops in immediately with TRADE.
                  setFloatCycle(next);
                  showToast(next ? `${activeBot?.name || "Bot"} started` : "Bot stopped");
                }}
              >
                <span className="v2-pill-icon is-trade" aria-hidden="true">
                  {v2Running ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5" y="4.5" width="5.5" height="15" rx="1.3" />
                      <rect x="13.5" y="4.5" width="5.5" height="15" rx="1.3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.2 4.2v15.6L19.8 12 7.2 4.2z" />
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
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.2 13.7 7l4.8.4-3.7 3.1 1.2 4.7L12 12.8 8 15.2l1.2-4.7L5.5 7.4 10.3 7 12 2.2z" />
                    <path d="M18.2 11.2 19.1 13.6l2.5.2-1.9 1.6.6 2.4-2.1-1.2-2.1 1.2.6-2.4-1.9-1.6 2.5-.2 0.9-2.4z" />
                  </svg>
                </span>
                <span className="v2-pill-label">QUOTES</span>
              </button>
              <button className="v2-pill-btn" type="button" onClick={removeActiveBot}>
                <span className="v2-pill-icon is-remove" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9.2 3.5h5.6c.5 0 .9.4.9.9V6h3.1v2H5.2V6h3.1V4.4c0-.5.4-.9.9-.9zm1.2 2.5h3.2V5.5h-3.2V6z" />
                    <path d="M7.2 9h9.6l-.7 10.2a1.8 1.8 0 0 1-1.8 1.6H9.7a1.8 1.8 0 0 1-1.8-1.6L7.2 9z" />
                    <path d="M10.2 12.2h1.4v5.2h-1.4zm2.2 0h1.4v5.2h-1.4z" fill="#fff" />
                  </svg>
                </span>
                <span className="v2-pill-label">REMOVE</span>
              </button>
            </div>

            <p className="v2-powered-by" aria-label="Powered by apexEA">
              Powered by <span>apexEA</span>
            </p>

            <section className="v2-robots">
              <h2 className="v2-robots-title">ROBOT LIST:</h2>
              <div className="v2-robot-list">
                {activeRobots.length === 0 ? (
                  <p className="v2-robot-empty">No connected robots</p>
                ) : (
                  activeRobots.map((bot) => (
                    <button
                      key={bot.id}
                      className={`v2-robot-row${bot.id === activeBot?.id ? " is-active" : ""}`}
                      type="button"
                      onClick={() => {
                        selectBot(bot.id);
                        // Floating cycle with this profile appears immediately.
                        setFloatCycle(true);
                      }}
                    >
                      <img src={bot.photo || "/logo.png"} alt="" width="40" height="40" />
                      <span>{bot.name}</span>
                    </button>
                  ))
                )}
                <button className="v2-robot-row v2-robot-add" type="button" onClick={openLicense}>
                  <span className="v2-robot-add-icon" aria-hidden="true">
                    +
                  </span>
                  <span className="v2-robot-add-copy">
                    <strong>Add a new Robot</strong>
                    <small>Be having a new license Keys</small>
                  </span>
                </button>
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
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder="0.01"
                  value={lotSize}
                  onChange={(e) => setLotSize(e.target.value.replace(/[^\d.,]/g, ""))}
                  onBlur={() => {
                    const n = Number(String(lotSize).replace(",", "."));
                    setLotSize(Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(4))) : "0.01");
                  }}
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
            <ChartScanner variant="v2" />
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
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4.5 11.2 12 4.8l7.5 6.4v8.5a1.3 1.3 0 0 1-1.3 1.3h-4.1v-5.2h-4.2v5.2H5.8A1.3 1.3 0 0 1 4.5 19.7v-8.5z" />
          </svg>
          <span>HOME</span>
        </button>
        <button
          className={`v2-tab${v2View === "scanner" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("scanner")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
            <path d="M7 15.5 10.2 11l2.6 2.8L16.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>CHART SCANNER</span>
        </button>
        <button
          className={`v2-tab${v2View === "metatrader" ? " is-active" : ""}`}
          type="button"
          onClick={() => setV2View("metatrader")}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="9" r="3.6" />
            <path d="M5.2 19.2c.7-3.2 3.3-5 6.8-5s6.1 1.8 6.8 5" />
          </svg>
          <span>METATRADER</span>
        </button>
      </nav>

      {(floatCycle || v2Running) && v2View === "home" ? (
        <button
          ref={floatRef}
          className={`v2-float-cycle is-on${floatPos ? " is-placed" : ""}`}
          type="button"
          aria-label={`${activeBot?.name || "Bot"} trade script`}
          title="Drag to move · tap for trade script"
          style={
            floatPos
              ? { left: `${floatPos.x}px`, top: `${floatPos.y}px`, right: "auto", bottom: "auto" }
              : undefined
          }
          onPointerDown={onFloatPointerDown}
          onPointerMove={onFloatPointerMove}
          onPointerUp={onFloatPointerUp}
          onPointerCancel={onFloatPointerUp}
          onClick={(event) => {
            // Handled in pointer up — block default button click.
            event.preventDefault();
          }}
        >
          <span className="v2-float-cycle-ring" aria-hidden="true" />
          <span className="v2-float-cycle-ring v2-float-cycle-ring--outer" aria-hidden="true" />
          <img className="v2-float-cycle-photo" src={floatSrc} alt="" draggable={false} />
        </button>
      ) : null}

      {scriptOpen ? (
        <div className="v2-script-sheet" role="dialog" aria-modal="true" aria-label="Open trade script">
          <button
            className="v2-script-backdrop"
            type="button"
            aria-label="Close script"
            onClick={() => setScriptOpen(false)}
          />
          <div className="v2-script-panel">
            <header className="v2-script-head">
              <div>
                <p className="v2-script-kicker">Opening trades</p>
                <h2>{activeBot?.name || "Bot"} script</h2>
              </div>
              <button className="v2-script-close" type="button" onClick={() => setScriptOpen(false)}>
                Close
              </button>
            </header>
            <p className="v2-script-note">
              Comment tag <strong>{tradeComment}</strong> · robot stays running
            </p>
            <pre className="v2-script-code">{openTradeScript}</pre>
            <div className="v2-script-actions">
              <button className="v2-script-copy" type="button" onClick={copyOpenTradeScript}>
                Copy script
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

