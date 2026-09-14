import { apiUrl } from "./apiOrigin.js";

const API_PATH = "/api/mt5-accounts";

async function apiFetch(path = "", { method = "GET", body } = {}) {
  const response = await fetch(`${apiUrl(API_PATH)}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
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
      (data && (data.error || data.message)) ||
      (typeof data === "string" ? data : `MT5 account sync failed (${response.status})`);
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export async function upsertMt5Account(payload = {}) {
  const data = await apiFetch("", { method: "POST", body: payload });
  return data?.account || null;
}

export async function removeMt5Account(email) {
  const key = normalizeEmail(email);
  if (!key) return { ok: false };
  return apiFetch("", { method: "DELETE", body: { email: key } });
}

export async function listMentorHostedAccounts(mentorEmail) {
  const key = normalizeEmail(mentorEmail);
  if (!key) return [];
  const data = await apiFetch(`?mentorEmail=${encodeURIComponent(key)}`);
  return Array.isArray(data?.accounts) ? data.accounts : [];
}

export async function executeMentorSelfHostTrade(payload = {}) {
  const response = await fetch(apiUrl("/api/metaapi/mentor-trade"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
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
      (data && (data.error || data.message)) ||
      (typeof data === "string" ? data : `Self hosting trade failed (${response.status})`);
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}
