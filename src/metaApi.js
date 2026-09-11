const API_BASE = "/api/metaapi";

async function apiFetch(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
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
    throw new Error(message);
  }

  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchBrokers(query, platform = "MT5", { signal } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const params = new URLSearchParams({
    q,
    platform: String(platform || "MT5").toUpperCase(),
  });
  const data = await apiFetch(`/brokers?${params.toString()}`, { signal });
  return Array.isArray(data?.brokers) ? data.brokers : [];
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
