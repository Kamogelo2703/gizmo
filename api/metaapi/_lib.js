import { randomBytes } from "node:crypto";

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ||
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

const COPYFACTORY_URL_TEMPLATE =
  process.env.METAAPI_COPYFACTORY_URL_TEMPLATE ||
  "https://copyfactory-api-v1.{region}.agiliumtrade.agiliumtrade.ai";

function requireToken() {
  const token = process.env.METAAPI_TOKEN || "";
  if (!token) {
    const err = new Error("METAAPI_TOKEN is not configured on the server");
    err.status = 500;
    throw err;
  }
  return token;
}

function transactionId() {
  return randomBytes(16).toString("hex");
}

async function metaFetch(url, { method = "GET", body, headers = {}, token } = {}) {
  const auth = token || requireToken();
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "auth-token": auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
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
      (data && (data.message || data.error || data.details)) ||
      (typeof data === "string" ? data : `MetaAPI error ${response.status}`);
    const err = new Error(typeof message === "string" ? message : JSON.stringify(message));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return { data, response };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accountConnectionStatus(account) {
  return (
    account?.connectionStatus ||
    account?.primaryReplica?.connectionStatus ||
    account?.replicas?.[0]?.connectionStatus ||
    null
  );
}

function accountRegion(account) {
  return (
    account?.region ||
    account?.primaryReplica?.region ||
    account?.replicas?.[0]?.region ||
    null
  );
}

function accountIdOf(account) {
  return account?.id || account?._id || null;
}

export async function searchKnownServers(query, platform = "MT5") {
  const q = String(query || "").trim();
  if (!q) return [];

  const version = String(platform).toUpperCase() === "MT4" ? 4 : 5;
  const url = `${PROVISIONING_BASE}/known-mt-servers/${version}/search?query=${encodeURIComponent(q)}`;
  const { data } = await metaFetch(url);

  const brokers = [];
  const grouped = data && typeof data === "object" ? data : {};
  Object.entries(grouped).forEach(([company, servers]) => {
    const list = Array.isArray(servers) ? servers : [];
    list.forEach((serverName, index) => {
      brokers.push({
        id: `${company}::${serverName}::${index}`,
        company,
        name: serverName,
        site: "",
        logoUrl: "",
        access: [],
        platform: version === 4 ? "MT4" : "MT5",
        custom: false,
      });
    });
  });

  return brokers;
}

function parseRetryAfterSeconds(response, fallback = 60) {
  const header = response.headers.get("retry-after");
  if (!header) return fallback;
  const asNumber = Number(header);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.max(5, Math.ceil((asDate - Date.now()) / 1000));
  }
  return fallback;
}

async function createAccountWithRetry(payload, { maxAttempts = 10 } = {}) {
  let lastError;
  let tx = transactionId();
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { data, response } = await metaFetch(`${PROVISIONING_BASE}/users/current/accounts`, {
        method: "POST",
        headers: { "transaction-id": tx },
        body: currentPayload,
      });

      // 202 accepted — reuse same transaction-id and retry after delay
      if (response.status === 202 || data?.message?.toLowerCase?.().includes("retry")) {
        const retryAfter = parseRetryAfterSeconds(response, 60);
        await sleep(Math.min(Math.max(retryAfter, 5), 90) * 1000);
        continue;
      }

      return data;
    } catch (error) {
      lastError = error;
      const details = error?.data?.details;
      const code = details?.code || details || error?.data?.error;

      if (code === "E_RESOURCE_SLOTS" || details?.recommendedResourceSlots) {
        currentPayload = {
          ...currentPayload,
          resourceSlots: Number(details.recommendedResourceSlots) || 2,
        };
        tx = transactionId();
        continue;
      }

      if (code === "E_SRV_NOT_FOUND") {
        const suggestions = details?.serversByBrokers || error?.data?.details?.serversByBrokers;
        const flat = suggestions
          ? Object.entries(suggestions)
              .flatMap(([company, servers]) =>
                (Array.isArray(servers) ? servers : []).map((s) => `${company}: ${s}`)
              )
              .slice(0, 8)
          : [];
        const hint = flat.length ? ` Suggested: ${flat.join("; ")}` : "";
        const err = new Error(
          `Server name not found. Check the exact MT server name.${hint}`
        );
        err.status = 400;
        err.data = error.data;
        throw err;
      }

      if (code === "E_AUTH" || details === "E_AUTH") {
        const err = new Error("Broker rejected the login credentials");
        err.status = 400;
        err.data = error.data;
        throw err;
      }

      if (
        error?.status === 202 ||
        String(error.message || "").toLowerCase().includes("retry")
      ) {
        const retryAfter = 60;
        await sleep(retryAfter * 1000);
        continue;
      }

      // Conflict / duplicate transaction — new id
      if (error?.status === 409) {
        tx = transactionId();
        await sleep(2000);
        continue;
      }

      throw error;
    }
  }
  throw lastError || new Error("Account creation timed out");
}

export async function getAccount(accountId) {
  const { data } = await metaFetch(
    `${PROVISIONING_BASE}/users/current/accounts/${encodeURIComponent(accountId)}`
  );
  return data;
}

export async function deployAccount(accountId) {
  const { data } = await metaFetch(
    `${PROVISIONING_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/deploy`,
    { method: "POST", headers: { "transaction-id": transactionId() } }
  );
  return data;
}

export async function undeployAccount(accountId) {
  const { data } = await metaFetch(
    `${PROVISIONING_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/undeploy`,
    { method: "POST", headers: { "transaction-id": transactionId() } }
  );
  return data;
}

