const API_BASE = "/api/licenses";

async function apiFetch(path = "", { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
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
      (typeof data === "string" ? data : `License sync failed (${response.status})`);
    throw new Error(message);
  }
  return data;
}

export function normalizeLicenseKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    // Phones often show/slash-zero as Ø; treat as digit 0.
    .replace(/[ØÖ⌀∅]/g, "0")
    .replace(/[^A-Z0-9-]/g, "");
}

/** Try common lookalike swaps so APEX-0M60… still matches if typed as O. */
export function licenseKeyVariants(rawKey) {
  const base = normalizeLicenseKey(rawKey);
  if (!base) return [];
  const out = new Set([base]);
  const chars = [...base];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === "0") {
      const next = [...chars];
      next[i] = "O";
      out.add(next.join(""));
    } else if (chars[i] === "O") {
      const next = [...chars];
      next[i] = "0";
      out.add(next.join(""));
    }
  }
  return Array.from(out);
}

export function normalizeLicense(row) {
  const key = normalizeLicenseKey(row?.key);
  if (!key) return null;
  const bot = row?.bot && typeof row.bot === "object" ? row.bot : null;
  const clientEmail = String(row?.clientEmail || row?.email || "")
    .trim()
    .toLowerCase();
  const clientName = String(row?.clientName || row?.name || "").trim();
  return {
    key,
    botId: String(row?.botId || bot?.id || "").trim(),
    botName: String(row?.botName || bot?.name || "Bot").trim() || "Bot",
    clientEmail,
    clientName,
    mentorEmail: String(row?.mentorEmail || row?.ownerEmail || "")
      .trim()
      .toLowerCase(),
    mentorId: String(row?.mentorId || row?.ownerId || "").trim(),
    used: Boolean(row?.used),
    createdAt: Number(row?.createdAt) || Date.now(),
    usedAt: row?.usedAt ? Number(row.usedAt) : null,
    updatedAt: Number(row?.updatedAt || row?.usedAt || row?.createdAt) || Date.now(),
    bot: bot
      ? {
          id: String(bot.id || row.botId || "").trim(),
          name: String(bot.name || row.botName || "Bot").trim() || "Bot",
          photo: String(bot.photo || "/logo.png"),
          strategy: String(bot.strategy || "scalper"),
          symbols: Array.isArray(bot.symbols)
            ? bot.symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)
            : [],
        }
      : null,
  };
}

export function mergeLicenses(localList = [], remoteList = []) {
  const map = new Map();
  [...localList, ...remoteList].forEach((item) => {
    const row = normalizeLicense(item);
    if (!row) return;
    const prev = map.get(row.key);
    if (!prev) {
      map.set(row.key, row);
      return;
    }
    const preferIncoming = (row.updatedAt || 0) >= (prev.updatedAt || 0);
    map.set(row.key, {
      ...prev,
      ...row,
      clientEmail: row.clientEmail || prev.clientEmail || "",
      clientName: row.clientName || prev.clientName || "",
      // Newer updatedAt wins so deactivate (used:false) can stick.
      used: preferIncoming ? Boolean(row.used) : Boolean(prev.used || row.used),
      usedAt: preferIncoming
        ? row.used
          ? row.usedAt || prev.usedAt || null
          : null
        : row.usedAt || prev.usedAt || null,
      updatedAt: Math.max(prev.updatedAt || 0, row.updatedAt || 0),
      bot: preferLicenseBot(row.bot, prev.bot, row.updatedAt || 0, prev.updatedAt || 0),
      createdAt: Math.min(prev.createdAt || Date.now(), row.createdAt || Date.now()),
    });
  });
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Newer cache-busted API photos beat stale embedded data URLs. */
export function photoFreshness(photo) {
  const value = String(photo || "").trim();
  if (!value || value === "/logo.png") return 0;
  const version = value.match(/[?&]v=(\d+)/);
  if (version) return Number(version[1]) || 1;
  if (value.startsWith("/api/licenses/photo")) return 2;
  if (/^https?:\/\//i.test(value)) return 2;
  // Unversioned data URLs are real, but lose to a fresh versioned API path.
  if (value.startsWith("data:image/")) return 1;
  return 0;
}

export function pickFresherPhoto(...candidates) {
  let best = "/logo.png";
  let bestScore = -1;
  for (const value of candidates) {
    const photo = String(value || "").trim();
    if (!photo) continue;
    const score = photoFreshness(photo);
    if (score > bestScore) {
      best = photo;
      bestScore = score;
    }
  }
  return best;
}

function preferLicenseBot(a, b, aUpdatedAt = 0, bUpdatedAt = 0) {
  if (!a) return b || null;
  if (!b) return a;
  const freshA = photoFreshness(a.photo);
  const freshB = photoFreshness(b.photo);
  if (freshA !== freshB) {
    return freshA > freshB
      ? { ...b, ...a, photo: a.photo }
      : { ...a, ...b, photo: b.photo };
  }
  if (aUpdatedAt !== bUpdatedAt) {
    return aUpdatedAt >= bUpdatedAt
      ? { ...b, ...a, photo: a.photo || b.photo }
      : { ...a, ...b, photo: b.photo || a.photo };
  }
  return { ...b, ...a, photo: a.photo || b.photo };
}

export async function fetchLicenses() {
  const data = await apiFetch();
  return Array.isArray(data?.licenses)
    ? data.licenses.map(normalizeLicense).filter(Boolean)
    : [];
}

export async function fetchLicense(key) {
  const variants = licenseKeyVariants(key);
  for (const candidate of variants) {
    try {
      const data = await apiFetch(`?key=${encodeURIComponent(candidate)}`);
      const row = normalizeLicense(data?.license);
      if (row) return row;
    } catch {
      // try next lookalike
    }
  }
  return null;
}

export async function fetchLicensesByEmail(email) {
  const key = String(email || "")
    .trim()
    .toLowerCase();
  if (!key) return [];
  const data = await apiFetch(`?email=${encodeURIComponent(key)}`);
  return Array.isArray(data?.licenses)
    ? data.licenses.map(normalizeLicense).filter(Boolean)
    : [];
}

export async function createLicenseRemote(payload) {
  const data = await apiFetch("", {
    method: "POST",
    body: payload,
  });
  return normalizeLicense(data?.license);
}

export async function uploadBotPhotoRemote(botId, photo) {
  const data = await apiFetch("/photo", {
    method: "POST",
    body: { botId, photo },
  });
  return String(data?.photo || "/logo.png");
}

export async function markLicenseUsedRemote(key) {
  const data = await apiFetch("", {
    method: "PATCH",
    body: { key: normalizeLicenseKey(key) },
  });
  return normalizeLicense(data?.license);
}

export async function deactivateLicenseRemote(key) {
  const data = await apiFetch("", {
    method: "PATCH",
    body: { key: normalizeLicenseKey(key), action: "deactivate" },
  });
  return normalizeLicense(data?.license);
}
