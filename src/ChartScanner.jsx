import { useEffect, useMemo, useRef, useState } from "react";
import {
  TRADE_ENGINE_STEPS,
  analyzeChartImage,
  detectSymbolFromChart,
  sleep,
} from "./chartScanner.js";
import { buildBotTradeComment, placeTrade } from "./metaApi.js";
import { useApp } from "./store.jsx";

const SCANS_KEY = "apexea-scans-left";
const DEFAULT_SCANS = 25;

function loadScansLeft() {
  try {
    const raw = localStorage.getItem(SCANS_KEY);
    if (raw == null) return DEFAULT_SCANS;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : DEFAULT_SCANS;
  } catch {
    return DEFAULT_SCANS;
  }
}

function saveScansLeft(value) {
  try {
    localStorage.setItem(SCANS_KEY, String(value));
  } catch {
    // ignore
  }
}

function clampTrades(value) {
  const n = Math.floor(Number(value) || 1);
  return Math.min(20, Math.max(1, n));
}

function clampLot(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0.01;
  return Math.min(100, Math.max(0.01, Number(n.toFixed(2))));
}

export default function ChartScanner() {
  const {
    activeBot,
    eas,
    catalog,
    getSymbolMeta,
    saveSymbolMeta,
    ensureCatalog,
    mt5Session,
    setZetaView,
    showToast,
    setEngineMode,
    setEngineStep,
    setEngineLogs,
    pushEngineLog,
    engineMode,
    engineStep,
    engineLogs,
  } = useApp();

  const uploadRef = useRef(null);
  const cameraRef = useRef(null);
  const symbols = useMemo(() => {
    const ea = eas.find((item) => item.id === activeBot?.id);
    const fromEa = Array.isArray(ea?.symbols) ? ea.symbols : [];
    if (fromEa.length) return fromEa;
    if (catalog?.length) return catalog.slice(0, 12);
    return ["EURUSD", "XAUUSD", "GBPUSD", "USDJPY"];
  }, [activeBot, eas, catalog]);

  const [preview, setPreview] = useState("");
  const [symbol, setSymbol] = useState("EURUSD");
  const [symbolSource, setSymbolSource] = useState("manual");
  const [detectingSymbol, setDetectingSymbol] = useState(false);
  const [trades, setTrades] = useState(1);
  const [lotSize, setLotSize] = useState(0.01);
  const [scansLeft, setScansLeft] = useState(() => loadScansLeft());
  const [signal, setSignal] = useState(null);
  const [fills, setFills] = useState([]);
  const [busy, setBusy] = useState(false);
  const [engineProgress, setEngineProgress] = useState(0);

  useEffect(() => {
    // Don't overwrite a symbol read from the chart screenshot.
    if (symbolSource === "chart") return;
    if (!symbol && symbols.length) setSymbol(symbols[0]);
  }, [symbols, symbol, symbolSource]);

  useEffect(() => {
    const meta = getSymbolMeta(symbol);
    setTrades(clampTrades(meta.trades));
    setLotSize(clampLot(meta.lotSize));
  }, [symbol, getSymbolMeta]);

  const connected = Boolean(mt5Session?.accountId);
  const engineActive = engineMode === "scanning" || engineMode === "trading";
  const activeStepLabel =
    TRADE_ENGINE_STEPS[Math.min(engineStep, TRADE_ENGINE_STEPS.length - 1)]?.label ||
    "Trading engine ready";

  function persistTradeSettings(nextTrades = trades, nextLot = lotSize, nextSymbol = symbol) {
    const meta = getSymbolMeta(nextSymbol);
    saveSymbolMeta(nextSymbol, {
      ...meta,
      trades: clampTrades(nextTrades),
      lotSize: clampLot(nextLot),
      platform: meta.platform || "MT5",
      action: meta.action || "BOTH",
    });
  }

  function openUpload() {
    uploadRef.current?.click();
  }

  function openCamera() {
    cameraRef.current?.click();
  }

  async function applyDetectedSymbol(dataUrl) {
    setDetectingSymbol(true);
    try {
      const detection = await detectSymbolFromChart(dataUrl, {
        catalog: [...symbols, ...(catalog || [])],
      });
      if (detection?.symbol) {
        const next = String(detection.symbol).toUpperCase();
        ensureCatalog?.(next);
        setSymbol(next);
        setSymbolSource("chart");
        showToast(`Symbol from chart: ${next}`);
        return next;
      }
      setSymbolSource("manual");
      showToast("Could not read symbol from chart — pick one");
      return null;
    } catch {
      setSymbolSource("manual");
      return null;
    } finally {
      setDetectingSymbol(false);
    }
  }

  function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Upload a chart screenshot image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPreview(dataUrl);
      setSignal(null);
      setFills([]);
      setEngineProgress(0);
      showToast("Chart ready to scan");
      void applyDetectedSymbol(dataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function runScanAndTrade() {
    if (!preview) {
      showToast("Capture or upload a chart first");
      return;
    }
    if (scansLeft <= 0) {
      showToast("No scans left");
      return;
    }
    if (!connected) {
      showToast("Connect MT5 first to execute trades");
      setZetaView("metatrader");
      return;
    }

    const tradeCount = clampTrades(trades);
    const lot = clampLot(lotSize);

    setBusy(true);
    setSignal(null);
    setFills([]);
    setEngineLogs([]);
    setEngineMode("scanning");
    setEngineStep(0);
    setEngineProgress(8);

    const nextScans = Math.max(0, scansLeft - 1);
    setScansLeft(nextScans);
    saveScansLeft(nextScans);

    try {
      for (let i = 0; i < 4; i += 1) {
        setEngineStep(i);
        setEngineProgress(12 + i * 12);
        pushEngineLog(TRADE_ENGINE_STEPS[i].label);
        await sleep(520 + i * 90);
      }

      pushEngineLog("Reading symbol from chart screenshot");
      const result = await analyzeChartImage(preview, {
        symbol,
        catalog: [...symbols, ...(catalog || [])],
        preferDetectedSymbol: true,
      });
      if (!result?.side) {
        throw new Error("Scan produced no trade signal");
      }

      const tradeSymbol = String(result.detectedSymbol || result.symbol || symbol || "")
        .trim()
        .toUpperCase();
      if (!tradeSymbol) {
        throw new Error("Could not read the symbol on this chart");
      }

      ensureCatalog?.(tradeSymbol);
      setSymbol(tradeSymbol);
      setSymbolSource(result.detectedSymbol ? "chart" : "manual");
      persistTradeSettings(tradeCount, lot, tradeSymbol);

      setSignal(result);
      setEngineStep(3);
      setEngineProgress(55);
      pushEngineLog(`Signal ${result.side} ${tradeSymbol} · ${result.confidence}%`);
      await sleep(420);

      const meta = getSymbolMeta(tradeSymbol);
      const action = String(meta.action || "BOTH").toUpperCase();
      let side = result.side;
      if (action === "BUY" || action === "SELL") side = action;

      const tradeComment = buildBotTradeComment(activeBot?.name);

      setEngineMode("trading");
      setEngineStep(4);
      setEngineProgress(68);
      pushEngineLog(
        `Opening ${tradeCount}× ${side} ${tradeSymbol} @ ${lot} lots · ${tradeComment}`
      );

      const nextFills = [];
      let lastError = "";
      for (let i = 0; i < tradeCount; i += 1) {
        try {
          const fill = await placeTrade({
            accountId: mt5Session.accountId,
            symbol: tradeSymbol,
            volume: lot,
            side,
            region: mt5Session.region || "",
            comment: tradeComment,
            source: "chart-scanner",
          });
          nextFills.push(fill);
          pushEngineLog(
            `Fill ${i + 1}/${tradeCount} · ${fill.side} ${fill.symbol} ${fill.volume} · ${tradeComment}`
          );
        } catch (error) {
          lastError = error.message || "Trade failed";
          nextFills.push({
            ok: false,
            symbol: tradeSymbol,
            side,
            volume: lot,
            error: lastError,
          });
          pushEngineLog(`Order ${i + 1} failed · ${lastError}`);
        }
        setEngineProgress(68 + Math.round(((i + 1) / tradeCount) * 24));
        await sleep(280);
      }

      setFills(nextFills);
      setPreview("");
      setEngineStep(5);
      setEngineProgress(100);
      const okCount = nextFills.filter((f) => f.ok !== false).length;
      if (okCount) {
        const filled = nextFills.find((f) => f.ok !== false);
        showToast(
          `Executed ${okCount}/${tradeCount} ${filled.side} ${filled.symbol} @ ${filled.volume} · ${tradeComment}`
        );
      } else {
        showToast(lastError || nextFills[0]?.error || "No trades filled");
      }
      await sleep(900);
      setEngineMode("idle");
    } catch (error) {
      setEngineMode("idle");
      setEngineProgress(0);
      showToast(error.message || "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view is-active view-scanner">
      <header className="cs-head">
        <div className="cs-head-main">
          <p className="cs-kicker">{activeBot?.name || "ApexEA"}</p>
          <h2 className="cs-title">Chart Scanner</h2>
        </div>
        <div className="cs-head-meta">
          <span className="cs-scans-left">{scansLeft} scans left</span>
          <span className={`cs-mt-pill${connected ? " is-on" : ""}`}>
            {connected ? `MT5 · ${mt5Session.login}` : "MT5 offline"}
          </span>
        </div>
      </header>

      <div className={`cs-stage${engineActive ? " is-running" : ""}${preview ? " has-chart" : ""}`}>
        <div className="cs-viewport" aria-label="Chart preview">
          {preview ? (
            <img className="cs-chart" src={preview} alt="Chart to scan" />
          ) : (
            <div className="cs-empty">
              <span className="cs-empty-orb" />
              <p>Point the camera at a chart or upload a screenshot</p>
            </div>
          )}
          <div className={`cs-scan-beam${engineActive ? " is-on" : ""}`} aria-hidden="true" />
          <div className={`cs-scan-grid${engineActive ? " is-on" : ""}`} aria-hidden="true" />
          {engineActive ? (
            <div className="cs-engine-chip">
              <span className="cs-engine-pulse" />
              <span>{engineMode === "scanning" ? "Scanning" : "Trading"}</span>
            </div>
          ) : null}
        </div>

        <div className="cs-capture-row">
          <button className="cs-capture-btn" type="button" onClick={openCamera} disabled={busy}>
            <span className="cs-capture-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8A1.5 1.5 0 0 1 10.9 3.5h2.2a1.5 1.5 0 0 1 1.2.7L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
            Camera
          </button>
          <button className="cs-capture-btn" type="button" onClick={openUpload} disabled={busy}>
            <span className="cs-capture-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v10m0-10 3.5 3.5M12 4 8.5 7.5M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Upload
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={onFile}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFile}
        />
      </div>

      <div className={`cs-engine${engineActive ? " is-open" : ""}`} aria-live="polite">
        <div className="cs-engine-top">
          <div>
            <p className="cs-engine-kicker">Trading Engine</p>
            <p className="cs-engine-status">{engineActive ? activeStepLabel : "Armed and ready"}</p>
          </div>
          <span className="cs-engine-pct">{engineActive ? `${engineProgress}%` : "0%"}</span>
        </div>
        <div className="cs-engine-track">
          <span className="cs-engine-fill" style={{ width: `${engineProgress}%` }} />
        </div>
        {engineActive && engineLogs.length ? (
          <p className="cs-engine-log">{engineLogs[engineLogs.length - 1]}</p>
        ) : null}
      </div>

      <div className="cs-controls">
        <label className="cs-field">
          <span>
            Symbol
            {detectingSymbol
              ? " · reading chart…"
              : symbolSource === "chart"
                ? " · from chart"
                : ""}
          </span>
          <input
            className="cs-lot"
            list="cs-symbol-options"
            value={symbol}
            disabled={busy || detectingSymbol}
            placeholder="Auto from chart"
            onChange={(e) => {
              setSymbol(String(e.target.value || "").toUpperCase());
              setSymbolSource("manual");
            }}
            onBlur={() => {
              const next = String(symbol || "")
                .trim()
                .toUpperCase();
              if (!next) return;
              ensureCatalog?.(next);
              setSymbol(next);
              persistTradeSettings(trades, lotSize, next);
            }}
          />
          <datalist id="cs-symbol-options">
            {symbols.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label className="cs-field">
          <span>Trades</span>
          <div className="cs-stepper">
            <button
              type="button"
              aria-label="Fewer trades"
              disabled={busy || trades <= 1}
              onClick={() => {
                const next = clampTrades(trades - 1);
                setTrades(next);
                persistTradeSettings(next, lotSize);
              }}
            >
              −
            </button>
            <input
              type="number"
              min="1"
              max="20"
              value={trades}
              disabled={busy}
              onChange={(e) => setTrades(clampTrades(e.target.value))}
              onBlur={() => persistTradeSettings(trades, lotSize)}
            />
            <button
              type="button"
              aria-label="More trades"
              disabled={busy || trades >= 20}
              onClick={() => {
                const next = clampTrades(trades + 1);
                setTrades(next);
                persistTradeSettings(next, lotSize);
              }}
            >
              +
            </button>
          </div>
        </label>

        <label className="cs-field">
          <span>Lot size</span>
          <input
            className="cs-lot"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={lotSize}
            disabled={busy}
            onChange={(e) => setLotSize(clampLot(e.target.value))}
            onBlur={() => persistTradeSettings(trades, lotSize)}
          />
        </label>
      </div>

      <button
        className="cs-run-btn"
        type="button"
        onClick={runScanAndTrade}
        disabled={busy || !preview || scansLeft <= 0}
      >
        {busy ? "Trading engine running…" : "Scan & Open Trades"}
      </button>

      {signal && !engineActive ? (
        <div className={`cs-result cs-result--${signal.side.toLowerCase()}`}>
          <strong>
            {signal.side} {fills[0]?.symbol || signal.symbol}
          </strong>
          <span>
            {signal.confidence}% · {signal.reasons?.[0]}
          </span>
          {fills.length ? (
            <span>
              {fills.filter((f) => f.ok !== false).length}/{fills.length} filled
              {fills.some((f) => f.ok === false)
                ? ` · ${fills.find((f) => f.ok === false)?.error || "failed"}`
                : fills[0]?.volume
                  ? ` · lot ${fills[0].volume}`
                  : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {!connected ? (
        <button
          className="cs-connect-link"
          type="button"
          onClick={() => setZetaView("metatrader")}
        >
          Connect MetaTrader before scanning →
        </button>
      ) : null}
    </section>
  );
}
