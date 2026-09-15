function apiUrl(path) {
  return path;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export async function fetchPendingTradeEvents(clientEmail) {
  const key = normalizeEmail(clientEmail);
  if (!key || !key.includes("@")) return [];
  const response = await fetch(
    apiUrl(`/api/trade-events?email=${encodeURIComponent(key)}`),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Trade events failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return Array.isArray(data?.events) ? data.events : [];
}

export async function ackPendingTradeEvents(clientEmail, ids = []) {
  const key = normalizeEmail(clientEmail);
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "").trim()).filter(Boolean);
  if (!key || !key.includes("@") || !list.length) return { ok: true, removed: 0 };
  const response = await fetch(apiUrl("/api/trade-events"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: key, ids: list }),
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Ack trade events failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data || { ok: true };
}
