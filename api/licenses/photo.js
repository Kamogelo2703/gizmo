import { endOptions } from "../_cors.js";
import {
  persistBotPhoto,
  readBotPhoto,
  readJsonBody,
  resolveRawBotPhotoUrl,
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
      const versioned = Boolean(String(q.v || "").trim());
      const cacheControl = versioned
        ? "public, max-age=86400, stale-while-revalidate=604800"
        : "public, max-age=120, must-revalidate";

      // Serve local/memory bytes first (instant on warm instances).
      const photo = await readBotPhoto(q.botId);
      if (photo?.buffer?.length) {
        res.statusCode = 200;
        res.setHeader("Content-Type", photo.mime || "image/jpeg");
        res.setHeader("Cache-Control", cacheControl);
        res.end(photo.buffer);
        return;
      }

      // Last resort: point the browser at GitHub's raw CDN directly.
      const rawUrl = await resolveRawBotPhotoUrl(q.botId);
      if (rawUrl) {
        res.statusCode = 302;
        res.setHeader("Location", rawUrl);
        res.setHeader("Cache-Control", cacheControl);
        res.end();
        return;
      }

      sendJson(res, 404, { error: "Photo not found." });
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
