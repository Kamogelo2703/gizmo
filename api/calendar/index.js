import {
  deleteEvent,
  listEvents,
  readJsonBody,
  sendJson,
  upsertEvent,
} from "./_lib.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url || "/", "http://localhost");
      const mentorEmail = url.searchParams.get("mentorEmail") || "";
      const events = await listEvents({ mentorEmail });
      sendJson(res, 200, { events });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const action = String(body.action || body.type || "upsert").toLowerCase();

      if (action === "delete" || action === "remove") {
        const event = await deleteEvent(body.id, body.mentorEmail);
        sendJson(res, 200, { event });
        return;
      }

      const event = await upsertEvent(body.event || body);
      sendJson(res, 200, { event });
      return;
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url || "/", "http://localhost");
      const id = url.searchParams.get("id") || "";
      const mentorEmail = url.searchParams.get("mentorEmail") || "";
      const event = await deleteEvent(id, mentorEmail);
      sendJson(res, 200, { event });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Economic calendar sync failed",
      details: error.data || null,
    });
  }
}
