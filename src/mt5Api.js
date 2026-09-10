const MT5_API_BASE = (import.meta.env.VITE_MT5_API_BASE || "/mt5-api").replace(/\/$/, "");

async function mt5Fetch(path, { signal } = {}) {
  const url = `${MT5_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
  });

  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text (Connect endpoints often return a plain token string)
  }

  if (!response.ok) {
    const message =
      typeof data === "string"
        ? data
        : data?.message || data?.title || `MT5 API error ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function searchBrokers(company, { signal } = {}) {
  const q = String(company || "").trim();
  if (!q) return [];

  const data = await mt5Fetch(`/Search?company=${encodeURIComponent(q)}`, { signal });
  if (!Array.isArray(data)) return [];

  const brokers = [];
  data.forEach((companyEntry) => {
    const companyName = companyEntry?.company || "Unknown broker";
    const results = Array.isArray(companyEntry?.results) ? companyEntry.results : [];
    results.forEach((result, index) => {
      const serverName = result?.name || `${companyName} server`;
      const access = Array.isArray(result?.access) ? result.access.filter(Boolean) : [];
      brokers.push({
        id: `${companyName}::${serverName}::${index}`,
        company: companyName,
        name: serverName,
        site: result?.site || "",
        logoUrl: result?.logo_url || "",
        access,
        platform: "MT5",
        custom: false,
      });
    });
  });

  return brokers;
}

export async function connectByServer({ login, password, server, signal } = {}) {
  const user = String(login || "").trim();
  const pass = String(password || "");
  const srv = String(server || "").trim();
  if (!user || !pass || !srv) {
    throw new Error("Enter login, password, and server");
  }

  const params = new URLSearchParams({
    user,
    password: pass,
    server: srv,
  });

  const token = await mt5Fetch(`/ConnectEx?${params.toString()}`, { signal });
  return typeof token === "string" ? token.replace(/^"|"$/g, "") : String(token);
}

export async function connectByHost({ login, password, host, port = 443, signal } = {}) {
  const user = String(login || "").trim();
  const pass = String(password || "");
  const h = String(host || "").trim();
  const p = Number(port) || 443;
  if (!user || !pass || !h) {
    throw new Error("Enter login, password, and host");
  }

  const params = new URLSearchParams({
    user,
    password: pass,
    host: h,
    port: String(p),
  });

  const token = await mt5Fetch(`/Connect?${params.toString()}`, { signal });
  return typeof token === "string" ? token.replace(/^"|"$/g, "") : String(token);
}

export async function checkConnect(token, { signal } = {}) {
  const id = String(token || "").trim();
  if (!id) throw new Error("Missing connection token");
  return mt5Fetch(`/CheckConnect?id=${encodeURIComponent(id)}`, { signal });
}

export async function disconnect(token, { signal } = {}) {
  const id = String(token || "").trim();
  if (!id) return "OK";
  return mt5Fetch(`/Disconnect?id=${encodeURIComponent(id)}`, { signal });
}

export function parseAccessPoint(access) {
  const raw = String(access || "").trim();
  if (!raw) return null;
  const [host, portPart] = raw.split(":");
  if (!host) return null;
  return { host, port: Number(portPart) || 443 };
}

export { MT5_API_BASE };
