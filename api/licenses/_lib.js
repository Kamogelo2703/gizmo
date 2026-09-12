import { FALLBACK_GITHUB_TOKEN } from "../signups/_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.LICENSES_FILE_PATH || "data/licenses.json";
const API = `https://api.github.com/repos/${REPO}`;

export function normalizeLicenseKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[ØÖ⌀∅]/g, "0")
    .replace(/[^A-Z0-9-]/g, "");
}

export function licenseKeyVariants(rawKey) {
  const base = normalizeLicenseKey(rawKey);
  if (!base) return [];
  const out = new Set([base]);
  const chars = [...base];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === "0") {
      const next = [...chars];
      next[i] = "O";
      out.add(next.join(""));
    } else if (chars[i] === "O") {
      const next = [...chars];
      next[i] = "0";
      out.add(next.join(""));
    }
  }
  return Array.from(out);
}

function requireToken() {
  const token =
    process.env.SIGNUPS_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    FALLBACK_GITHUB_TOKEN ||
    "";
  if (!token) {
    const err = new Error("License store is not configured");
    err.status = 500;
    throw err;
  }
  return token;
}

async function ghFetch(url, { method = "GET", body, token, auth = true, cache } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (auth) headers.Authorization = `Bearer ${token || requireToken()}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...(cache ? { cache } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) ||
      `GitHub error ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function safePhotoId(botId) {
  return (
    String(botId || "bot")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "bot"
  );
}

function parseDataImage(dataUrl) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

export function botPhotoApiPath(botId, version = Date.now()) {
  const id = safePhotoId(botId);
  return `/api/licenses/photo?botId=${encodeURIComponent(id)}&v=${encodeURIComponent(version)}`;
}

/** Upload a data-URL bot photo to GitHub and return a stable API path for clients. */
export async function persistBotPhoto(botId, photo) {
  const value = String(photo || "").trim();
  if (!value) return "/logo.png";
  if (value === "/logo.png") return value;
  if (value.startsWith("/api/licenses/photo")) return value;
  if (/^https?:\/\//i.test(value)) return value;

  const parsed = parseDataImage(value);
  if (!parsed) return "/logo.png";

  const id = safePhotoId(botId);
  const ext = parsed.mime.includes("png") ? "png" : "jpg";
  const filePath = `data/ea-photos/${id}.${ext}`;
  const token = requireToken();

  let sha = null;
  try {
    const existing = await ghFetch(
      `${API}/contents/${filePath}?ref=${encodeURIComponent(BRANCH)}`,
      { token, cache: "no-store" }
    );
    sha = existing?.sha || null;
  } catch (error) {
    if (error.status !== 404) {
      console.warn("ea photo lookup failed", error.message);
    }
  }

  try {
    await ghFetch(`${API}/contents/${filePath}`, {
      method: "PUT",
      token,
      body: {
        message: `chore: sync EA photo ${id}`,
        content: parsed.base64,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      },
    });
    return botPhotoApiPath(id);
  } catch (error) {
    console.warn("ea photo upload failed", error.message);
    return "/logo.png";
  }
}

export async function readBotPhoto(botId) {
  const id = safePhotoId(botId);
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const filePath = `data/ea-photos/${id}.${ext}`;
    try {
      const file = await ghFetch(
        `${API}/contents/${filePath}?ref=${encodeURIComponent(BRANCH)}`,
        { cache: "no-store" }
      );
      const base64 = String(file.content || "").replace(/\n/g, "");
      if (!base64) continue;
      const mime =
        ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return { mime, buffer: Buffer.from(base64, "base64") };
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  return null;
}

/** Rewrite bot.photo on every license that belongs to this EA. */
export async function syncBotPhotoToLicenses(botId, photoPath) {
  const id = String(botId || "").trim();
  const photo = String(photoPath || "").trim();
  if (!id || !photo) return [];

  let updated = [];
  await mutateStore((licenses) => {
    updated = [];
    return licenses.map((row) => {
      const rowBotId = String(row.botId || row.bot?.id || "").trim();
      if (rowBotId !== id) return row;
      const next = {
        ...row,
        botName: row.botName || row.bot?.name || "Bot",
        bot: {
          ...(row.bot || { id, name: row.botName || "Bot", strategy: "scalper", symbols: [] }),
          id,
          photo,
        },
      };
      updated.push(next);
      return next;
    });
  }, `ea photo sync: ${id}`);

  return updated;
}

function normalizeLicense(row) {
  const key = normalizeLicenseKey(row?.key);
  if (!key) return null;
  const bot = row?.bot && typeof row.bot === "object" ? row.bot : null;
  const clientEmail = normalizeEmail(row?.clientEmail || row?.email || "");
  const clientName = String(row?.clientName || row?.name || "").trim();
  return {
    key,
    botId: String(row?.botId || bot?.id || "").trim(),
    botName: String(row?.botName || bot?.name || "Bot").trim() || "Bot",
    clientEmail,
    clientName,
    mentorEmail: normalizeEmail(row?.mentorEmail || row?.ownerEmail || ""),
    mentorId: String(row?.mentorId || row?.ownerId || "").trim(),
    used: Boolean(row?.used),
    createdAt: Number(row?.createdAt) || Date.now(),
    usedAt: row?.usedAt ? Number(row.usedAt) : null,
    bot: bot
      ? {
          id: String(bot.id || row.botId || "").trim(),
          name: String(bot.name || row.botName || "Bot").trim() || "Bot",
          photo: String(bot.photo || "/logo.png"),
          strategy: String(bot.strategy || "scalper"),
          symbols: Array.isArray(bot.symbols)
            ? bot.symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)
            : [],
        }
      : null,
  };
}

function decodeContent(file) {
  const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString(
    "utf8"
  );
  try {
    const parsed = JSON.parse(raw || "{}");
    const licenses = Array.isArray(parsed?.licenses) ? parsed.licenses : [];
    return {
      sha: file.sha,
      licenses: licenses.map(normalizeLicense).filter(Boolean),
    };
  } catch {
    return { sha: file.sha, licenses: [] };
  }
}

async function readStore() {
  try {
    const file = await ghFetch(
      `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
      { cache: "no-store" }
    );
    return decodeContent(file);
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, licenses: [] };
    }
    throw error;
  }
}

async function writeStore(licenses, sha, message) {
  const content = Buffer.from(
    JSON.stringify(
      {
        licenses: licenses
          .map(normalizeLicense)
          .filter(Boolean)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      },
      null,
      2
    ) + "\n",
    "utf8"
  ).toString("base64");

  const body = {
    message,
    content,
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  return ghFetch(`${API}/contents/${FILE_PATH}`, {
    method: "PUT",
    body,
  });
}

async function mutateStore(mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const store = await readStore();
      const next = mutator(store.licenses.map((row) => ({ ...row, bot: row.bot ? { ...row.bot } : null })));
      await writeStore(next, store.sha, message);
      return next;
    } catch (error) {
      lastError = error;
      if (error.status === 409 || error.status === 422) continue;
      throw error;
    }
  }
  throw lastError || new Error("Could not update licenses store");
}

export async function listLicenses() {
  const store = await readStore();
  return store.licenses.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function createLicense(payload = {}) {
  const key = normalizeLicenseKey(payload.key);
  if (!key) {
    const err = new Error("License key is required");
    err.status = 400;
    throw err;
  }

  const botId = String(payload.botId || payload.bot?.id || "").trim();
  const botName = String(payload.botName || payload.bot?.name || "Bot").trim() || "Bot";
  const clientEmail = normalizeEmail(payload.clientEmail || payload.email || "");
  const clientName = String(payload.clientName || payload.name || "").trim();
  if (!botId) {
    const err = new Error("botId is required");
    err.status = 400;
    throw err;
  }
  if (!clientEmail || !clientEmail.includes("@")) {
    const err = new Error("Client email is required");
    err.status = 400;
    throw err;
  }
  if (!clientName) {
    const err = new Error("Client name is required");
    err.status = 400;
    throw err;
  }

  const rawPhoto = String(payload.bot?.photo || payload.photo || "/logo.png").trim();
  const photo = await persistBotPhoto(botId, rawPhoto);

  const bot = {
    id: botId,
    name: botName,
    photo,
    strategy: String(payload.bot?.strategy || payload.strategy || "scalper"),
    symbols: Array.isArray(payload.bot?.symbols)
      ? payload.bot.symbols
      : Array.isArray(payload.symbols)
        ? payload.symbols
        : [],
  };

  let result = null;
  await mutateStore((licenses) => {
    const existing = licenses.find((row) => row.key === key);
    if (existing) {
      const prevBot = existing.bot || null;
      const prevPhoto = String(prevBot?.photo || "");
      const shouldReplacePhoto =
        Boolean(bot?.photo) &&
        bot.photo !== "/logo.png" &&
        (prevPhoto === "/logo.png" ||
          !prevPhoto ||
          prevPhoto.startsWith("data:") ||
          prevPhoto.startsWith("/api/licenses/photo"));
      result = {
        ...existing,
        clientEmail: existing.clientEmail || clientEmail,
        clientName: existing.clientName || clientName,
        bot: prevBot
          ? {
              ...prevBot,
              ...bot,
              photo: shouldReplacePhoto ? bot.photo : prevBot.photo || bot.photo,
            }
          : bot,
      };
      const idx = licenses.findIndex((row) => row.key === key);
      licenses[idx] = result;
      return licenses;
    }
    result = {
      key,
      botId,
      botName,
      clientEmail,
      clientName,
      mentorEmail: normalizeEmail(payload.mentorEmail || payload.ownerEmail || ""),
      mentorId: String(payload.mentorId || payload.ownerId || "").trim(),
      used: false,
      createdAt: Number(payload.createdAt) || Date.now(),
      usedAt: null,
      bot,
    };
    return [result, ...licenses];
  }, `license: ${key} · ${clientEmail}`);

  return result;
}

export async function markLicenseUsed(rawKey) {
  const variants = licenseKeyVariants(rawKey);
  if (!variants.length) {
    const err = new Error("License key is required");
    err.status = 400;
    throw err;
  }

  let result = null;
  await mutateStore((licenses) => {
    const idx = licenses.findIndex((row) => variants.includes(row.key));
    if (idx < 0) {
      const err = new Error("Invalid license key");
      err.status = 404;
      throw err;
    }
    if (licenses[idx].used) {
      result = licenses[idx];
      return licenses;
    }
    licenses[idx] = {
      ...licenses[idx],
      used: true,
      usedAt: Date.now(),
    };
    result = licenses[idx];
    return licenses;
  }, `license used: ${variants[0]}`);

  return result;
}

export async function findLicense(rawKey) {
  const variants = licenseKeyVariants(rawKey);
  if (!variants.length) return null;
  const licenses = await listLicenses();
  return licenses.find((row) => variants.includes(row.key)) || null;
}

export async function findLicensesByEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return [];
  const licenses = await listLicenses();
  return licenses.filter((row) => normalizeEmail(row.clientEmail) === key);
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}
