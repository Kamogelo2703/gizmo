import { FALLBACK_GITHUB_TOKEN } from "./_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.SIGNUPS_FILE_PATH || "data/signups.json";
const API = `https://api.github.com/repos/${REPO}`;

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

async function ghFetch(url, { method = "GET", body, token, auth = true } = {}) {
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
  // Prefer public raw for reads (no auth / lower rate-limit pressure)
  try {
    const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE_PATH}?t=${Date.now()}`;
    const response = await fetch(rawUrl, { headers: { Accept: "application/json" } });
    if (response.ok) {
      const parsed = await response.json();
      const signups = Array.isArray(parsed?.signups) ? parsed.signups : [];
      // Still need sha for writes
      const meta = await ghFetch(
        `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`
      );
      return {
        sha: meta.sha,
        signups: signups
          .map((s) => ({
            email: normalizeEmail(s.email),
            status: String(s.status || "pending").toLowerCase(),
            createdAt: Number(s.createdAt) || Date.now(),
          }))
          .filter((s) => s.email && s.email.includes("@")),
      };
    }
  } catch {
    // fall through
  }

  const file = await ghFetch(`${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`);
  return decodeContent(file);
}

async function writeStore(signups, sha, message) {
  const content = Buffer.from(
    JSON.stringify(
      {
        signups: signups
          .map((s) => ({
            email: normalizeEmail(s.email),
            status: String(s.status || "pending").toLowerCase(),
            createdAt: Number(s.createdAt) || Date.now(),
          }))
          .filter((s) => s.email && s.email.includes("@"))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      },
      null,
      2
    ) + "\n",
    "utf8"
  ).toString("base64");

  return ghFetch(`${API}/contents/${FILE_PATH}`, {
    method: "PUT",
    body: {
      message,
      content,
      sha,
      branch: BRANCH,
    },
  });
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
