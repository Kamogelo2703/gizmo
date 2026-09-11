function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read chart image"));
    img.src = src;
  });
}

function sampleBias(imageData) {
  const { data, width, height } = imageData;
  let bull = 0;
  let bear = 0;
  let bright = 0;
  let dark = 0;
  const step = Math.max(4, Math.floor((width * height) / 12000));

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r + g + b) / 3;
    if (lum > 180) bright += 1;
    if (lum < 50) dark += 1;
    // Candlestick greens / blues vs reds / oranges
    if (g > r + 18 && g > b + 8) bull += 1;
    if (r > g + 18 && r > b + 8) bear += 1;
  }

  const total = Math.max(1, bull + bear);
  const bullRatio = bull / total;
  const structure = bright > dark ? "light-theme" : "dark-theme";
  return { bull, bear, bullRatio, structure };
}

const COMMON_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURJPY",
  "GBPJPY",
  "EURGBP",
  "XAUUSD",
  "XAGUSD",
  "BTCUSD",
  "ETHUSD",
  "US30",
  "US500",
  "NAS100",
  "GER40",
  "UK100",
];

function normalizeDetectedSymbol(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[\/_\-]/g, "")
    .replace(/[^A-Z0-9.]/g, "");
}

function compactSymbol(raw) {
  const full = normalizeDetectedSymbol(raw);
  // Keep broker suffix if present (EURUSD.mic → base EURUSD for matching)
  const base = full.split(".")[0];
  return { full, base };
}

function scoreCandidate(candidate, catalog = []) {
  const { full, base } = compactSymbol(candidate);
  if (!base || base.length < 4) return null;
  const catalogSet = new Set(
    (catalog || []).map((s) => compactSymbol(s).base).filter(Boolean)
  );
  let score = 1;
  if (COMMON_SYMBOLS.includes(base)) score += 3;
  if (catalogSet.has(base)) score += 4;
  if (/^[A-Z]{6}$/.test(base)) score += 2;
  if (/^(XAU|XAG|BTC|ETH)/.test(base)) score += 2;
  if (/^(US30|US500|NAS100|GER40|UK100)$/.test(base)) score += 2;
  // Prefer returning a catalog/broker-friendly form when possible
  const catalogHit = (catalog || []).find((s) => compactSymbol(s).base === base);
  return {
    symbol: catalogHit || full || base,
    base,
    score,
  };
}

function extractSymbolCandidates(text) {
  const upper = String(text || "").toUpperCase();
  const hits = [];

  // EUR/USD, EUR-USD, EUR USD, EURUSD, EURUSD.mic
  const pairRe =
    /\b([A-Z]{3})\s*[\/\-\s]?\s*([A-Z]{3})(?:\.[A-Z0-9]+)?\b/g;
  let m;
  while ((m = pairRe.exec(upper))) {
    hits.push(`${m[1]}${m[2]}`);
  }

  // Metals / crypto / indices compact forms
  const specialRe =
    /\b((?:XAU|XAG|BTC|ETH)USD|US30|US500|NAS100|GER40|UK100)(?:\.[A-Z0-9]+)?\b/g;
  while ((m = specialRe.exec(upper))) {
    hits.push(m[1]);
  }

  // Fallback: glued 6-letter tokens that look like FX pairs
  const gluedRe = /\b([A-Z]{6})(?:\.[A-Z0-9]+)?\b/g;
  while ((m = gluedRe.exec(upper))) {
    hits.push(m[1]);
  }

  return hits;
}

function pickBestSymbol(texts, catalog = []) {
  const candidates = [];
  const joined = (texts || []).filter(Boolean).join("\n");
  for (const text of texts || []) {
    candidates.push(...extractSymbolCandidates(text));
  }
  const blob = String(joined || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  for (const known of [...COMMON_SYMBOLS, ...(catalog || [])]) {
    const base = compactSymbol(known).base;
    if (base && blob.includes(base)) candidates.push(base);
  }

  let best = null;
  for (const candidate of candidates) {
    const scored = scoreCandidate(candidate, catalog);
    if (!scored) continue;
    if (!best || scored.score > best.score) best = scored;
  }
  return best
    ? {
        symbol: best.symbol,
        base: best.base,
        rawText: joined,
        confidence: Math.min(95, 55 + best.score * 8),
      }
    : { symbol: null, rawText: joined, confidence: 0 };
}

async function cropChartRegions(dataUrl) {
  const img = await loadImage(dataUrl);
  const maxW = 1100;
  const scale = Math.min(1, maxW / Math.max(1, img.width));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const regions = [
    { x: 0, y: 0, w: width, h: Math.max(48, Math.round(height * 0.22)) }, // full top banner
    { x: 0, y: 0, w: Math.round(width * 0.55), h: Math.max(48, Math.round(height * 0.2)) }, // top-left
    { x: 0, y: 0, w: Math.round(width * 0.4), h: Math.max(40, Math.round(height * 0.14)) }, // title chip
  ];

  return regions.map((region) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, region.w);
    canvas.height = Math.max(1, region.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      Math.round(region.x / scale),
      Math.round(region.y / scale),
      Math.round(region.w / scale),
      Math.round(region.h / scale),
      0,
      0,
      canvas.width,
      canvas.height
    );
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const v = lum > 145 ? 255 : lum < 95 ? 0 : 255 - lum;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }).filter(Boolean);
}

