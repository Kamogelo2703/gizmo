import { endOptions } from "../_cors.js";
import {
  persistBotPhoto,
  readBotPhoto,
  readJsonBody,
  sendJson,
  syncBotPhotoToLicenses,
} from "./_lib.js";

export const config = { maxDuration: 30 };

function getQuery(req) {
  try {
    const host = req.headers?.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    endOptions(res);
    return;
  }

  try {
    if (req.method === "GET") {
      const q = getQuery(req);
      const photo = await readBotPhoto(q.botId);
      if (!photo) {
        sendJson(res, 404, { error: "Photo not found." });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", photo.mime || "image/jpeg");
      // Versioned URLs (?v=...) are safe to cache longer — Android WebView reuses them.
      const versioned = Boolean(String(q.v || "").trim());
      res.setHeader(
        "Cache-Control",
        versioned
          ? "public, max-age=86400, stale-while-revalidate=604800"
          : "public, max-age=120, must-revalidate"
      );
      res.end(photo.buffer);
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const botId = String(body?.botId || "").trim();
      if (!botId) {
        sendJson(res, 400, { error: "botId is required." });
        return;
      }
      const photo = await persistBotPhoto(botId, body?.photo);
      let licenses = [];
      try {
        licenses = await syncBotPhotoToLicenses(botId, photo);
      } catch (error) {
        console.warn("license photo rewrite failed", error.message);
      }
      sendJson(res, 200, { photo, botId, updatedLicenses: licenses.length });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Photo sync failed",
      details: error.data || null,
    });
  }
}