export async function waitUntilConnected(accountId, { timeoutMs = 45000 } = {}) {
  const started = Date.now();
  let account = await getAccount(accountId);

  if (account?.state && account.state !== "DEPLOYED") {
    try {
      await deployAccount(accountId);
    } catch {
      // may already be deploying
    }
  }

  while (Date.now() - started < timeoutMs) {
    account = await getAccount(accountId);
    const connection = accountConnectionStatus(account);

    if (connection === "CONNECTED") return { account, pending: false };
    if (["WRONG_CREDENTIALS", "INVALID_ACCOUNT"].includes(connection)) {
      const err = new Error("Broker rejected the login credentials");
      err.status = 400;
      throw err;
    }
    if (["DISCONNECTED"].includes(connection) && account?.state === "DEPLOY_FAILED") {
      const err = new Error("MetaAPI failed to deploy this account");
      err.status = 502;
      throw err;
    }
    await sleep(4000);
  }

  return { account, pending: true };
}

export async function subscribeToStrategy(account, strategyId) {
  if (!strategyId) return null;
  const region = accountRegion(account) || "vint-hill";
  const base = COPYFACTORY_URL_TEMPLATE.replace("{region}", region);
  const subscriberId = accountIdOf(account);
  const { data } = await metaFetch(
    `${base}/users/current/configuration/subscribers/${encodeURIComponent(subscriberId)}`,
    {
      method: "PUT",
      body: {
        name: account.name || `Subscriber ${account.login}`,
        subscriptions: [
          {
            strategyId,
            multiplier: 1,
          },
        ],
      },
    }
  );
  return data;
}

function sessionPayload(account, {
  login,
  server,
  platform,
  company,
  strategyId,
  subscription,
  subscriptionError,
  pending,
}) {
  const connection = accountConnectionStatus(account);
  return {
    accountId: accountIdOf(account),
    login: login || account?.login || "",
    server: server || account?.server || "",
    platform: platform || (account?.platform === "mt4" ? "MT4" : "MT5"),
    company: company || account?.name || server || "",
    state: account?.state || null,
    connectionStatus: connection,
    region: accountRegion(account),
    strategyId: strategyId || null,
    subscribed: Boolean(subscription) && !subscriptionError,
    subscriptionError: subscriptionError || null,
    pending: Boolean(pending),
  };
}

export async function connectTradingAccount({
  login,
  password,
  server,
  platform = "MT5",
  company = "",
  strategyId = process.env.METAAPI_STRATEGY_ID || "",
}) {
  const userLogin = String(login || "").trim();
  const userPassword = String(password || "");
  const userServer = String(server || "").trim();
  if (!userLogin || !userPassword || !userServer) {
    const err = new Error("Enter login, password, and server");
    err.status = 400;
    throw err;
  }

  const mtPlatform = String(platform).toUpperCase() === "MT4" ? "mt4" : "mt5";
  const keywords = [company, userServer].map((v) => String(v || "").trim()).filter(Boolean);

  const created = await createAccountWithRetry({
    login: userLogin,
    password: userPassword,
    name: `${company || userServer} ${userLogin}`.trim(),
    server: userServer,
    platform: mtPlatform,
    magic: 0,
    manualTrades: true,
    type: "cloud-g2",
    copyFactoryRoles: ["SUBSCRIBER"],
    copyFactoryResourceSlots: 1,
    resourceSlots: 1,
    metastatsApiEnabled: false,
    riskManagementApiEnabled: false,
    ...(keywords.length ? { keywords } : {}),
  });

  const accountId = accountIdOf(created);
  if (!accountId) throw new Error("MetaAPI did not return an account id");

  const { account, pending } = await waitUntilConnected(accountId, { timeoutMs: 40000 });

  let subscription = null;
  let subscriptionError = null;
  if (!pending && strategyId) {
    try {
      subscription = await subscribeToStrategy(account, strategyId);
    } catch (error) {
      subscriptionError = error.message || "CopyFactory subscribe failed";
    }
  }

  return sessionPayload(account || created, {
    login: userLogin,
    server: userServer,
    platform: mtPlatform === "mt4" ? "MT4" : "MT5",
    company: company || "",
    strategyId,
    subscription,
    subscriptionError,
    pending,
  });
}

export async function getConnectionStatus(accountId, {
  strategyId = process.env.METAAPI_STRATEGY_ID || "",
  company = "",
} = {}) {
  const id = String(accountId || "").trim();
  if (!id) {
    const err = new Error("accountId is required");
    err.status = 400;
    throw err;
  }

  const account = await getAccount(id);
  const connection = accountConnectionStatus(account);

  if (["WRONG_CREDENTIALS", "INVALID_ACCOUNT"].includes(connection)) {
    const err = new Error("Broker rejected the login credentials");
    err.status = 400;
    throw err;
  }

  let subscription = null;
  let subscriptionError = null;
  const pending = connection !== "CONNECTED";

  if (!pending && strategyId) {
    try {
      subscription = await subscribeToStrategy(account, strategyId);
    } catch (error) {
      subscriptionError = error.message || "CopyFactory subscribe failed";
    }
  }

  return sessionPayload(account, {
    login: account?.login || "",
    server: account?.server || "",
    platform: account?.platform === "mt4" ? "MT4" : "MT5",
    company: company || account?.name || "",
    strategyId,
    subscription,
    subscriptionError,
    pending,
  });
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
