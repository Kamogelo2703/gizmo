import {
  listMentors,
  loginMentor,
  readJsonBody,
  registerMentor,
  sendJson,
  setMentorStatus,
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
      const mentors = await listMentors();
      sendJson(res, 200, { mentors });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const action = String(body.action || body.type || "register").toLowerCase();

      if (action === "login") {
        const mentor = await loginMentor({
          email: body.email,
          password: body.password,
        });
        sendJson(res, 200, { mentor });
        return;
      }

      if (action === "register") {
        const mentor = await registerMentor({
          username: body.username,
          email: body.email,
          contact: body.contact || body.contactNumber || body.phone,
          password: body.password,
        });
        sendJson(res, 200, { mentor });
        return;
      }

      sendJson(res, 400, { error: "Unknown action" });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const mentor = await setMentorStatus(body.email, body.status);
      sendJson(res, 200, { mentor });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Mentor sync failed",
      details: error.data || null,
    });
  }
}
