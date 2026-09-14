import {
  findSignup,
  setSignupAppAccessUnlocked,
} from "../signups/_lib.js";
import { FALLBACK_GITHUB_TOKEN } from "../signups/_githubToken.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.LICENSES_FILE_PATH || "data/licenses.json";
const API = `https://api.github.com/repos/${REPO}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_FILE = path.resolve(__dirname, "../../data/licenses.json");
const TMP_FILE = path.join("/tmp", "apexea-licenses.json");
const BUNDLED_PHOTO_DIR = path.resolve(__dirname, "../../data/ea-photos");
const TMP_PHOTO_DIR = path.join("/tmp", "apexea-ea-photos");

/** In-process fallback when GitHub auth fails (expired ghs_ token, etc.). */
let memoryLicenses = null;
/** botId → { mime, buffer } when GitHub photo upload/read is unavailable. */
const memoryPhotos = new Map();

export function normalizeLicenseKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[ØÖ⌀∅]/g, "0")
    .replace(/[^A-Z0-9-]/g, "");
}

function resolveLicenseExpiry(durationId, from = Date.now()) {
  const id = String(durationId || "lifetime")
    .trim()
    .toLowerCase();
  const months =
    id === "1m" ? 1 : id === "3m" ? 3 : id === "2y" ? 24 : null;
  if (months == null) return { duration: "lifetime", expiresAt: null };
  const start = new Date(Number(from) || Date.now());
  start.setMonth(start.getMonth() + months);
  return { duration: id, expiresAt: start.getTime() };
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

function writeLocalBotPhoto(id, ext, buffer, mime) {
  memoryPhotos.set(id, { mime, buffer });
  for (const dir of [TMP_PHOTO_DIR, BUNDLED_PHOTO_DIR]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${id}.${ext}`), buffer);
      break;
    } catch {
      // /tmp usually works on Vercel when the repo tree is read-only
    }
  }
}

function readLocalBotPhoto(id) {
  if (memoryPhotos.has(id)) {
    return memoryPhotos.get(id);
  }
  for (const dir of [TMP_PHOTO_DIR, BUNDLED_PHOTO_DIR]) {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const filePath = path.join(dir, `${id}.${ext}`);
      try {
        if (!fs.existsSync(filePath)) continue;
        const buffer = fs.readFileSync(filePath);
        if (!buffer?.length) continue;
        const mime =
          ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const photo = { mime, buffer };
        memoryPhotos.set(id, photo);
        return photo;
      } catch {
        // try next
      }
    }
  }
  return null;
}

function dataUrlFromPhoto(photo) {
  if (!photo?.buffer?.length) return null;
  const mime = photo.mime || "image/jpeg";
  return `data:${mime};base64,${photo.buffer.toString("base64")}`;
}

/** Cap embedded license photos so licenses.json stays usable. */
function shrinkDataUrl(dataUrl, maxChars = 900_000) {
  const value = String(dataUrl || "");
  if (!value.startsWith("data:image/") || value.length <= maxChars) return value;
  // Already over budget — keep a truncated marker so callers fall back cleanly.
  return "/logo.png";
}

async function githubPhotoExists(botId) {
  const id = safePhotoId(botId);
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const filePath = `data/ea-photos/${id}.${ext}`;
    try {
      await ghFetch(`${API}/contents/${filePath}?ref=${encodeURIComponent(BRANCH)}`, {
        cache: "no-store",
      });
      return true;
    } catch (error) {
      if (error.status !== 404) return false;
    }
  }
  return false;
}

/**
 * Resolve a photo value that works across devices.
 * Prefer a durable API path when GitHub has the file; otherwise embed a data URL
 * on the license so clients are not stuck with a 404 `/api/licenses/photo` link.
 */
export async function resolveEmbeddablePhoto(botId, photo) {
  const value = String(photo || "").trim();
  if (!value) return "/logo.png";
  if (value === "/logo.png") return value;
  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith("data:image/")) {
    return persistBotPhoto(botId, value);
  }

  if (value.startsWith("/api/licenses/photo")) {
    if (await githubPhotoExists(botId)) return value;
    const local = await readBotPhoto(botId);
    const embedded = shrinkDataUrl(dataUrlFromPhoto(local));
    // Never keep a 404-prone API path when GitHub does not have the bytes.
    if (embedded && embedded !== "/logo.png") return embedded;
    return "/logo.png";
  }

  return value;
}

