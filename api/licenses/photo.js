import { persistBotPhoto, readBotPhoto, readJsonBody, sendJson } from "./_lib.js";

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
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
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
      res.setHeader("Cache-Control", "public, max-age=86400");
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
      sendJson(res, 200, { photo, botId });
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
