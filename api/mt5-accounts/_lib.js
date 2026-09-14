import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FALLBACK_GITHUB_TOKEN } from "../signups/_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.MT5_ACCOUNTS_FILE_PATH || "data/mt5-accounts.json";
const API = `https://api.github.com/repos/${REPO}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = path.resolve(__dirname, "../../data/mt5-accounts.json");
const TMP_FILE = path.join("/tmp", "apexea-mt5-accounts.json");

let memoryAccounts = null;

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
    const err = new Error("MT5 account store is not configured");
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
      (data && (data.message || data.error)) || `GitHub error ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function normalizeMt5Account(row = {}) {
  const email = normalizeEmail(row.email);
  const accountId = String(row.accountId || "").trim();
  if (!email || !email.includes("@") || !accountId) return null;
  return {
    email,
    accountId,
    login: String(row.login || "").trim(),
    server: String(row.server || "").trim(),
    company: String(row.company || "").trim(),
    platform: String(row.platform || "MT5").trim().toUpperCase() || "MT5",
    region: String(row.region || "").trim(),
    connectedAt: Number(row.connectedAt) || Date.now(),
    updatedAt: Number(row.updatedAt) || Date.now(),
  };
}

function decodeAccountsJson(raw, sha = null) {
  try {
    const parsed = JSON.parse(raw || "{}");
    const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
    return {
      sha,
      accounts: accounts.map(normalizeMt5Account).filter(Boolean),
    };
  } catch {
    return { sha, accounts: [] };
  }
}

function readLocalStore() {
  if (Array.isArray(memoryAccounts)) {
    return { sha: "local", accounts: memoryAccounts.map((a) => ({ ...a })) };
  }
  for (const file of [TMP_FILE, LOCAL_FILE]) {
    try {
      if (!fs.existsSync(file)) continue;
      const decoded = decodeAccountsJson(fs.readFileSync(file, "utf8"), "local");
      memoryAccounts = decoded.accounts;
      return { sha: "local", accounts: decoded.accounts.map((a) => ({ ...a })) };
    } catch {
      // try next
    }
  }
  memoryAccounts = [];
  return { sha: "local", accounts: [] };
}

function writeLocalStore(accounts) {
  const next = accounts.map((a) => ({ ...a }));
  memoryAccounts = next;
  const payload = `${JSON.stringify({ accounts: next }, null, 2)}\n`;
  for (const file of [TMP_FILE, LOCAL_FILE]) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, payload, "utf8");
      break;
    } catch {
      // /tmp usually works when the repo tree is read-only
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
    const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString(
      "utf8"
    );
    return decodeAccountsJson(raw, file.sha);
  } catch (error) {
    if (error.status === 404) return { sha: null, accounts: [], remote: true };
    return { ...readLocalStore(), remote: false };
  }
}

async function writeStore(accounts, sha, message) {
  const normalized = accounts.map(normalizeMt5Account).filter(Boolean);
  const content = Buffer.from(
    JSON.stringify({ accounts: normalized }, null, 2) + "\n",
    "utf8"
  ).toString("base64");
  const body = { message, content, branch: BRANCH };
  if (sha && sha !== "local") body.sha = sha;
  try {
    const result = await ghFetch(`${API}/contents/${FILE_PATH}`, {
      method: "PUT",
      body,
    });
    memoryAccounts = normalized;
    return result;
  } catch (error) {
    writeLocalStore(normalized);
    if (error.status === 401 || error.status === 403) throw error;
    return { local: true };
  }
}

async function mutateStore(mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const store = await readStore();
      const next = mutator(store.accounts.map((a) => ({ ...a })));
      await writeStore(next, store.sha, message);
      return next.map(normalizeMt5Account).filter(Boolean);
    } catch (error) {
      lastError = error;
      if (error.status === 409 || error.status === 422) continue;
      try {
        const local = readLocalStore();
        const next = mutator(local.accounts.map((a) => ({ ...a })));
        return writeLocalStore(next);
      } catch {
        throw error;
      }
    }
  }
  throw lastError || new Error("Could not update MT5 accounts");
}

export async function listMt5Accounts() {
  const store = await readStore();
  const local = readLocalStore().accounts;
  const map = new Map();
  for (const row of [...local, ...(store.accounts || [])]) {
    const item = normalizeMt5Account(row);
    if (!item) continue;
    const prev = map.get(item.email);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(item.email, item);
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function upsertMt5Account(payload = {}) {
  const account = normalizeMt5Account({
    ...payload,
    updatedAt: Date.now(),
    connectedAt: payload.connectedAt || Date.now(),
  });
  if (!account) {
    const err = new Error("email and accountId are required");
    err.status = 400;
    throw err;
  }

  let saved = null;
  await mutateStore((accounts) => {
    const idx = accounts.findIndex((a) => normalizeEmail(a.email) === account.email);
    if (idx >= 0) {
      saved = { ...accounts[idx], ...account };
      accounts[idx] = saved;
    } else {
      saved = account;
      accounts.unshift(account);
    }
    return accounts;
  }, `chore: upsert MT5 account ${account.email}`);

  return saved;
}

export async function removeMt5Account(email) {
  const key = normalizeEmail(email);
  if (!key) {
    const err = new Error("email is required");
    err.status = 400;
    throw err;
  }
  await mutateStore(
    (accounts) => accounts.filter((a) => normalizeEmail(a.email) !== key),
    `chore: remove MT5 account ${key}`
  );
  return { ok: true, email: key };
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