async function ocrWithTextDetector(dataUrl) {
  if (typeof window === "undefined" || typeof window.TextDetector !== "function") {
    return "";
  }
  try {
    const detector = new window.TextDetector();
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = Math.max(1, Math.round(img.height * 0.28));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(img, 0, 0);
    const bitmap = await createImageBitmap(canvas);
    const texts = await detector.detect(bitmap);
    return (texts || []).map((t) => t.rawValue || "").join(" ");
  } catch {
    return "";
  }
}

async function ocrWithTesseract(crops) {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  const texts = [];
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./- ",
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    for (const crop of crops) {
      const {
        data: { text },
      } = await worker.recognize(crop);
      if (text) texts.push(text);
    }
    // Second pass with sparse text mode for denser headers
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    if (crops[0]) {
      const {
        data: { text },
      } = await worker.recognize(crops[0]);
      if (text) texts.push(text);
    }
  } finally {
    await worker.terminate();
  }
  return texts;
}

/**
 * Read the symbol shown on a chart screenshot (scanner OCR).
 */
export async function detectSymbolFromChart(dataUrl, { catalog = [] } = {}) {
  if (!dataUrl) return { symbol: null, rawText: "", confidence: 0 };
  try {
    const crops = await cropChartRegions(dataUrl);
    const texts = [];
    const nativeText = await ocrWithTextDetector(dataUrl);
    if (nativeText) texts.push(nativeText);
    try {
      const tessTexts = await ocrWithTesseract(crops);
      texts.push(...tessTexts);
    } catch {
      // native OCR may still have worked
    }
    return pickBestSymbol(texts, catalog);
  } catch (error) {
    return {
      symbol: null,
      rawText: "",
      confidence: 0,
      error: error.message || "Symbol detection failed",
    };
  }
}

/**
 * Local chart scan: samples candle colors from the screenshot to bias BUY/SELL,
 * and OCR-detects the symbol shown on the chart header.
 */
export async function analyzeChartImage(
  dataUrl,
  { symbol = "", catalog = [], preferDetectedSymbol = true } = {}
) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const maxW = 640;
  const scale = Math.min(1, maxW / Math.max(1, img.width));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Chart analysis unavailable on this device");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Focus on the right third of the chart (recent price action)
  const x0 = Math.floor(canvas.width * 0.62);
  const y0 = Math.floor(canvas.height * 0.12);
  const w = Math.max(1, canvas.width - x0 - 8);
  const h = Math.max(1, Math.floor(canvas.height * 0.72));
  const recent = ctx.getImageData(x0, y0, w, h);
  const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const recentBias = sampleBias(recent);
  const fullBias = sampleBias(full);

  const score = recentBias.bullRatio * 0.7 + fullBias.bullRatio * 0.3;
  let side = "BUY";
  let confidence = Math.round(50 + Math.abs(score - 0.5) * 90);
  if (score < 0.46) side = "SELL";
  else if (score > 0.54) side = "BUY";
  else {
    // Near balance — slight lean from recent candles
    side = recentBias.bullRatio >= 0.5 ? "BUY" : "SELL";
    confidence = Math.max(52, confidence - 8);
  }
  confidence = Math.min(92, Math.max(55, confidence));

  const detection = await detectSymbolFromChart(dataUrl, { catalog });
  const detected =
    preferDetectedSymbol && detection?.symbol
      ? String(detection.symbol).toUpperCase()
      : null;
  if (!detected) {
    const err = new Error("Could not read the symbol from this chart screenshot");
    err.code = "SYMBOL_NOT_DETECTED";
    throw err;
  }
  const resolvedSymbol = detected;

  const reasons = [
    recentBias.bullRatio >= 0.5
      ? "Recent candles skew bullish"
      : "Recent candles skew bearish",
    fullBias.structure === "dark-theme"
      ? "Dark chart theme detected"
      : "Light chart theme detected",
    `Symbol from scanner: ${resolvedSymbol}`,
  ];

  return {
    symbol: resolvedSymbol,
    detectedSymbol: detected,
    detectionConfidence: detection?.confidence || 0,
    side,
    confidence,
    score,
    reasons,
    scannedAt: Date.now(),
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const CONNECT_ENGINE_STEPS = [
  { id: "auth", label: "Authenticating broker credentials" },
  { id: "provision", label: "Provisioning cloud terminal" },
  { id: "deploy", label: "Deploying MetaAPI trading node" },
  { id: "handshake", label: "Handshake with broker servers" },
  { id: "arm", label: "Arming ApexEA trading engine" },
];

export const TRADE_ENGINE_STEPS = [
  { id: "load", label: "Loading chart into trading engine" },
  { id: "structure", label: "Reading market structure" },
  { id: "bias", label: "Detecting directional bias" },
  { id: "signal", label: "Building entry signal" },
  { id: "route", label: "Routing order to connected MT5" },
  { id: "fill", label: "Confirming broker fill" },
];
