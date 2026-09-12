import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FALLBACK_GITHUB_TOKEN } from "./_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.SIGNUPS_FILE_PATH || "data/signups.json";
const API = `https://api.github.com/repos/${REPO}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = path.resolve(__dirname, "../../data/signups.json");

let memorySignups = null;

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
    const err = new Error("Signup store is not configured");
    err.status = 500;
    throw err;
  }
  return token;
}

function isAuthFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 401 || status === 403 || message.includes("bad credentials");
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

function normalizeSignup(row) {
  const email = normalizeEmail(row?.email);
  if (!email || !email.includes("@")) return null;
  return {
    email,
    status: String(row?.status || "pending").toLowerCase(),
    createdAt: Number(row?.createdAt) || Date.now(),
  };
}

function decodeSignupsJson(raw, sha = "local") {
  try {
    const parsed = JSON.parse(raw || "{}");
    const signups = Array.isArray(parsed?.signups) ? parsed.signups : [];
    return {
      sha,
      signups: signups.map(normalizeSignup).filter(Boolean),
    };
  } catch {
    return { sha, signups: [] };
  }
}

function decodeContent(file) {
  const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString(
    "utf8"
  );
  return decodeSignupsJson(raw, file.sha);
}

function readLocalStore() {
  if (Array.isArray(memorySignups)) {
    return { sha: "local", signups: memorySignups.map((s) => ({ ...s })) };
  }
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, "utf8");
      const decoded = decodeSignupsJson(raw, "local");
      memorySignups = decoded.signups;
      return { sha: "local", signups: decoded.signups.map((s) => ({ ...s })) };
    }
  } catch {
    // ignore
  }
  memorySignups = [];
  return { sha: "local", signups: [] };
}

function writeLocalStore(signups) {
  const next = signups.map(normalizeSignup).filter(Boolean);
  memorySignups = next;
  try {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(
      LOCAL_FILE,
      JSON.stringify(
        {
          signups: next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
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
    memorySignups = store.signups.map((s) => ({ ...s }));
    return store;
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, signups: [] };
    }
    console.warn("signups github read failed; using local fallback", error.message);
    return { ...readLocalStore(), remote: false };
  }
}

async function writeStore(signups, sha, message) {
  const normalized = signups
    .map(normalizeSignup)
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const content = Buffer.from(
    JSON.stringify({ signups: normalized }, null, 2) + "\n",
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
    memorySignups = normalized.map((s) => ({ ...s }));
    return result;
  } catch (error) {
    // Never drop the client signup — keep it locally so pending still works.
    writeLocalStore(normalized);
    if (isAuthFailure(error)) {
      console.warn("signups github write failed; saved locally", error.message);
      return { local: true, signups: normalized };
    }
    // Conflict etc. should retry via mutateStore; other errors still keep local copy.
    if (error.status === 409 || error.status === 422) throw error;
    console.warn("signups write error; saved locally", error.message);
    return { local: true, signups: normalized };
  }
}

async function mutateStore(mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const store = await readStore();
      const next = mutator(store.signups.map((s) => ({ ...s })));
      await writeStore(next, store.sha, message);
      return next;
    } catch (error) {
      lastError = error;
      if (error.status === 409 || error.status === 422) continue;
      throw error;
    }
  }
  throw lastError || new Error("Could not update signups store");
}

export async function listSignups() {
  const store = await readStore();
  return store.signups.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function upsertSignup(email, { status = "pending" } = {}) {
  const key = normalizeEmail(email);
  if (!key || !key.includes("@")) {
    const err = new Error("Enter a valid email");
    err.status = 400;
    throw err;
  }

  let result = null;
  await mutateStore((signups) => {
    const idx = signups.findIndex((s) => s.email === key);
    if (idx >= 0) {
      const current = signups[idx];
      if (current.status === "approved") {
        result = current;
        return signups;
      }
      const updated = {
        ...current,
        status: current.status === "declined" ? "pending" : current.status || "pending",
        createdAt: current.status === "declined" ? Date.now() : current.createdAt,
      };
      if (status === "pending" && current.status !== "approved") {
        updated.status = "pending";
      }
      signups[idx] = updated;
      result = updated;
      return signups;
    }
    result = { email: key, status: "pending", createdAt: Date.now() };
    return [result, ...signups];
  }, `signup: ${key}`);

  return result;
}

export async function setSignupStatus(email, status) {
  const key = normalizeEmail(email);
  const next = String(status || "").toLowerCase();
  if (!["pending", "approved", "declined"].includes(next)) {
    const err = new Error("Invalid status");
    err.status = 400;
    throw err;
  }

  let result = null;
  await mutateStore((signups) => {
    const idx = signups.findIndex((s) => s.email === key);
    if (idx >= 0) {
      signups[idx] = { ...signups[idx], status: next };
      result = signups[idx];
      return signups;
    }
    result = { email: key, status: next, createdAt: Date.now() };
    return [result, ...signups];
  }, `signup ${next}: ${key}`);

  return result;
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
