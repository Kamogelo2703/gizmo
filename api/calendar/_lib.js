import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FALLBACK_GITHUB_TOKEN } from "../signups/_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH =
  process.env.ECONOMIC_CALENDAR_FILE_PATH || "data/economic-calendar.json";
const API = `https://api.github.com/repos/${REPO}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = path.resolve(__dirname, "../../data/economic-calendar.json");
const TMP_FILE = path.join("/tmp", "apexea-economic-calendar.json");

let memoryEvents = null;

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function requireToken() {
  const token =
    process.env.SIGNUPS_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    FALLBACK_GITHUB_TOKEN ||
    "";
  if (!token) {
    const err = new Error("Economic calendar store is not configured");
    err.status = 500;
    throw err;
  }
  return token;
}

function tokenCandidates() {
  return [
    ...new Set(
      [
        process.env.SIGNUPS_GITHUB_TOKEN,
        process.env.GITHUB_TOKEN,
        process.env.GH_TOKEN,
        FALLBACK_GITHUB_TOKEN,
      ].filter(Boolean)
    ),
  ];
}

async function ghFetch(url, { method = "GET", body, token, auth = true, cache } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (body) headers["Content-Type"] = "application/json";

  const tokens = auth ? (token ? [token] : tokenCandidates()) : [null];
  if (auth && tokens.length === 0) {
    const err = new Error("Economic calendar store is not configured");
    err.status = 500;
    throw err;
  }

  let lastError = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const active = tokens[i];
    const requestHeaders = { ...headers };
    if (auth && active) requestHeaders.Authorization = `Bearer ${active}`;

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
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
    if (response.ok) return data;

    const message =
      (data && (data.message || data.error)) || `GitHub error ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    lastError = err;

    const retryable =
      auth &&
      i < tokens.length - 1 &&
      (response.status === 401 ||
        response.status === 403 ||
        /bad credentials/i.test(message));
    if (!retryable) throw err;
  }
  throw lastError || new Error("GitHub request failed");
}

export function normalizeEventDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function publicEvent(row = {}) {
  const id = String(row.id || "").trim();
  const date = normalizeEventDate(row.date || row.eventDate);
  const mentorEmail = normalizeEmail(row.mentorEmail);
  if (!id || !date || !mentorEmail) return null;
  return {
    id,
    officialEventId: String(row.officialEventId || id || "").trim(),
    date,
    title: String(row.title || "").trim() || "Economic event",
    directions: String(row.directions || "").trim(),
    mentorEmail,
    createdAt: Number(row.createdAt) || Date.now(),
    updatedAt: Number(row.updatedAt) || Number(row.createdAt) || Date.now(),
  };
}

function decodeEventsJson(raw, sha = null) {
  try {
    const parsed = JSON.parse(raw || "{}");
    const events = Array.isArray(parsed?.events)
      ? parsed.events.map(publicEvent).filter(Boolean)
      : [];
    return { sha, events };
  } catch {
    return { sha, events: [] };
  }
}

function readLocalStore() {
  if (Array.isArray(memoryEvents)) {
    return { sha: "local", events: memoryEvents.map((e) => ({ ...e })) };
  }
  for (const file of [TMP_FILE, LOCAL_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8");
        const decoded = decodeEventsJson(raw, "local");
        memoryEvents = decoded.events;
        return { sha: "local", events: decoded.events.map((e) => ({ ...e })) };
      }
    } catch {
      // try next
    }
  }
  memoryEvents = [];
  return { sha: "local", events: [] };
}

function writeLocalStore(events) {
  const next = events.map((e) => ({ ...e })).filter(Boolean);
  memoryEvents = next;
  const payload = JSON.stringify({ events: next }, null, 2) + "\n";
  try {
    fs.mkdirSync(path.dirname(TMP_FILE), { recursive: true });
    fs.writeFileSync(TMP_FILE, payload, "utf8");
  } catch {
    // ignore
  }
  try {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(LOCAL_FILE, payload, "utf8");
  } catch {
    // memory still holds data
  }
  return next;
}

