function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeSymbol(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[\/_\-]/g, "")
    .replace(/[^A-Z0-9.]/g, "");
}

function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
  if (!key) {
    const err = new Error(
      "OpenAI is not configured. Add OPENAI_API_KEY on Vercel to analyze chart images."
    );
    err.status = 503;
    throw err;
  }
  return key;
}

const MIN_CHART_CONFIDENCE = 72;

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(value, digits = 5) {
  const n = toFiniteNumber(value);
  if (n == null) return null;
  const abs = Math.abs(n);
  let d = digits;
  if (abs >= 1000) d = Math.min(digits, 2);
  else if (abs >= 100) d = Math.min(digits, 3);
  else if (abs >= 10) d = Math.min(digits, 4);
  return Number(n.toFixed(d));
}

function formatRiskReward(entry, stopLoss, takeProfit, side) {
  const e = toFiniteNumber(entry);
  const sl = toFiniteNumber(stopLoss);
  const tp = toFiniteNumber(takeProfit);
  if (e == null || sl == null || tp == null) return "1:2";
  const risk = Math.abs(e - sl);
  const reward = Math.abs(tp - e);
  if (risk <= 0 || reward <= 0) return "1:2";
  const ratio = reward / risk;
  const dir = String(side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  if (dir === "BUY" && !(sl < e && tp > e)) return `1:${ratio.toFixed(1)}`;
  if (dir === "SELL" && !(sl > e && tp < e)) return `1:${ratio.toFixed(1)}`;
  return `1:${ratio.toFixed(1)}`;
}

function ensureDirectionalLevels({ side, entry, stopLoss, takeProfit }) {
  const dir = String(side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  let e = toFiniteNumber(entry);
  let sl = toFiniteNumber(stopLoss);
  let tp = toFiniteNumber(takeProfit);

  if (e == null) e = 1;
  const magnitude = Math.max(Math.abs(e) * 0.0025, e >= 100 ? 1 : e >= 10 ? 0.05 : 0.0015);

  if (dir === "BUY") {
    if (sl == null || !(sl < e)) sl = e - magnitude;
    if (tp == null || !(tp > e)) {
      const risk = Math.abs(e - sl);
      tp = e + risk * 2;
    }
  } else {
    if (sl == null || !(sl > e)) sl = e + magnitude;
    if (tp == null || !(tp < e)) {
      const risk = Math.abs(sl - e);
      tp = e - risk * 2;
    }
  }

  return {
    side: dir,
    entry: formatPrice(e),
    stopLoss: formatPrice(sl),
    takeProfit: formatPrice(tp),
  };
}

function resolveCatalogSymbol(symbol, catalog = []) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return "";
  const base = normalized.split(".")[0];
  const catalogHit = (Array.isArray(catalog) ? catalog : []).find(
    (item) => normalizeSymbol(item).split(".")[0] === base
  );
  return catalogHit ? normalizeSymbol(catalogHit) : normalized;
}

function buildNoChartResult() {
  return {
    status: "no_chart",
    isChart: false,
    symbol: null,
    side: null,
    confidence: 0,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    riskReward: null,
    timeframe: null,
    analysis: null,
    reasons: [],
    message: "No trading chart detected",
    uiMessage: "Please upload a clear trading chart.",
    source: "openai",
  };
}

function normalizeSetup(parsed = {}, { catalog = [], hintSymbol = "" } = {}) {
  const chartConfidence = Math.max(
    0,
    Math.min(100, Number(parsed?.chartConfidence) || 0)
  );
  const isChart =
    parsed?.isChart === true &&
    chartConfidence >= MIN_CHART_CONFIDENCE &&
    parsed?.status !== "no_chart";

  if (!isChart) return buildNoChartResult();

  let symbol = resolveCatalogSymbol(parsed?.symbol || "", catalog);
  if (!symbol) symbol = resolveCatalogSymbol(hintSymbol, catalog);

  const levels = ensureDirectionalLevels({
    side: parsed?.side || parsed?.direction,
    entry: parsed?.entry ?? parsed?.entryPrice,
    stopLoss: parsed?.stopLoss ?? parsed?.sl,
    takeProfit: parsed?.takeProfit ?? parsed?.tp,
  });

  const confidence = Math.max(
    55,
    Math.min(95, Math.round(Number(parsed?.confidence) || 70))
  );

  const timeframe = String(parsed?.timeframe || parsed?.tf || "M15")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "") || "M15";

  const analysis = String(
    parsed?.analysis ||
      parsed?.reason ||
      parsed?.summary ||
      `${levels.side} setup from visible price action`
  ).trim();

  const reasons = Array.isArray(parsed?.reasons)
    ? parsed.reasons.map((r) => String(r)).filter(Boolean).slice(0, 4)
    : [analysis];

  const riskReward =
    String(parsed?.riskReward || parsed?.rr || "").trim() ||
    formatRiskReward(levels.entry, levels.stopLoss, levels.takeProfit, levels.side);

  return {
    status: "setup_ready",
    isChart: true,
    symbol: symbol || null,
    side: levels.side,
    confidence,
    entry: levels.entry,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    riskReward,
    timeframe,
    analysis,
    reasons,
    chartConfidence,
    message: `${levels.side} ${symbol || "setup"} ready`,
    uiMessage: "Trade setup ready — press Execute Trade to send to MetaTrader.",
    source: "openai",
  };
}