/**
 * Upload a data-URL bot photo (GitHub + local fallback).
 * Returns an API path when GitHub has the bytes; otherwise returns the data URL
 * so license payloads still carry the image across phones.
 */
export async function persistBotPhoto(botId, photo) {
  const value = String(photo || "").trim();
  if (!value) return "/logo.png";
  if (value === "/logo.png") return value;
  if (value.startsWith("/api/licenses/photo")) {
    return resolveEmbeddablePhoto(botId, value);
  }
  if (/^https?:\/\//i.test(value)) return value;

  const parsed = parseDataImage(value);
  if (!parsed) return "/logo.png";

  const id = safePhotoId(botId);
  const ext = parsed.mime.includes("png") ? "png" : "jpg";
  const buffer = Buffer.from(parsed.base64, "base64");
  writeLocalBotPhoto(id, ext, buffer, parsed.mime);

  const filePath = `data/ea-photos/${id}.${ext}`;
  try {
    // GitHub Contents API rejects oversized payloads — fail early to embed instead.
    if (parsed.base64.length > 900_000) {
      throw Object.assign(new Error("Photo too large for GitHub Contents API"), {
        status: 413,
      });
    }
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
    // Embed the bytes so Manage EAs / Home never point at a cold-start 404 API path.
    const local = readLocalBotPhoto(id);
    const embedded = shrinkDataUrl(dataUrlFromPhoto(local) || value, 40_000);
    if (embedded && embedded.startsWith("data:image/")) return embedded;
    if (value.startsWith("data:image/") && value.length <= 40_000) return value;
    // Prefer advertising the API path only when local bytes exist for this process;
    // otherwise clients would get a permanent 404.
    if (local?.buffer?.length) return botPhotoApiPath(id);
    return "/logo.png";
  }
}

export async function readBotPhoto(botId) {
  const id = safePhotoId(botId);
  const local = readLocalBotPhoto(id);
  if (local) return local;

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
      const photo = { mime, buffer: Buffer.from(base64, "base64") };
      memoryPhotos.set(id, photo);
      return photo;
    } catch (error) {
      if (error.status !== 404) {
        console.warn("ea photo read failed", error.message);
        break;
      }
    }
  }
  return null;
}

