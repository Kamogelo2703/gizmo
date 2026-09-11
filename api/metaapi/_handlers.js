import {
  connectTradingAccount,
  getConnectionStatus,
  getAccount,
  placeMarketTrade,
  readJsonBody,
  searchKnownServers,
  sendJson,
  tokenFromRequest,
  undeployAccount,
} from "./_lib.js";

export async function handleBrokers(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    const q = url.searchParams.get("q") || "";
    const platform = url.searchParams.get("platform") || "MT5";
    const token = tokenFromRequest(req);
    const brokers = await searchKnownServers(q, platform, { token });
    sendJson(res, 200, { brokers });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Broker search failed",
      details: error.data || null,
    });
  }
}

export async function handleConnect(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const session = await connectTradingAccount({
      login: body.login,
      password: body.password,
      server: body.server,
      platform: body.platform || "MT5",
      company: body.company || "",
      strategyId: body.strategyId || process.env.METAAPI_STRATEGY_ID || "",
    });
    sendJson(res, 200, session);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Connection failed",
      details: error.data || null,
    });
  }
}

export async function handleStatus(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    const accountId = url.searchParams.get("accountId") || "";
    const company = url.searchParams.get("company") || "";
    const strategyId =
      url.searchParams.get("strategyId") || process.env.METAAPI_STRATEGY_ID || "";
    const session = await getConnectionStatus(accountId, { strategyId, company });
    sendJson(res, 200, session);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Status check failed",
      details: error.data || null,
    });
  }
}

export async function handleTrade(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const token = tokenFromRequest(req);
    const result = await placeMarketTrade({
      accountId: body.accountId,
      symbol: body.symbol,
      volume: body.volume,
      side: body.side || body.action || "BUY",
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
      comment: body.comment || "ApexEA scanner",
      region: body.region,
      token,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Trade failed",
      details: error.data || null,
    });
  }
}

export async function handleDisconnect(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const accountId = String(body.accountId || "").trim();
    if (!accountId) {
      sendJson(res, 400, { error: "accountId is required" });
      return;
    }
    try {
      await undeployAccount(accountId);
    } catch {
      // ignore undeploy errors for UX disconnect
    }
    let account = null;
    try {
      account = await getAccount(accountId);
    } catch {
      account = null;
    }
    sendJson(res, 200, {
      accountId,
      state: account?.state || "UNDEPLOYED",
      disconnected: true,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Disconnect failed",
      details: error.data || null,
    });
  }
}
