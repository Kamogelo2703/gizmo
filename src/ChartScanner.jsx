import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHART_DETECTION_STATUS,
  EXECUTE_ENGINE_STEPS,
  TRADE_ENGINE_STEPS,
  analyzeChartImage,
  detectSymbolFromChart,
  sleep,
} from "./chartScanner.js";
import { buildBotTradeComment, placeTrade } from "./metaApi.js";
import { useApp } from "./store.jsx";
import {
  describeManagementPlan,
  loadTradeManagement,
  saveTradeManagement,
  splitVolumeAcrossTargets,
} from "./tradeManagement.js";

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

function formatSetupPrice(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
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
    setV2View,
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
  const [symbol, setSymbol] = useState("");
  const [symbolSource, setSymbolSource] = useState("");
  const [detectionStatus, setDetectionStatus] = useState("");
  const [detectionMessage, setDetectionMessage] = useState("");
  const [detectionHint, setDetectionHint] = useState("");
  const [detectingSymbol, setDetectingSymbol] = useState(false);
  const [trades, setTrades] = useState(1);
  const [lotSize, setLotSize] = useState(0.01);
  const [scansLeft, setScansLeft] = useState(() => loadScansLeft());
  const [signal, setSignal] = useState(null);
  const [fills, setFills] = useState([]);
  const [busy, setBusy] = useState(false);
  const [engineProgress, setEngineProgress] = useState(0);
  const [tradeManagement, setTradeManagement] = useState(() => loadTradeManagement());

  useEffect(() => {
    if (!symbol) return;
    const meta = getSymbolMeta(symbol);
    setTrades(clampTrades(meta.trades));
    setLotSize(clampLot(meta.lotSize));
  }, [symbol, getSymbolMeta]);

  const connected = Boolean(mt5Session?.accountId);
  const engineActive = engineMode === "scanning" || engineMode === "trading";
  const setupReady = Boolean(
    signal?.side &&
      signal?.entry != null &&
      signal?.takeProfit1 != null &&
      signal?.takeProfit2 != null &&
      signal?.takeProfit3 != null
  );
  const managementPlan = useMemo(
    () => describeManagementPlan(tradeManagement),
    [tradeManagement]
  );
  const activeStepLabel =
    engineMode === "trading"
      ? EXECUTE_ENGINE_STEPS[
          Math.min(engineStep, EXECUTE_ENGINE_STEPS.length - 1)
        ]?.label || "Executing trade"
      : TRADE_ENGINE_STEPS[
          Math.min(engineStep, TRADE_ENGINE_STEPS.length - 1)
        ]?.label || "Trading engine ready";

  function persistTradeSettings(nextTrades = trades, nextLot = lotSize, nextSymbol = symbol) {
    if (!nextSymbol) return;
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

  function resetDetectionState() {
    setSymbol("");
    setSymbolSource("");
    setDetectionStatus("");
    setDetectionMessage("");
    setDetectionHint("");
  }

  async function applyDetectedSymbol(dataUrl) {
    setDetectingSymbol(true);
    resetDetectionState();
    setSignal(null);
    setFills([]);
    try {
      const detection = await detectSymbolFromChart(dataUrl, {
        catalog: [...symbols, ...(catalog || [])],
      });
      const status = String(detection?.status || CHART_DETECTION_STATUS.NO_CHART);
      setDetectionStatus(status);
      setDetectionMessage(detection?.message || "");
      setDetectionHint(detection?.uiMessage || "");

      if (
        status === CHART_DETECTION_STATUS.SYMBOL_DETECTED &&
        detection?.symbol
      ) {
        const next = String(detection.symbol).toUpperCase();
        ensureCatalog?.(next);
        setSymbol(next);
        setSymbolSource("scanner");
        showToast(`Symbol detected: ${next}`);
        return next;
      }

      setSymbol("");
      setSymbolSource("");
      if (status === CHART_DETECTION_STATUS.NO_CHART) {
        showToast("No trading chart detected");
      } else if (status === CHART_DETECTION_STATUS.SYMBOL_UNCLEAR) {
        showToast("Chart detected — symbol unclear");
      } else {
        showToast(detection?.error || "Chart analysis unavailable");
      }
      return null;
    } catch {
      resetDetectionState();
      setDetectionStatus(CHART_DETECTION_STATUS.NO_CHART);
      setDetectionMessage("No trading chart detected");
      setDetectionHint("Please upload a clear trading chart.");
      showToast("Chart analysis failed");
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
      resetDetectionState();
      showToast("Analyzing image…");
      void applyDetectedSymbol(dataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function runScan() {
    if (!preview) {
      showToast("Capture or upload a chart first");
      return;
    }
    if (scansLeft <= 0) {
      showToast("No scans left");
      return;
    }
    if (
      detectionStatus === CHART_DETECTION_STATUS.NO_CHART ||
      !symbol
    ) {
      showToast("Please upload a clear trading chart.");
      return;
    }

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
      for (let i = 0; i < TRADE_ENGINE_STEPS.length; i += 1) {
        setEngineStep(i);
        setEngineProgress(10 + Math.round((i / TRADE_ENGINE_STEPS.length) * 80));
        pushEngineLog(TRADE_ENGINE_STEPS[i].label);
        await sleep(420 + i * 70);
      }

      pushEngineLog("Building complete trade setup");
      const result = await analyzeChartImage(preview, {
        catalog: [...symbols, ...(catalog || [])],
        hintSymbol: symbol,
        preferDetectedSymbol: true,
      });

      if (
        !result?.side ||
        result.entry == null ||
        result.takeProfit1 == null ||
        result.takeProfit2 == null ||
        result.takeProfit3 == null
      ) {
        throw new Error("Could not build a complete trade setup with TP1/TP2/TP3");
      }

      const tradeSymbol = String(result.detectedSymbol || result.symbol || "")
        .trim()
        .toUpperCase();
      if (!tradeSymbol) {
        const err = new Error("Chart detected — symbol unclear");
        err.code = "SYMBOL_UNCLEAR";
        throw err;
      }

      ensureCatalog?.(tradeSymbol);
      setSymbol(tradeSymbol);
      setSymbolSource("scanner");
      setDetectionStatus(CHART_DETECTION_STATUS.SETUP_READY);
      setDetectionMessage("");
      setDetectionHint("");
      persistTradeSettings(trades, lotSize, tradeSymbol);

      setSignal(result);
      setEngineStep(TRADE_ENGINE_STEPS.length - 1);
      setEngineProgress(100);
      pushEngineLog(
        `Setup ready · ${result.side} ${tradeSymbol} · Entry ${result.entry} · TP1 ${result.takeProfit1} · TP2 ${result.takeProfit2} · TP3 ${result.takeProfit3}`
      );
      showToast(`${result.side} ${tradeSymbol} setup ready`);
      await sleep(500);
      setEngineMode("idle");
    } catch (error) {
      setEngineMode("idle");
      setEngineProgress(0);
      setSignal(null);
      if (error.code === "NO_CHART") {
        resetDetectionState();
        setDetectionStatus(CHART_DETECTION_STATUS.NO_CHART);
        setDetectionMessage(error.message || "No trading chart detected");
        setDetectionHint(error.uiMessage || "Please upload a clear trading chart.");
        showToast("No trading chart detected");
      } else if (error.code === "SYMBOL_UNCLEAR") {
        setSymbol("");
        setSymbolSource("");
        setDetectionStatus(CHART_DETECTION_STATUS.SYMBOL_UNCLEAR);
        setDetectionMessage(error.message || "Chart detected — symbol unclear");
        setDetectionHint(error.uiMessage || "Chart detected — symbol unclear");
        showToast("Chart detected — symbol unclear");
      } else {
        showToast(error.message || "Scan failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function updateTradeManagement(patch) {
    setTradeManagement((prev) => saveTradeManagement({ ...prev, ...patch }));
  }

  async function executeTrade() {
    if (!signal?.side || !signal?.symbol) {
      showToast("Scan a chart first to build a setup");
      return;
    }
    if (
      signal.takeProfit1 == null ||
      signal.takeProfit2 == null ||
      signal.takeProfit3 == null
    ) {
      showToast("Setup is missing TP1/TP2/TP3");
      return;
    }
    if (!connected) {
      showToast("Connect MT5 first to execute trades");
      setZetaView("metatrader");
      setV2View("metatrader");
      return;
    }

    const tradeCount = clampTrades(trades);
    const lot = clampLot(lotSize);
    const tradeSymbol = String(signal.detectedSymbol || signal.symbol || symbol)
      .trim()
      .toUpperCase();
    if (!tradeSymbol) {
      showToast("Symbol missing from setup");
      return;
    }

    const meta = getSymbolMeta(tradeSymbol);
    const action = String(meta.action || "BOTH").toUpperCase();
    let side = signal.side;
    if (action === "BUY" || action === "SELL") side = action;

    const tradeComment = buildBotTradeComment(activeBot?.name);
    const tpMap = {
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2,
      takeProfit3: signal.takeProfit3,
    };

    setBusy(true);
    setFills([]);
    setEngineLogs([]);
    setEngineMode("trading");
    setEngineStep(0);
    setEngineProgress(12);
    persistTradeSettings(tradeCount, lot, tradeSymbol);

    try {
      pushEngineLog(
        `Opening ${side} ${tradeSymbol} · SL ${signal.stopLoss} · TP1 ${signal.takeProfit1} · TP2 ${signal.takeProfit2} · TP3 ${signal.takeProfit3}`
      );
      pushEngineLog(`Partial plan · ${managementPlan.summary}`);

      const nextFills = [];
      let lastError = "";
      let completed = 0;
      const totalLegs = tradeCount * 3;

      for (let i = 0; i < tradeCount; i += 1) {
        const legs = splitVolumeAcrossTargets(lot, tradeManagement);
        for (const leg of legs) {
          setEngineStep(0);
          const takeProfit = tpMap[leg.takeProfitKey];
          const legComment = `${tradeComment}|${leg.target}`.slice(0, 31);
          try {
            const fill = await placeTrade({
              accountId: mt5Session.accountId,
              symbol: tradeSymbol,
              volume: leg.volume,
              side,
              stopLoss: signal.stopLoss,
              takeProfit,
              region: mt5Session.region || "",
              comment: legComment,
              source: "chart-scanner",
            });
            nextFills.push({
              ...fill,
              target: leg.target,
              takeProfit,
              closePercent: leg.closePercent,
            });
            pushEngineLog(
              `${leg.target} fill · ${fill.side} ${fill.symbol} ${fill.volume} → TP ${takeProfit}`
            );
          } catch (error) {
            lastError = error.message || "Trade failed";
            nextFills.push({
              ok: false,
              symbol: tradeSymbol,
              side,
              volume: leg.volume,
              target: leg.target,
              takeProfit,
              error: lastError,
            });
            pushEngineLog(`${leg.target} failed · ${lastError}`);
          }
          completed += 1;
          setEngineStep(1);
          setEngineProgress(20 + Math.round((completed / Math.max(1, totalLegs)) * 75));
          await sleep(220);
        }
      }

      if (managementPlan.moveSlToBreakevenAfterTp1) {
        pushEngineLog(managementPlan.breakevenNote);
      }
      if (managementPlan.protectProfitAfterTp2) {
        pushEngineLog(managementPlan.protectNote);
      }

      setFills(nextFills);
      setEngineProgress(100);
      const okCount = nextFills.filter((f) => f.ok !== false).length;
      if (okCount) {
        showToast(
          `Executed ${okCount}/${nextFills.length} legs · ${side} ${tradeSymbol} with TP1/TP2/TP3`
        );
      } else {
        showToast(lastError || nextFills[0]?.error || "No trades filled");
      }
      await sleep(700);
      setEngineMode("idle");
    } catch (error) {
      setEngineMode("idle");
      setEngineProgress(0);
      showToast(error.message || "Execution failed");
    } finally {
      setBusy(false);
    }
  }

  const canScan =
    Boolean(preview) &&
    Boolean(symbol) &&
    detectionStatus !== CHART_DETECTION_STATUS.NO_CHART &&
    detectionStatus !== CHART_DETECTION_STATUS.SYMBOL_UNCLEAR &&
    scansLeft > 0;

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
              <p className="cs-empty-copy">
                Point the camera at a chart or upload a screenshot
              </p>
              <span className="cs-empty-orb" aria-hidden="true" />
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
            <p className="cs-engine-status">
              {engineActive
                ? activeStepLabel
                : setupReady
                  ? "Setup ready — waiting for Execute Trade"
                  : "Armed and ready"}
            </p>
          </div>
          <span className="cs-engine-pct">
            {engineActive ? `${engineProgress}%` : setupReady ? "100%" : "0%"}
          </span>
        </div>
        <div className="cs-engine-track">
          <span
            className="cs-engine-fill"
            style={{ width: `${engineActive ? engineProgress : setupReady ? 100 : 0}%` }}
          />
        </div>
        {engineActive && engineLogs.length ? (
          <p className="cs-engine-log">{engineLogs[engineLogs.length - 1]}</p>
        ) : null}
      </div>

      <div className="cs-controls">
        <label className={`cs-field${symbolSource === "scanner" ? " is-from-scanner" : ""}`}>
          <span>
            Symbol
            {detectingSymbol
              ? " · scanner reading…"
              : symbolSource === "scanner"
                ? " · from scanner"
                : " · auto from chart"}
          </span>
          <input
            className="cs-lot cs-symbol-auto"
            value={detectingSymbol ? "" : symbol || "—"}
            readOnly
            disabled={busy || detectingSymbol}
            placeholder={detectingSymbol ? "Analyzing image…" : "—"}
          />
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

      <div className="cs-tp-config" aria-label="Take-profit risk reward ratios">
        <p className="cs-tp-config-label">TP targets</p>
        <div className="cs-tp-config-row" role="group" aria-label="Fixed TP ratios">
          <div className="cs-tp-ratio">
            <span>TP1</span>
            <strong>1:1</strong>
          </div>
          <div className="cs-tp-ratio">
            <span>TP2</span>
            <strong>1:2</strong>
          </div>
          <div className="cs-tp-ratio">
            <span>TP3</span>
            <strong>1:3</strong>
          </div>
        </div>
        <label className="cs-tp-toggle">
          <input
            type="checkbox"
            checked={tradeManagement.moveSlToBreakevenAfterTp1}
            disabled={busy}
            onChange={(e) =>
              updateTradeManagement({ moveSlToBreakevenAfterTp1: e.target.checked })
            }
          />
          <span>Move SL to breakeven after TP1</span>
        </label>
        <label className="cs-tp-toggle">
          <input
            type="checkbox"
            checked={tradeManagement.protectProfitAfterTp2}
            disabled={busy}
            onChange={(e) =>
              updateTradeManagement({ protectProfitAfterTp2: e.target.checked })
            }
          />
          <span>Protect profit after TP2</span>
        </label>
      </div>

      {detectionMessage &&
      !detectingSymbol &&
      detectionStatus !== CHART_DETECTION_STATUS.SYMBOL_DETECTED &&
      detectionStatus !== CHART_DETECTION_STATUS.SETUP_READY ? (
        <p
          className={`cs-detection-status${
            detectionStatus === CHART_DETECTION_STATUS.SYMBOL_UNCLEAR
              ? " is-warn"
              : " is-error"
          }`}
          aria-live="polite"
        >
          <span>{detectionMessage}</span>
          {detectionHint && detectionHint !== detectionMessage ? (
            <span className="cs-detection-hint">{detectionHint}</span>
          ) : null}
        </p>
      ) : null}

      {!setupReady ? (
        <button
          className="cs-run-btn"
          type="button"
          onClick={runScan}
          disabled={busy || detectingSymbol || !canScan}
        >
          {busy && engineMode === "scanning"
            ? "Building trade setup…"
            : detectingSymbol
              ? "Analyzing chart…"
              : detectionStatus === CHART_DETECTION_STATUS.NO_CHART
                ? "Upload a trading chart"
                : detectionStatus === CHART_DETECTION_STATUS.SYMBOL_UNCLEAR
                  ? "Symbol unclear on chart"
                  : !symbol
                    ? "Waiting for symbol…"
                    : "Scan Chart"}
        </button>
      ) : (
        <button
          className="cs-run-btn"
          type="button"
          onClick={executeTrade}
          disabled={busy || !connected}
        >
          {busy && engineMode === "trading"
            ? "Sending to MetaTrader…"
            : !connected
              ? "Connect MT5 to Execute"
              : "Execute Trade"}
        </button>
      )}

      {setupReady && !engineActive ? (
        <div className={`cs-result cs-result--${String(signal.side).toLowerCase()}`}>
          <p className="cs-result-kicker">Trade Signal</p>
          <strong>
            {signal.side} {signal.symbol}
          </strong>
          <span className="cs-result-meta">
            Confidence {signal.confidence}% · {signal.timeframe || "M15"}
          </span>

          <div className="cs-setup-grid">
            <span>
              <em>Entry</em>
              {formatSetupPrice(signal.entry)}
            </span>
            <span>
              <em>Stop Loss</em>
              {formatSetupPrice(signal.stopLoss)}
            </span>
            <span className="cs-tp cs-tp--1">
              <em>TP1 · 1:1</em>
              {formatSetupPrice(signal.takeProfit1)}
            </span>
            <span className="cs-tp cs-tp--2">
              <em>TP2 · 1:2</em>
              {formatSetupPrice(signal.takeProfit2)}
            </span>
            <span className="cs-tp cs-tp--3">
              <em>TP3 · 1:3</em>
              {formatSetupPrice(signal.takeProfit3)}
            </span>
            <span>
              <em>Risk / Reward</em>
              1:1 · 1:2 · 1:3
            </span>
          </div>

          <span className="cs-setup-analysis">
            {signal.analysis || signal.reasons?.[0] || "Setup from chart structure"}
          </span>
          <span className="cs-setup-plan">TP targets · 1:1 · 1:2 · 1:3</span>

          {fills.length ? (
            <span>
              {fills.filter((f) => f.ok !== false).length}/{fills.length} legs filled
              {fills
                .filter((f) => f.ok !== false && f.target)
                .map((f) => ` · ${f.target}`)
                .join("") ||
                (fills.some((f) => f.ok === false)
                  ? ` · ${fills.find((f) => f.ok === false)?.error || "failed"}`
                  : "")}
            </span>
          ) : (
            <span className="cs-setup-wait">Waiting for Execute Trade</span>
          )}
        </div>
      ) : null}

      {!connected ? (
        <button
          className="cs-connect-link"
          type="button"
          onClick={() => {
            setZetaView("metatrader");
            setV2View("metatrader");
          }}
        >
          Connect MetaTrader before executing →
        </button>
      ) : null}
    </section>
  );
}
