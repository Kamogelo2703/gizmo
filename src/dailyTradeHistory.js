const STORAGE_KEY = "apexea-daily-trades-v1";

/** Local calendar day key — history resets when this changes. */
export function todayTradeDayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return { day: todayTradeDayKey(), trades: [] };
    const day = String(raw.day || "");
    const trades = Array.isArray(raw.trades) ? raw.trades : [];
    return { day, trades };
  } catch {
    return { day: todayTradeDayKey(), trades: [] };
  }
}

function writeStore(day, trades) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day, trades }));
  } catch {
    // ignore quota
  }
}

/** Today's taken trades only — empty list after midnight rollover. */
export function loadTodayTrades(now = new Date()) {
  const today = todayTradeDayKey(now);
  const store = readStore();
  if (store.day !== today) {
    writeStore(today, []);
    return [];
  }
  return store.trades
    .map((row) => ({
      id: String(row?.id || `${row?.at || ""}-${row?.symbol || ""}`),
      at: Number(row?.at) || 0,
      botName: String(row?.botName || "Bot").trim() || "Bot",
      symbol: String(row?.symbol || "").trim().toUpperCase(),
      lotSize: Number(row?.lotSize) > 0 ? Number(row.lotSize) : 0.01,
      action: String(row?.action || row?.side || "TRADE").trim().toUpperCase(),
      comment: String(row?.comment || "").trim(),
    }))
    .filter((row) => row.at > 0)
    .sort((a, b) => b.at - a.at);
}

export function recordTodayTrade(details = {}, now = new Date()) {
  const today = todayTradeDayKey(now);
  const store = readStore();
  const trades = store.day === today ? [...store.trades] : [];
  const entry = {
    id: `${Date.now()}-${String(details.symbol || "SYM")}-${Math.random().toString(36).slice(2, 7)}`,
    at: Number(details.at) || Date.now(),
    botName: String(details.botName || "Bot").trim() || "Bot",
    symbol: String(details.symbol || "").trim().toUpperCase() || "—",
    lotSize: Number(details.lotSize) > 0 ? Number(details.lotSize) : 0.01,
    action: String(details.action || details.side || "TRADE").trim().toUpperCase(),
    comment: String(details.comment || "").trim(),
  };
  // Avoid double-recording the same live pulse.
  const dup = trades.some(
    (row) =>
      Math.abs(Number(row.at) - entry.at) < 1500 &&
      String(row.symbol).toUpperCase() === entry.symbol &&
      String(row.action).toUpperCase() === entry.action &&
      Number(row.lotSize) === entry.lotSize
  );
  if (dup) return loadTodayTrades(now);
  trades.unshift(entry);
  writeStore(today, trades.slice(0, 80));
  return loadTodayTrades(now);
}

export function formatTradeHistoryLines(trades = []) {
  if (!trades.length) {
    return "No trades taken today.\nHistory resets tomorrow.";
  }
  return trades
    .map((row) => {
      const symbol = String(row.symbol || "—").trim().toUpperCase() || "—";
      const raw = String(row.action || "TRADE").trim().toUpperCase();
      const side =
        raw === "BUY" || raw === "SELL"
          ? raw
          : raw.includes("BUY")
            ? "BUY"
            : raw.includes("SELL")
              ? "SELL"
              : raw || "TRADE";
      return `${symbol} was a ${side}`;
    })
    .join("\n");
}
