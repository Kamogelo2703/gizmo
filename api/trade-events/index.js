import { endOptions } from "../_cors.js";
import {
  ackTradeEvents,
  listPendingTradeEvents,
  readJsonBody,
  sendJson,
} from "./_lib.js";

export const config = { maxDuration: 30 };

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    endOptions(res);
    return;
  }

  try {
    if (req.method === "GET") {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url, `http://${host}`);
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email || !email.includes("@")) {
        sendJson(res, 400, { error: "email is required" });
        return;
      }
      const events = await listPendingTradeEvents(email);
      sendJson(res, 200, { events });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email || body.clientEmail);
      const ids = Array.isArray(body.ids)
        ? body.ids
        : body.id
          ? [body.id]
          : [];
      if (!email || !email.includes("@")) {
        sendJson(res, 400, { error: "email is required" });
        return;
      }
      const result = await ackTradeEvents(email, ids);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Trade events failed",
      details: error.data || null,
    });
  }
}
