const API_BASE = "/api/signups";

async function apiFetch(path = "", { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
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
      (typeof data === "string" ? data : `Signup sync failed (${response.status})`);
    throw new Error(message);
  }
  return data;
}

export async function fetchSignups() {
  const data = await apiFetch();
  return Array.isArray(data?.signups) ? data.signups : [];
}

export async function submitSignup(email) {
  const data = await apiFetch("", {
    method: "POST",
    body: { email, status: "pending" },
  });
  return data?.signup || null;
}

export async function updateSignupStatus(email, status) {
  const data = await apiFetch("", {
    method: "PATCH",
    body: { email, status },
  });
  return data?.signup || null;
}

export function mergeSignups(localList = [], remoteList = []) {
  const map = new Map();
  [...localList, ...remoteList].forEach((item) => {
    const email = String(item?.email || "")
      .trim()
      .toLowerCase();
    if (!email) return;
    const prev = map.get(email);
    if (!prev) {
      map.set(email, {
        email,
        status: String(item.status || "pending").toLowerCase(),
        createdAt: Number(item.createdAt) || Date.now(),
      });
      return;
    }
    const rank = { declined: 0, pending: 1, approved: 2 };
    const nextStatus =
      (rank[item.status] || 0) >= (rank[prev.status] || 0)
        ? String(item.status || prev.status).toLowerCase()
        : prev.status;
    map.set(email, {
      email,
      status: nextStatus,
      createdAt: Math.min(Number(prev.createdAt) || Date.now(), Number(item.createdAt) || Date.now()),
    });
  });
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
