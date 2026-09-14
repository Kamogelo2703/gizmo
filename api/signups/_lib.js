import { FALLBACK_GITHUB_TOKEN } from "./_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.SIGNUPS_FILE_PATH || "data/signups.json";
const API = `https://api.github.com/repos/${REPO}`;

/** Warm-instance fallback when GitHub auth is down so signups are not silently lost. */
let memorySignups = null;

function cloneSignups(list = []) {
  return list.map((s) => ({ ...s }));
}

function readMemoryStore() {
  return {
    sha: null,
    signups: cloneSignups(memorySignups || []),
  };
}

function writeMemoryStore(signups) {
  memorySignups = cloneSignups(signups)
    .filter((s) => s.email && s.email.includes("@"))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return cloneSignups(memorySignups);
}

function isAuthFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 401 || status === 403 || message.includes("bad credentials");
}

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

function decodeContent(file) {
  const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString(
    "utf8"
  );
  try {
    const parsed = JSON.parse(raw || "{}");
    const signups = Array.isArray(parsed?.signups) ? parsed.signups : [];
    return {
      sha: file.sha,
      signups: signups
        .map((s) => ({
          email: normalizeEmail(s.email),
          status: String(s.status || "pending").toLowerCase(),
          createdAt: Number(s.createdAt) || Date.now(),
        }))
        .filter((s) => s.email && s.email.includes("@")),
    };
  } catch {
    return { sha: file.sha, signups: [] };
  }
}

async function readStore() {
  // Always read via Contents API — raw.githubusercontent.com is CDN-cached and
  // can keep returning "pending" long after an approval commit lands on main.
  try {
    const file = await ghFetch(
      `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
      { cache: "no-store" }
    );
    const store = decodeContent(file);
    // Keep memory warm so a later GitHub outage still has recent rows.
    memorySignups = cloneSignups(store.signups);
    return store;
  } catch (error) {
    if (isAuthFailure(error) || error.status === 404) {
      console.warn("signups github read failed; using memory fallback", error.message);
      return readMemoryStore();
    }
    throw error;
  }
}

async function writeStore(signups, sha, message) {
  const normalized = signups
    .map((s) => ({
      email: normalizeEmail(s.email),
      status: String(s.status || "pending").toLowerCase(),
      createdAt: Number(s.createdAt) || Date.now(),
    }))
    .filter((s) => s.email && s.email.includes("@"))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const content = Buffer.from(
    JSON.stringify({ signups: normalized }, null, 2) + "\n",
    "utf8"
  ).toString("base64");

  try {
    return await ghFetch(`${API}/contents/${FILE_PATH}`, {
      method: "PUT",
      body: {
        message,
        content,
        sha,
        branch: BRANCH,
      },
    });
  } catch (error) {
    if (isAuthFailure(error)) {
      console.warn("signups github write failed; using memory fallback", error.message);
      writeMemoryStore(normalized);
      return { memory: true, signups: normalized };
    }
    throw error;
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
