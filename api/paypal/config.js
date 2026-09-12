import { LIFETIME_CURRENCY, LIFETIME_PRICE, PAYPAL_CLIENT_ID, sendJson } from "./_lib.js";

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const secretConfigured = Boolean(process.env.PAYPAL_CLIENT_SECRET);
  sendJson(res, 200, {
    clientId: PAYPAL_CLIENT_ID,
    amount: LIFETIME_PRICE,
    currency: LIFETIME_CURRENCY,
    mode: String(process.env.PAYPAL_MODE || "live").toLowerCase() === "sandbox" ? "sandbox" : "live",
    ready: Boolean(PAYPAL_CLIENT_ID) && secretConfigured,
    secretConfigured,
  });
}
