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
    if (g > r + 18 && g > b + 8) bull += 1;
    if (r > g + 18 && r > b + 8) bear += 1;
  }

  const total = Math.max(1, bull + bear);
  const bullRatio = bull / total;
  const structure = bright > dark ? "light-theme" : "dark-theme";
  return { bull, bear, bullRatio, structure };
}

export const CHART_DETECTION_STATUS = {
  NO_CHART: "no_chart",
  SYMBOL_DETECTED: "symbol_detected",
  SYMBOL_UNCLEAR: "symbol_unclear",
};

export const CHART_DETECTION_MESSAGES = {
  no_chart: {
    message: "No trading chart detected",
    uiMessage: "Please upload a clear trading chart.",
  },
  symbol_unclear: {
    message: "Chart detected — symbol unclear",
    uiMessage: "Chart detected — symbol unclear",
  },
};

async function shrinkChartImage(dataUrl, { maxW = 1024, quality = 0.72 } = {}) {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxW / Math.max(1, img.width));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

function emptyDetection(overrides = {}) {
  return {
    status: CHART_DETECTION_STATUS.NO_CHART,
    isChart: false,
    symbol: null,
    message: CHART_DETECTION_MESSAGES.no_chart.message,
    uiMessage: CHART_DETECTION_MESSAGES.no_chart.uiMessage,
    chartConfidence: 0,
    symbolConfidence: 0,
    confidence: 0,
    source: "none",
    ...overrides,
  };
}

async function detectSymbolWithOpenAI(dataUrl, { catalog = [] } = {}) {
  const image = await shrinkChartImage(dataUrl);
  const response = await fetch("/api/chart/symbol", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image, catalog }),
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Chart analysis failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const status = String(data?.status || CHART_DETECTION_STATUS.NO_CHART);
  const symbol =
    status === CHART_DETECTION_STATUS.SYMBOL_DETECTED && data?.symbol
      ? String(data.symbol).trim().toUpperCase()
      : null;

  return {
    status,
    isChart: Boolean(data?.isChart),
    symbol,
    message: data?.message || CHART_DETECTION_MESSAGES[status]?.message || "",
    uiMessage:
      data?.uiMessage || CHART_DETECTION_MESSAGES[status]?.uiMessage || "",
    chartConfidence: Number(data?.chartConfidence) || 0,
    symbolConfidence: Number(data?.symbolConfidence) || 0,
    confidence: Number(data?.symbolConfidence) || 0,
    source: data?.source || "openai",
  };
}

/**
 * Validate chart image and read symbol when clearly visible.
 * Uses OpenAI Vision only — never guesses from OCR/text alone.
 */
export async function detectSymbolFromChart(dataUrl, { catalog = [] } = {}) {
  if (!dataUrl) return emptyDetection();

  try {
    return await detectSymbolWithOpenAI(dataUrl, { catalog });
  } catch (error) {
    return emptyDetection({
      error: error.message || "Chart analysis unavailable",
    });
  }
}

/**
 * Local chart scan: samples candle colors from the screenshot to bias BUY/SELL,
 * and reads the symbol only after chart validation passes.
 */
export async function analyzeChartImage(
  dataUrl,
  { catalog = [], preferDetectedSymbol = true } = {}
) {
  const detection = await detectSymbolFromChart(dataUrl, { catalog });

  if (detection.status === CHART_DETECTION_STATUS.NO_CHART) {
    const err = new Error(detection.message || CHART_DETECTION_MESSAGES.no_chart.message);
    err.code = "NO_CHART";
    err.uiMessage = detection.uiMessage;
    throw err;
  }

  if (
    detection.status === CHART_DETECTION_STATUS.SYMBOL_UNCLEAR ||
    !detection.symbol
  ) {
    const err = new Error(
      detection.message || CHART_DETECTION_MESSAGES.symbol_unclear.message
    );
    err.code = "SYMBOL_UNCLEAR";
    err.uiMessage = detection.uiMessage;
    throw err;
  }

  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const maxW = 640;
  const scale = Math.min(1, maxW / Math.max(1, img.width));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Chart analysis unavailable on this device");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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
    side = recentBias.bullRatio >= 0.5 ? "BUY" : "SELL";
    confidence = Math.max(52, confidence - 8);
  }
  confidence = Math.min(92, Math.max(55, confidence));

  const detected =
    preferDetectedSymbol && detection.symbol
      ? String(detection.symbol).toUpperCase()
      : null;
  if (!detected) {
    const err = new Error(CHART_DETECTION_MESSAGES.symbol_unclear.message);
    err.code = "SYMBOL_UNCLEAR";
    err.uiMessage = CHART_DETECTION_MESSAGES.symbol_unclear.uiMessage;
    throw err;
  }

  const reasons = [
    recentBias.bullRatio >= 0.5
      ? "Recent candles skew bullish"
      : "Recent candles skew bearish",
    fullBias.structure === "dark-theme"
      ? "Dark chart theme detected"
      : "Light chart theme detected",
    `Symbol from scanner: ${detected}`,
  ];

  return {
    symbol: detected,
    detectedSymbol: detected,
    detectionStatus: detection.status,
    detectionConfidence: detection.confidence || 0,
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