async function readStore() {
  try {
    const file = await ghFetch(
      `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
      { cache: "no-store" }
    );
    const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString(
      "utf8"
    );
    const decoded = decodeEventsJson(raw, file.sha);
    if (Array.isArray(memoryEvents) && memoryEvents.length) {
      const byId = new Map(decoded.events.map((e) => [e.id, e]));
      for (const local of memoryEvents) {
        const remote = byId.get(local.id);
        if (!remote || Number(local.updatedAt || 0) >= Number(remote.updatedAt || 0)) {
          byId.set(local.id, local);
        }
      }
      decoded.events = Array.from(byId.values());
    }
    return decoded;
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, events: [], remote: true };
    }
    return { ...readLocalStore(), remote: false };
  }
}

async function writeStore(events, sha, message) {
  const normalized = events
    .map(publicEvent)
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.createdAt - b.createdAt);
  const content = Buffer.from(
    JSON.stringify({ events: normalized }, null, 2) + "\n",
    "utf8"
  ).toString("base64");
  const body = { message, content, branch: BRANCH };
  if (sha && sha !== "local") body.sha = sha;

  try {
    const result = await ghFetch(`${API}/contents/${FILE_PATH}`, {
      method: "PUT",
      body,
    });
    writeLocalStore(normalized);
    return result;
  } catch (error) {
    writeLocalStore(normalized);
    if (error.status === 401 || error.status === 403) {
      return { local: true };
    }
    return { local: true };
  }
}

async function mutateStore(mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const store = await readStore();
      const next = mutator(store.events.map((e) => ({ ...e })));
      await writeStore(next, store.sha, message);
      return next.map(publicEvent).filter(Boolean);
    } catch (error) {
      lastError = error;
      if (error.status === 409 || error.status === 422) continue;
      try {
        const local = readLocalStore();
        const next = mutator(local.events.map((e) => ({ ...e })));
        return writeLocalStore(next.map(publicEvent).filter(Boolean));
      } catch {
        throw error;
      }
    }
  }
  throw lastError || new Error("Could not update economic calendar");
}

export async function listEvents({ mentorEmail = "" } = {}) {
  const store = await readStore();
  const key = normalizeEmail(mentorEmail);
  let events = store.events.map(publicEvent).filter(Boolean);
  if (key) events = events.filter((e) => e.mentorEmail === key);
  return events.sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || a.createdAt - b.createdAt
  );
}

export async function upsertEvent(input = {}) {
  const mentorEmail = normalizeEmail(input.mentorEmail);
  const date = normalizeEventDate(input.date || input.eventDate);
  const title = String(input.title || "").trim() || "Economic event";
  const directions = String(input.directions || "").trim();
  const id = String(input.id || "").trim() || crypto.randomUUID();

  if (!mentorEmail || !mentorEmail.includes("@")) {
    const err = new Error("Mentor email is required");
    err.status = 400;
    throw err;
  }
  if (!date) {
    const err = new Error("Enter a valid event date");
    err.status = 400;
    throw err;
  }

  let saved = null;
  await mutateStore((events) => {
    const idx = events.findIndex((e) => e.id === id);
    const row = {
      id,
      officialEventId: String(input.officialEventId || id).trim(),
      date,
      title,
      directions,
      mentorEmail,
      createdAt: idx >= 0 ? events[idx].createdAt || Date.now() : Date.now(),
      updatedAt: Date.now(),
    };
    saved = row;
    if (idx >= 0) {
      events[idx] = row;
      return events;
    }
    return [row, ...events];
  }, `chore: upsert economic event ${date} · ${mentorEmail}`);

  return publicEvent(saved);
}

export async function deleteEvent(id, mentorEmail = "") {
  const key = String(id || "").trim();
  const email = normalizeEmail(mentorEmail);
  if (!key) {
    const err = new Error("Event id is required");
    err.status = 400;
    throw err;
  }

  let removed = null;
  await mutateStore((events) => {
    const idx = events.findIndex((e) => {
      if (e.id !== key) return false;
      if (email && e.mentorEmail !== email) return false;
      return true;
    });
    if (idx < 0) {
      const err = new Error("Event not found");
      err.status = 404;
      throw err;
    }
    removed = events[idx];
    events.splice(idx, 1);
    return events;
  }, `chore: delete economic event ${key}`);

  return publicEvent(removed);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

// silence unused in some bundlers
void requireToken;