export async function analyzeChartSetupWithOpenAI({
  image,
  catalog = [],
  hintSymbol = "",
} = {}) {
  const apiKey = requireOpenAiKey();
  const dataUrl = String(image || "");
  if (!dataUrl.startsWith("data:image/")) {
    const err = new Error("Chart image is required");
    err.status = 400;
    throw err;
  }
  if (dataUrl.length > 2_500_000) {
    const err = new Error("Chart image is too large — capture a tighter screenshot");
    err.status = 413;
    throw err;
  }

  const catalogHint = (Array.isArray(catalog) ? catalog : [])
    .map((s) => normalizeSymbol(s))
    .filter(Boolean)
    .slice(0, 40)
    .join(", ");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 420,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict trading-chart analyst. Return JSON only with schema: " +
            '{"isChart":boolean,"chartConfidence":0-100,"status":"no_chart"|"setup_ready",' +
            '"symbol":string|null,"side":"BUY"|"SELL","confidence":0-100,' +
            '"entry":number,"stopLoss":number,"takeProfit":number,"riskReward":string,' +
            '"timeframe":string,"analysis":string,"reasons":string[]}. ' +
            "FIRST decide if the image is a genuine financial trading chart " +
            "(candlesticks/OHLC, price axis, grid, trading platform layout). " +
            "Photographs, people, buildings, cars, landscapes, websites, and random screenshots are NOT charts. " +
            "Text resembling a symbol alone is NOT a chart. " +
            "If not a chart: status=no_chart, isChart=false, and leave trade fields null. " +
            "If it IS a chart: ALWAYS return a complete trade setup. NEVER say incomplete. " +
            "ALWAYS provide side (BUY or SELL), confidence, entry, stopLoss, takeProfit, riskReward, timeframe, and analysis. " +
            "Read the instrument from the chart header when visible. Use price axis levels for Entry/SL/TP. " +
            "Analyze structure, momentum, support/resistance, and candle behavior. " +
            "If the setup is imperfect, still choose the strongest available BUY or SELL and compute reasonable levels (prefer about 1:2 R:R). " +
            "Do not omit Entry, SL, or TP for a valid chart.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Validate whether this is a trading chart. If yes, generate a complete trade setup." +
                (hintSymbol ? ` Detected symbol hint: ${normalizeSymbol(hintSymbol)}.` : "") +
                (catalogHint ? ` Known symbols: ${catalogHint}.` : ""),
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "low",
              },
            },
          ],
        },
      ],
    }),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { error: raw };
  }

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || `OpenAI error ${response.status}`;
    const err = new Error(message);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.data = data;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content || "";
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { isChart: false, status: "no_chart" };
  }

  return normalizeSetup(parsed, { catalog, hintSymbol });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await analyzeChartSetupWithOpenAI({
      image: body.image,
      catalog: body.catalog,
      hintSymbol: body.hintSymbol || body.symbol || "",
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Chart setup analysis failed",
      details: error.data || null,
    });
  }
}

export const config = { maxDuration: 30 };
