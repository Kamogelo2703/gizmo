import { useEffect, useMemo, useRef, useState } from "react";
import EnginePanel from "./EnginePanel.jsx";
import {
  TRADE_ENGINE_STEPS,
  analyzeChartImage,
  sleep,
} from "./chartScanner.js";
import { placeTrade } from "./metaApi.js";
import { useApp } from "./store.jsx";

export default function ChartScanner() {
  const {
    activeBot,
    eas,
    catalog,
    getSymbolMeta,
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

  const fileRef = useRef(null);
  const symbols = useMemo(() => {
    const ea = eas.find((item) => item.id === activeBot?.id);
    const fromEa = Array.isArray(ea?.symbols) ? ea.symbols : [];
    if (fromEa.length) return fromEa;
    if (catalog?.length) return catalog.slice(0, 12);
    return ["EURUSD", "XAUUSD", "GBPUSD", "USDJPY"];
  }, [activeBot, eas, catalog]);

  const [preview, setPreview] = useState("");
  const [symbol, setSymbol] = useState("EURUSD");
  const [autoExecute, setAutoExecute] = useState(true);
  const [signal, setSignal] = useState(null);
  const [fills, setFills] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (symbols.length && !symbols.includes(symbol)) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  const connected = Boolean(mt5Session?.accountId);

  function openPicker() {
    fileRef.current?.click();
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
      setPreview(String(reader.result || ""));
      setSignal(null);
      setFills([]);
      showToast("Chart loaded — start scan");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function runScanAndTrade() {
    if (!preview) {
      showToast("Upload a chart first");
      return;
    }
    if (!symbol) {
      showToast("Pick a symbol");
      return;
    }

    setBusy(true);
    setSignal(null);
    setFills([]);
    setEngineLogs([]);
    setEngineMode("scanning");
    setEngineStep(0);

    try {
      for (let i = 0; i < 4; i += 1) {
        setEngineStep(i);
        pushEngineLog(TRADE_ENGINE_STEPS[i].label);
        await sleep(450 + i * 120);
      }

      const result = await analyzeChartImage(preview, { symbol });
      setSignal(result);
      setEngineStep(3);
      pushEngineLog(`Signal ${result.side} ${result.symbol} · ${result.confidence}%`);

      const meta = getSymbolMeta(symbol);
      const lot = Number(meta.lotSize) > 0 ? Number(meta.lotSize) : 0.01;
      const count = Math.max(1, Math.min(10, Math.floor(Number(meta.trades) || 1)));
      const action = String(meta.action || "BOTH").toUpperCase();
      let side = result.side;
      if (action === "BUY" || action === "SELL") side = action;

      if (!autoExecute) {
        setEngineMode("idle");
        showToast(`Scan complete · ${side} ${symbol}`);
        return;
      }

      if (!connected) {
        setEngineMode("idle");
        showToast("Connect MT5 first to execute trades");
        setZetaView("metatrader");
        return;
      }

      setEngineMode("trading");
      setEngineStep(4);
      pushEngineLog(`Routing ${count}× ${side} ${symbol} @ ${lot} lots`);

      const nextFills = [];
      for (let i = 0; i < count; i += 1) {
        try {
          const fill = await placeTrade({
            accountId: mt5Session.accountId,
            symbol,
            volume: lot,
            side,
            region: mt5Session.region || "",
            comment: `ApexEA scan ${result.confidence}`,
          });
          nextFills.push(fill);
          pushEngineLog(`Fill ${i + 1}/${count} · ${side} ${symbol}`);
        } catch (error) {
          nextFills.push({
            ok: false,
            symbol,
            side,
            volume: lot,
            error: error.message || "Trade failed",
          });
          pushEngineLog(`Order ${i + 1} failed · ${error.message || "rejected"}`);
        }
        await sleep(350);
      }

      setFills(nextFills);
      setEngineStep(5);
      const okCount = nextFills.filter((f) => f.ok !== false).length;
      if (okCount) {
        showToast(`Executed ${okCount}/${count} ${side} ${symbol} on MT5`);
      } else {
        showToast(nextFills[0]?.error || "No trades filled");
      }
      await sleep(900);
      setEngineMode("idle");
    } catch (error) {
      setEngineMode("idle");
      showToast(error.message || "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view is-active view-scanner">
      <header className="scanner-top">
        <div className="scanner-title-wrap">
          <span className="scanner-dot" />
          <h2 className="scanner-title">Scanner</h2>
        </div>
        <p className={`scanner-mt-pill${connected ? " is-on" : ""}`}>
          {connected
            ? `MT5 · ${mt5Session.login || mt5Session.server}`
            : "MT5 offline"}
        </p>
      </header>

      {(engineMode === "scanning" || engineMode === "trading") && (
        <EnginePanel
          mode={engineMode}
          stepIndex={engineStep}
          logs={engineLogs}
          signal={signal}
          fills={fills}
          subtitle={
            connected
              ? `Live account ${mt5Session.company || mt5Session.server}`
              : "Scan only — connect MetaTrader to execute"
          }
        />
      )}

      <div className="scanner-hero">
        <div className="scanner-orb">
          {preview ? (
            <img src={preview} alt="Uploaded chart" width="120" height="120" />
          ) : (
            <img src="/logo.png" alt="" width="120" height="120" />
          )}
        </div>
        <p className="scanner-brand">{activeBot?.name || "ApexEA"}</p>
        <h3 className="scanner-heading">Chart Scanner</h3>
        <p className="scanner-sub">
          Upload a chart. Trading Engine scans it, then fires to your connected MT5.
        </p>

        <label className="scanner-symbol">
          <span>Symbol</span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="scanner-auto">
          <input
            type="checkbox"
            checked={autoExecute}
            onChange={(e) => setAutoExecute(e.target.checked)}
          />
          <span>Auto-execute on connected MT5</span>
        </label>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFile}
        />

        <div className="scanner-actions">
          <button className="upload-btn" type="button" onClick={openPicker} disabled={busy}>
            {preview ? "Replace Chart" : "Upload Chart"}
          </button>
          <button
            className="scan-exec-btn"
            type="button"
            onClick={runScanAndTrade}
            disabled={busy || !preview}
          >
            {busy ? "Engine running…" : autoExecute ? "Scan & Trade" : "Scan Chart"}
          </button>
        </div>

        {signal && engineMode === "idle" ? (
          <div className={`scanner-result scanner-result--${signal.side.toLowerCase()}`}>
            <strong>
              {signal.side} {signal.symbol}
            </strong>
            <span>{signal.confidence}% · {signal.reasons?.[0]}</span>
            {fills.length ? (
              <span>
                {fills.filter((f) => f.ok !== false).length}/{fills.length} orders sent
              </span>
            ) : null}
          </div>
        ) : null}

        {!connected ? (
          <button
            className="scanner-connect-link"
            type="button"
            onClick={() => setZetaView("metatrader")}
          >
            Connect MetaTrader to enable live execution →
          </button>
        ) : null}
      </div>
    </section>
  );
}
