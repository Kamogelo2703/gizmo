import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FALLBACK_GITHUB_TOKEN } from "../signups/_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.LICENSES_FILE_PATH || "data/licenses.json";
const API = `https://api.github.com/repos/${REPO}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = path.resolve(__dirname, "../../data/licenses.json");
let memoryLicenses = null;

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

function readLocalStore() {
  if (Array.isArray(memoryLicenses)) {
    return {
      sha: "local",
      licenses: memoryLicenses.map((row) => ({
        ...row,
        bot: row.bot ? { ...row.bot } : null,
      })),
    };
  }
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, "utf8");
      const decoded = decodeContent({
        content: Buffer.from(raw, "utf8").toString("base64"),
        sha: "local",
      });
      memoryLicenses = decoded.licenses;
      return {
        sha: "local",
        licenses: decoded.licenses.map((row) => ({
          ...row,
          bot: row.bot ? { ...row.bot } : null,
        })),
      };
    }
  } catch {
    // ignore
  }
  memoryLicenses = [];
  return { sha: "local", licenses: [] };
}

function writeLocalStore(licenses) {
  const next = licenses.map(normalizeLicense).filter(Boolean);
  memoryLicenses = next;
  try {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(
      LOCAL_FILE,
      JSON.stringify(
        {
          licenses: next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  } catch {
    // memory still holds rows for this process
  }
  return next;
}

async function readStore() {
  try {
    const file = await ghFetch(
      `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
      { cache: "no-store" }
    );
    const store = decodeContent(file);
    // Keep any in-memory keys that failed a prior remote write so clients
    // on this instance can still activate them.
    const byKey = new Map(store.licenses.map((row) => [row.key, row]));
    if (Array.isArray(memoryLicenses)) {
      for (const row of memoryLicenses) {
        if (row?.key && !byKey.has(row.key)) byKey.set(row.key, row);
      }
    }
    const merged = Array.from(byKey.values());
    memoryLicenses = merged.map((row) => ({
      ...row,
      bot: row.bot ? { ...row.bot } : null,
    }));
    return { ...store, licenses: merged };
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, licenses: [] };
    }
    console.warn("licenses github read failed; using local fallback", error.message);
    return { ...readLocalStore(), remote: false };
  }
}

async function writeStore(licenses, sha, message) {
  const normalized = licenses
    .map(normalizeLicense)
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const content = Buffer.from(
    JSON.stringify({ licenses: normalized }, null, 2) + "\n",
    "utf8"
  ).toString("base64");

  const body = {
    message,
    content,
    branch: BRANCH,
  };
  if (sha && sha !== "local") body.sha = sha;

  try {
    const result = await ghFetch(`${API}/contents/${FILE_PATH}`, {
      method: "PUT",
      body,
    });
    memoryLicenses = normalized.map((row) => ({
      ...row,
      bot: row.bot ? { ...row.bot } : null,
    }));
    return result;
  } catch (error) {
    // Keep the generated key usable instead of surfacing Bad credentials.
    writeLocalStore(normalized);
    if (error.status === 409 || error.status === 422) throw error;
    console.warn("licenses github write failed; saved locally", error.message);
    return { local: true, licenses: normalized };
  }
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

  const bot = {
    id: botId,
    name: botName,
    photo: String(payload.bot?.photo || payload.photo || "/logo.png"),
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
      result = {
        ...existing,
        clientEmail: existing.clientEmail || clientEmail,
        clientName: existing.clientName || clientName,
        bot: existing.bot || bot,
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