/** Rewrite mentorName on every license owned by this mentor email. */
export async function syncMentorNameToLicenses(mentorEmail, mentorName) {
  const email = normalizeEmail(mentorEmail);
  const name = String(mentorName || "").trim();
  if (!email || !email.includes("@") || !name) return [];

  let updated = [];
  await mutateStore((licenses) => {
    updated = [];
    return licenses.map((row) => {
      if (normalizeEmail(row.mentorEmail) !== email) return row;
      if (String(row.mentorName || "").trim() === name) return row;
      const next = {
        ...row,
        mentorName: name,
        updatedAt: Date.now(),
      };
      updated.push(next);
      return next;
    });
  }, `mentor name sync: ${email}`);

  return updated;
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
        updatedAt: Date.now(),
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

function photoVersion(photo) {
  const match = String(photo || "").match(/[?&]v=(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

/** Only replace when the incoming photo is newer / more canonical. */
function shouldReplacePhoto(prevPhoto, nextPhoto) {
  const prev = String(prevPhoto || "").trim();
  const next = String(nextPhoto || "").trim();
  if (!next || next === "/logo.png") return false;
  if (!prev || prev === "/logo.png") return true;

  const prevV = photoVersion(prev);
  const nextV = photoVersion(next);
  if (nextV || prevV) return nextV >= prevV;

  // Prefer a working embedded photo over an API path that may 404 after cold start.
  if (next.startsWith("/api/licenses/photo") && prev.startsWith("data:")) return false;
  if (next.startsWith("data:") && prev.startsWith("/api/licenses/photo")) return true;
  // Prefer the larger (sharper) embedded artwork when both are data URLs.
  if (next.startsWith("data:") && prev.startsWith("data:")) {
    return next.length > prev.length + 2048;
  }
  return next !== prev;
}

function normalizeLicense(row) {
  const key = normalizeLicenseKey(row?.key);
  if (!key) return null;
  const bot = row?.bot && typeof row.bot === "object" ? row.bot : null;
  const clientEmail = normalizeEmail(row?.clientEmail || row?.email || "");
  const clientName = String(row?.clientName || row?.name || "").trim();
  const mainText = String(row?.mainText || row?.username || clientName || "").trim();
  const deviceId = String(row?.deviceId || "").trim() || null;
  return {
    key,
    botId: String(row?.botId || bot?.id || "").trim(),
    botName: String(row?.botName || bot?.name || "Bot").trim() || "Bot",
    clientEmail,
    clientName,
    mainText,
    mentorEmail: normalizeEmail(row?.mentorEmail || row?.ownerEmail || ""),
    mentorId: String(row?.mentorId || row?.ownerId || "").trim(),
    mentorName: String(row?.mentorName || row?.ownerName || "").trim(),
    used: Boolean(row?.used),
    commissionEligible: Boolean(row?.commissionEligible),
    commissionReason: String(row?.commissionReason || "").trim(),
    duration: String(row?.duration || (row?.expiresAt ? "timed" : "lifetime")).trim() || "lifetime",
    expiresAt:
      row?.expiresAt == null || row?.expiresAt === ""
        ? null
        : Number(row.expiresAt) || null,
    createdAt: Number(row?.createdAt) || Date.now(),
    usedAt: row?.usedAt ? Number(row.usedAt) : null,
    deviceId,
    boundAt: row?.boundAt
      ? Number(row.boundAt)
      : deviceId
        ? Number(row?.usedAt) || null
        : null,
    updatedAt:
      Number(row?.updatedAt || row?.usedAt || row?.createdAt) || Date.now(),
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

function decodeLicensesJson(raw, sha = "local") {
  try {
    const parsed = JSON.parse(raw || "{}");
    const licenses = Array.isArray(parsed?.licenses) ? parsed.licenses : [];
    return {
      sha,
      licenses: licenses.map(normalizeLicense).filter(Boolean),
    };
  } catch {
    return { sha, licenses: [] };
  }
}

function mergeLicenseLists(...lists) {
  const map = new Map();
  lists.flat().forEach((row) => {
    const item = normalizeLicense(row);
    if (!item) return;
    const prev = map.get(item.key);
    if (!prev) {
      map.set(item.key, item);
      return;
    }
    const preferIncoming =
      (item.updatedAt || item.usedAt || item.createdAt || 0) >=
      (prev.updatedAt || prev.usedAt || prev.createdAt || 0);
    const merged = preferIncoming ? { ...prev, ...item } : { ...item, ...prev };
    const nextPhoto = shouldReplacePhoto(prev.bot?.photo, item.bot?.photo)
      ? item.bot?.photo
      : shouldReplacePhoto(item.bot?.photo, prev.bot?.photo)
        ? prev.bot?.photo
        : preferIncoming
          ? item.bot?.photo || prev.bot?.photo
          : prev.bot?.photo || item.bot?.photo;
    map.set(item.key, {
      ...merged,
      updatedAt: Math.max(
        prev.updatedAt || 0,
        item.updatedAt || 0,
        prev.usedAt || 0,
        item.usedAt || 0,
        prev.createdAt || 0,
        item.createdAt || 0
      ),
      bot:
        item.bot || prev.bot
          ? {
              ...(prev.bot || {}),
              ...(item.bot || {}),
              photo: nextPhoto || prev.bot?.photo || item.bot?.photo || "/logo.png",
            }
          : null,
    });
  });
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function readLocalStore() {
  if (Array.isArray(memoryLicenses)) {
    return { sha: "local", licenses: memoryLicenses.map((row) => ({ ...row })), remote: false };
  }

  const chunks = [];
  for (const filePath of [TMP_FILE, BUNDLED_FILE]) {
    try {
      if (fs.existsSync(filePath)) {
        const decoded = decodeLicensesJson(fs.readFileSync(filePath, "utf8"), "local");
        chunks.push(decoded.licenses);
      }
    } catch {
      // try next source
    }
  }

  memoryLicenses = mergeLicenseLists(...chunks);
  return { sha: "local", licenses: memoryLicenses.map((row) => ({ ...row })), remote: false };
}

function writeLocalStore(licenses) {
  const next = mergeLicenseLists(licenses).map((row) => ({ ...row }));
  memoryLicenses = next;
  const payload =
    JSON.stringify(
      {
        licenses: next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      },
      null,
      2
    ) + "\n";
  for (const filePath of [TMP_FILE, BUNDLED_FILE]) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, payload, "utf8");
      break;
    } catch {
      // /tmp usually works on Vercel when the repo tree is read-only
    }
  }
  return next;
}

async function readStore() {
  try {
    const file = await ghFetch(
      `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
      { cache: "no-store" }
    );
    const remote = decodeContent(file);
    // Keep memory warm with the latest remote snapshot.
    memoryLicenses = remote.licenses.map((row) => ({ ...row }));
    return { ...remote, remote: true };
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, licenses: [], remote: true };
    }
    // Expired / missing GitHub token → use local/memory so create + activate still work.
    return readLocalStore();
  }
}

async function writeStore(licenses, sha, message) {
  const normalized = mergeLicenseLists(licenses);
  const content = Buffer.from(
    JSON.stringify(
      {
        licenses: normalized.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
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
  if (sha && sha !== "local") body.sha = sha;

  try {
    const result = await ghFetch(`${API}/contents/${FILE_PATH}`, {
      method: "PUT",
      body,
    });
    memoryLicenses = normalized.map((row) => ({ ...row }));
    return result;
  } catch (error) {
    // Always persist locally so mentors can still generate keys when GitHub auth fails.
    writeLocalStore(normalized);
    return { local: true };
  }
}

async function mutateStore(mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const store = await readStore();
      const next = mutator(
        store.licenses.map((row) => ({ ...row, bot: row.bot ? { ...row.bot } : null }))
      );
      await writeStore(next, store.sha, message);
      return mergeLicenseLists(next);
    } catch (error) {
      lastError = error;
      if (error.status === 409 || error.status === 422) continue;
      // Last resort: apply mutation purely in local memory.
      try {
        const local = readLocalStore();
        const next = mutator(
          local.licenses.map((row) => ({ ...row, bot: row.bot ? { ...row.bot } : null }))
        );
        return writeLocalStore(next);
      } catch {
        throw error;
      }
    }
  }
  throw lastError || new Error("Could not update licenses store");
}

export async function listLicenses() {
  const store = await readStore();
  let licenses = store.licenses.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Fill missing mentorName from the mentor portal username so client headers
  // show the mentor name even for older licenses.
  try {
    const missing = licenses.some(
      (row) => normalizeEmail(row.mentorEmail) && !String(row.mentorName || "").trim()
    );
    if (missing) {
      const { listMentors } = await import("../mentors/_lib.js");
      const mentors = await listMentors();
      const byEmail = new Map(
        (mentors || [])
          .map((m) => [normalizeEmail(m.email), String(m.username || "").trim()])
          .filter(([email, name]) => email && name)
      );
      licenses = licenses.map((row) => {
        if (String(row.mentorName || "").trim()) return row;
        const name = byEmail.get(normalizeEmail(row.mentorEmail));
        return name ? { ...row, mentorName: name } : row;
      });
    }
  } catch {
    // Mentors lookup is best-effort.
  }

  return licenses;
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
  // Prefer an embeddable photo (data URL) when GitHub file storage is down.
  const photo = await resolveEmbeddablePhoto(botId, rawPhoto);

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

  const createdAt = Number(payload.createdAt) || Date.now();
  const durationPayload = resolveLicenseExpiry(
    payload.duration || "lifetime",
    createdAt
  );
  if (payload.expiresAt != null && payload.expiresAt !== "" && payload.duration) {
    durationPayload.duration = String(payload.duration);
    durationPayload.expiresAt =
      String(payload.duration).toLowerCase() === "lifetime"
        ? null
        : Number(payload.expiresAt) || durationPayload.expiresAt;
  }

  const ownerEmailForQuota = normalizeEmail(
    payload.mentorEmail || payload.ownerEmail || ""
  );
  let keyAllowance = null;
  if (ownerEmailForQuota) {
    try {
      const { getMentorLicenseKeysAllowed } = await import("../mentors/_lib.js");
      keyAllowance = await getMentorLicenseKeysAllowed(ownerEmailForQuota);
    } catch {
      keyAllowance = 1500;
    }
  }

  let result = null;
  await mutateStore((licenses) => {
    const existing = licenses.find((row) => row.key === key);
    if (!existing && ownerEmailForQuota && keyAllowance != null) {
      const used = licenses.filter(
        (row) => normalizeEmail(row.mentorEmail) === ownerEmailForQuota
      ).length;
      if (used >= keyAllowance) {
        const err = new Error(
          `License key limit reached (${used}/${keyAllowance}). Ask super admin to add more keys.`
        );
        err.status = 403;
        throw err;
      }
    }

    if (existing) {
      const prevBot = existing.bot || null;
      const prevPhoto = String(prevBot?.photo || "");
      const replacePhoto = shouldReplacePhoto(prevPhoto, bot?.photo);
      result = {
        ...existing,
        clientEmail: existing.clientEmail || clientEmail,
        clientName: existing.clientName || clientName,
        mainText:
          existing.mainText ||
          String(payload.mainText || payload.username || clientName || "").trim(),
        mentorEmail:
          existing.mentorEmail ||
          normalizeEmail(payload.mentorEmail || payload.ownerEmail || ""),
        mentorId:
          existing.mentorId ||
          String(payload.mentorId || payload.ownerId || "").trim(),
        mentorName:
          existing.mentorName ||
          String(payload.mentorName || payload.ownerName || "").trim(),
        duration: existing.duration || durationPayload.duration,
        expiresAt:
          existing.expiresAt != null ? existing.expiresAt : durationPayload.expiresAt,
        updatedAt: replacePhoto
          ? Date.now()
          : Number(existing.updatedAt || existing.usedAt || existing.createdAt) ||
            Date.now(),
        bot: prevBot
          ? {
              ...prevBot,
              ...bot,
              photo: replacePhoto ? bot.photo : prevBot.photo || bot.photo,
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
      mainText: String(payload.mainText || payload.username || clientName || "").trim(),
      mentorEmail: normalizeEmail(payload.mentorEmail || payload.ownerEmail || ""),
      mentorId: String(payload.mentorId || payload.ownerId || "").trim(),
      mentorName: String(payload.mentorName || payload.ownerName || "").trim(),
      used: false,
      commissionEligible: false,
      commissionReason: "",
      duration: durationPayload.duration,
      expiresAt: durationPayload.expiresAt,
      createdAt,
      usedAt: null,
      deviceId: null,
      boundAt: null,
      updatedAt: Date.now(),
      bot,
    };
    return [result, ...licenses];
  }, `license: ${key} · ${clientEmail}`);

  return result;
}

/**
 * Bind a license to the first phone that activates it.
 * Same phone can re-open; any other phone is rejected.
 * Email is not a hard gate — keys work for any robot once the app is unlocked.
 */
export async function markLicenseUsed(rawKey, { deviceId = "", email = "" } = {}) {
  const variants = licenseKeyVariants(rawKey);
  if (!variants.length) {
    const err = new Error("License key is required");
    err.status = 400;
    throw err;
  }

  const claimDevice = String(deviceId || "").trim();
  if (!claimDevice) {
    const err = new Error("Device id is required");
    err.status = 400;
    throw err;
  }

  // Peek current license + signup before mutate so commission rules use paid/first-access.
  const currentList = await listLicenses();
  const current =
    currentList.find((row) => variants.includes(row.key)) || null;
  if (!current) {
    const err = new Error("Invalid license key");
    err.status = 404;
    throw err;
  }

  const boundDevice = String(current.deviceId || "").trim();
  if (current.used && boundDevice && boundDevice !== claimDevice) {
    const err = new Error("This license is locked to another phone");
    err.status = 403;
    throw err;
  }

  // Same phone re-open, or legacy used key with no device yet → claim/keep.
  if (current.used && (!boundDevice || boundDevice === claimDevice)) {
    let claimed = current;
    if (!boundDevice) {
      await mutateStore((licenses) => {
        const idx = licenses.findIndex((row) => variants.includes(row.key));
        if (idx < 0) return licenses;
        const row = licenses[idx];
        const next = {
          ...row,
          used: true,
          usedAt: row.usedAt || Date.now(),
          deviceId: claimDevice,
          boundAt: row.boundAt || Date.now(),
          updatedAt: Date.now(),
        };
        licenses[idx] = next;
        claimed = next;
        return licenses;
      }, `license device claim: ${variants[0]}`);
    }
    return claimed;
  }

  const claimEmail = normalizeEmail(email);
  const clientEmail = normalizeEmail(current.clientEmail) || claimEmail;
  const signup = clientEmail ? await findSignup(clientEmail) : null;
  const accessPaid = Boolean(signup?.accessPaid);
  const alreadyUnlocked = Boolean(signup?.appAccessUnlockedAt);
  const priorUsed = currentList.some(
    (row) =>
      normalizeEmail(row.clientEmail) === clientEmail &&
      row.used &&
      !variants.includes(row.key)
  );
  const commissionEligible = Boolean(
    clientEmail && accessPaid && !alreadyUnlocked && !priorUsed
  );
  const commissionReason = commissionEligible
    ? "first_paid_access"
    : !accessPaid
      ? "not_paid"
      : alreadyUnlocked || priorUsed
        ? "access_already_active"
        : "ineligible";

  let result = null;
  const now = Date.now();
  await mutateStore((licenses) => {
    const idx = licenses.findIndex((row) => variants.includes(row.key));
    if (idx < 0) {
      const err = new Error("Invalid license key");
      err.status = 404;
      throw err;
    }
    const row = licenses[idx];
    const alreadyBound = String(row.deviceId || "").trim();
    if (row.used && alreadyBound && alreadyBound !== claimDevice) {
      const err = new Error("This license is locked to another phone");
      err.status = 403;
      throw err;
    }
    if (row.used && (!alreadyBound || alreadyBound === claimDevice)) {
      const next = {
        ...row,
        used: true,
        usedAt: row.usedAt || now,
        deviceId: alreadyBound || claimDevice,
        boundAt: row.boundAt || now,
        updatedAt: now,
      };
      licenses[idx] = next;
      result = next;
      return licenses;
    }
    licenses[idx] = {
      ...row,
      used: true,
      usedAt: now,
      deviceId: claimDevice,
      boundAt: now,
      updatedAt: now,
      commissionEligible,
      commissionReason,
      // Stamp activating account so mentors still see who used the key.
      clientEmail: row.clientEmail || claimEmail || "",
    };
    result = licenses[idx];
    return licenses;
  }, `license used: ${variants[0]}`);

  const unlockEmail = normalizeEmail(result?.clientEmail) || claimEmail;
  if (unlockEmail) {
    try {
      await setSignupAppAccessUnlocked(unlockEmail, result?.usedAt || Date.now());
    } catch {
      // Unlock stamp is best-effort; license commissionEligible is already set.
    }
  }

  return result;
}

export async function deactivateLicense(rawKey) {
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
    licenses[idx] = {
      ...licenses[idx],
      used: false,
      usedAt: null,
      deviceId: null,
      boundAt: null,
      // Keep commissionEligible as-is so a paid first unlock still counts after reset.
      updatedAt: Date.now(),
    };
    result = licenses[idx];
    return licenses;
  }, `license deactivated: ${variants[0]}`);

  return result;
}

export async function deleteLicense(rawKey) {
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
    result = licenses[idx];
    return licenses.filter((_, i) => i !== idx);
  }, `license deleted: ${variants[0]}`);

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
