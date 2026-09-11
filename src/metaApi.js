const API_BASE = "/api/metaapi";
const TOKEN_KEY = "apexea-metaapi-token";

export function getClientMetaApiToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setClientMetaApiToken(token) {
  try {
    const value = String(token || "").trim();
    if (!value) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // ignore
  }
}

async function apiFetch(path, { method = "GET", body, signal } = {}) {
  const clientToken = getClientMetaApiToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(clientToken ? { "x-metaapi-token": clientToken } : {}),
    },
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
      (data && (data.error || data.message)) ||
      (typeof data === "string" ? data : `Request failed (${response.status})`);
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchBrokers(query, platform = "MT5", { signal } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  // Always include local catalog so search works even if MetaAPI env is missing.
  const { searchLocalBrokers } = await import("./brokerCatalog.js");
  const local = searchLocalBrokers(q, platform);

  try {
    const params = new URLSearchParams({
      q,
      platform: String(platform || "MT5").toUpperCase(),
    });
    const data = await apiFetch(`/brokers?${params.toString()}`, { signal });
    const remote = Array.isArray(data?.brokers) ? data.brokers : [];
    if (!remote.length) return local;

    // Prefer MetaAPI server names; append local matches not already present.
    const seen = new Set(remote.map((b) => `${b.company}::${b.name}`.toLowerCase()));
    const extras = local.filter((b) => !seen.has(`${b.company}::${b.name}`.toLowerCase()));
    return [...remote, ...extras];
  } catch {
    return local;
  }
}

export async function getAccountStatus(accountId, { company = "", strategyId = "", signal } = {}) {
  const params = new URLSearchParams({ accountId: String(accountId || "") });
  if (company) params.set("company", company);
  if (strategyId) params.set("strategyId", strategyId);
  return apiFetch(`/status?${params.toString()}`, { signal });
}

export async function connectAccount({
  login,
  password,
  server,
  platform = "MT5",
  company = "",
  strategyId = "",
  signal,
  onProgress,
} = {}) {
  const initial = await apiFetch("/connect", {
    method: "POST",
    signal,
    body: {
      login,
      password,
      server,
      platform,
      company,
      strategyId,
    },
  });

  if (!initial?.pending) return initial;

  onProgress?.(initial);

  const started = Date.now();
  const timeoutMs = 4 * 60 * 1000;

  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) throw new Error("Connection cancelled");
    await sleep(4000);
    const status = await getAccountStatus(initial.accountId, {
      company: company || initial.company || "",
      strategyId: strategyId || initial.strategyId || "",
      signal,
    });
    onProgress?.(status);
    if (!status.pending && status.connectionStatus === "CONNECTED") {
      return status;
    }
  }

  throw new Error("Timed out waiting for MetaTrader connection");
}

export async function disconnectAccount(accountId, { signal } = {}) {
  return apiFetch("/disconnect", {
    method: "POST",
    signal,
    body: { accountId },
  });
}

export async function placeTrade({
  accountId,
  symbol,
  volume = 0.01,
  side = "BUY",
  stopLoss,
  takeProfit,
  comment = "bot~apexea",
  region = "",
  source = "chart-scanner",
  signal,
} = {}) {
  return apiFetch("/trade", {
    method: "POST",
    signal,
    body: {
      accountId,
      symbol,
      volume,
      side,
      stopLoss,
      takeProfit,
      comment,
      region,
      source,
    },
  });
}

/** MT5 comment for scanner fills — e.g. zeta~apexea (max 31 chars). */
export function buildBotTradeComment(botName) {
  const raw = String(botName || "bot")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._~\-]/g, "")
    .slice(0, 20);
  const base = raw || "bot";
  const tagged = /~apexea$/i.test(base) ? base : `${base}~apexea`;
  return tagged.slice(0, 31);
}
