const HISTORY_KEY = "apexea-scan-history-v1";
const MAX_ITEMS = 40;

function safeParse(raw) {
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function loadScanHistory() {
  try {
    return safeParse(localStorage.getItem(HISTORY_KEY)).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveScanHistory(items) {
  const next = (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full — drop older images and retry once.
    try {
      const slim = next.map((item, index) =>
        index < 8 ? item : { ...item, image: "" }
      );
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
    } catch {
      // ignore
    }
  }
  return next;
}

export function addScanHistoryEntry(entry) {
  const item = {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    side: entry?.side || "",
    symbol: entry?.symbol || "",
    confidence: Number(entry?.confidence) || 0,
    timeframe: entry?.timeframe || "",
    entry: entry?.entry ?? null,
    stopLoss: entry?.stopLoss ?? null,
    takeProfit1: entry?.takeProfit1 ?? null,
    takeProfit2: entry?.takeProfit2 ?? null,
    takeProfit3: entry?.takeProfit3 ?? null,
    riskReward: entry?.riskReward || "1:1 · 1:2 · 1:3",
    analysis: entry?.analysis || "",
    reasons: Array.isArray(entry?.reasons) ? entry.reasons.slice(0, 4) : [],
    image: String(entry?.image || "").startsWith("data:image/")
      ? entry.image
      : "",
    live: true,
  };
  const next = [item, ...loadScanHistory()].slice(0, MAX_ITEMS);
  return saveScanHistory(next);
}

export function formatScanTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
