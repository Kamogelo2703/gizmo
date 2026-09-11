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

/**
 * Local chart scan: samples candle colors from the screenshot to bias BUY/SELL.
 * Not a full vision model — pairs with Trading Engine UX and live MT5 execution.
 */
export async function analyzeChartImage(dataUrl, { symbol = "EURUSD" } = {}) {
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

  const reasons = [
    recentBias.bullRatio >= 0.5
      ? "Recent candles skew bullish"
      : "Recent candles skew bearish",
    fullBias.structure === "dark-theme"
      ? "Dark chart theme detected"
      : "Light chart theme detected",
    `Bias score ${(score * 100).toFixed(0)}% bullish mass`,
  ];

  return {
    symbol: String(symbol || "EURUSD").toUpperCase(),
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
