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

function extractSymbolFromText(text) {
  const upper = String(text || "").toUpperCase();
  let m = upper.match(/\b((?:XAU|XAG|BTC|ETH)USD(?:\.[A-Z0-9]+)?)\b/);
  if (m) return normalizeSymbol(m[1]);
  m = upper.match(/\b((?:US30|US500|NAS100|GER40|UK100)(?:\.[A-Z0-9]+)?)\b/);
  if (m) return normalizeSymbol(m[1]);
  m = upper.match(/\b([A-Z]{3})\s*[\/\-]?\s*([A-Z]{3})(\.[A-Z0-9]+)?\b/);
  if (m) return normalizeSymbol(`${m[1]}${m[2]}${m[3] || ""}`);
  m = upper.match(/\b([A-Z]{6})(\.[A-Z0-9]+)?\b/);
  if (m) return normalizeSymbol(`${m[1]}${m[2] || ""}`);
  return "";
}

function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
  if (!key) {
    const err = new Error(
      "OpenAI is not configured. Add OPENAI_API_KEY on Vercel to read symbols from charts."
    );
    err.status = 503;
    throw err;
  }
  return key;
}

export async function detectSymbolWithOpenAI({ image, catalog = [] } = {}) {
  const apiKey = requireOpenAiKey();
  const dataUrl = String(image || "");
  if (!dataUrl.startsWith("data:image/")) {
    const err = new Error("Chart image is required");
    err.status = 400;
    throw err;
  }

  // Keep payloads small for serverless limits.
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
      max_tokens: 80,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You read trading chart screenshots. Return JSON only: {\"symbol\":\"EURUSD\",\"confidence\":0-100}. " +
            "symbol must be the instrument shown on the chart header/title (forex, metal, crypto, or index). " +
            "Prefer compact forms like EURUSD, XAUUSD, GBPUSD, USDJPY. Keep broker suffixes when clearly visible (e.g. EURUSD.mic). " +
            "If unsure, still guess the most likely pair and lower confidence.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "What trading symbol/pair is shown on this chart?" +
                (catalogHint ? ` Prefer one of: ${catalogHint}.` : ""),
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
    parsed = { symbol: extractSymbolFromText(content), confidence: 50 };
  }

  let symbol = normalizeSymbol(parsed?.symbol || "");
  if (!symbol) symbol = extractSymbolFromText(content);
  if (!symbol) {
    const err = new Error("Could not read the symbol from this chart");
    err.status = 422;
    throw err;
  }

  // If catalog has a matching base with broker suffix, prefer that.
  const base = symbol.split(".")[0];
  const catalogHit = (Array.isArray(catalog) ? catalog : []).find(
    (item) => normalizeSymbol(item).split(".")[0] === base
  );

  return {
    symbol: catalogHit ? normalizeSymbol(catalogHit) : symbol,
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 80)),
    source: "openai",
  };
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
    const result = await detectSymbolWithOpenAI({
      image: body.image,
      catalog: body.catalog,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Symbol detection failed",
      details: error.data || null,
    });
  }
}

export const config = { maxDuration: 30 };
