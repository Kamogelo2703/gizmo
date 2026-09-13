const HISTORY_KEY = "apexea-scan-history-v1";
const LEGACY_KEYS = ["apexea-scan-history-v1", "apexea-scan-history"];
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
    const primary = safeParse(localStorage.getItem(HISTORY_KEY));
    if (primary.length) return primary.slice(0, MAX_ITEMS);
    for (const key of LEGACY_KEYS) {
      if (key === HISTORY_KEY) continue;
      const legacy = safeParse(localStorage.getItem(key));
      if (legacy.length) {
        saveScanHistory(legacy);
        return legacy.slice(0, MAX_ITEMS);
      }
    }
    return [];
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
        index < 10 ? item : { ...item, image: "" }
      );
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
    } catch {
      // ignore
    }
  }
  return next;
}

/** Shrink chart data-URLs so history survives localStorage limits. */
export async function compressHistoryImage(dataUrl, { maxW = 720, quality = 0.62 } = {}) {
  const src = String(dataUrl || "");
  if (!src.startsWith("data:image/")) return "";
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image"));
      el.src = src;
    });
    const scale = Math.min(1, maxW / Math.max(1, img.width));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src.slice(0, 400_000);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // Keep a truncated original only as last resort.
    return src.length > 350_000 ? "" : src;
  }
}

export async function addScanHistoryEntry(entry) {
  const image = await compressHistoryImage(entry?.image || "");
  const analysis = String(entry?.analysis || entry?.reason || "").trim();
  const reasons = Array.isArray(entry?.reasons)
    ? entry.reasons.map((r) => String(r)).filter(Boolean).slice(0, 4)
    : analysis
      ? [analysis]
      : [];

  const item = {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    side: String(entry?.side || "").toUpperCase(),
    symbol: String(entry?.symbol || "").toUpperCase(),
    confidence: Number(entry?.confidence) || 0,
    timeframe: String(entry?.timeframe || "M15").toUpperCase(),
    entry: entry?.entry ?? null,
    stopLoss: entry?.stopLoss ?? null,
    takeProfit1: entry?.takeProfit1 ?? null,
    takeProfit2: entry?.takeProfit2 ?? null,
    takeProfit3: entry?.takeProfit3 ?? null,
    riskReward: entry?.riskReward || "1:1 · 1:2 · 1:3",
    analysis: analysis || reasons[0] || "Setup from chart structure",
    reasons,
    image,
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
