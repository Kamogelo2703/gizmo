import { listLicenses } from "../licenses/_lib.js";
import { listMentors } from "../mentors/_lib.js";
import {
  listMt5Accounts,
  normalizeMt5Account,
  readJsonBody,
  removeMt5Account,
  sendJson,
  upsertMt5Account,
} from "./_lib.js";

export const config = { maxDuration: 30 };

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function assertApprovedMentor(email) {
  const key = normalizeEmail(email);
  if (!key || !key.includes("@")) {
    const err = new Error("mentorEmail is required");
    err.status = 400;
    throw err;
  }
  const mentors = await listMentors();
  const mentor = mentors.find((row) => normalizeEmail(row.email) === key);
  if (!mentor) {
    const err = new Error("Mentor not found");
    err.status = 404;
    throw err;
  }
  if (mentor.status !== "approved" && mentor.role !== "superadmin") {
    const err = new Error("Mentor account is not approved");
    err.status = 403;
    throw err;
  }
  return mentor;
}

async function listAccountsForMentor(mentorEmail) {
  const mentor = await assertApprovedMentor(mentorEmail);
  const licenses = await listLicenses();
  const clientMeta = new Map();
  for (const row of licenses) {
    if (normalizeEmail(row.mentorEmail) !== mentor.email) continue;
    const clientEmail = normalizeEmail(row.clientEmail);
    if (!clientEmail) continue;
    if (!clientMeta.has(clientEmail)) {
      clientMeta.set(clientEmail, {
        clientEmail,
        clientName: String(row.clientName || row.mainText || "").trim(),
      });
    }
  }

  const accounts = await listMt5Accounts();
  return accounts
    .map((row) => normalizeMt5Account(row))
    .filter(Boolean)
    .filter((row) => clientMeta.has(row.email))
    .map((row) => ({
      ...row,
      clientName: clientMeta.get(row.email)?.clientName || "",
    }));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      const mentorEmail = url.searchParams.get("mentorEmail") || "";
      const email = url.searchParams.get("email") || "";

      if (mentorEmail) {
        const accounts = await listAccountsForMentor(mentorEmail);
        sendJson(res, 200, { accounts });
        return;
      }

      if (email) {
        const key = normalizeEmail(email);
        const accounts = (await listMt5Accounts()).filter(
          (row) => normalizeEmail(row.email) === key
        );
        sendJson(res, 200, { accounts });
        return;
      }

      sendJson(res, 400, { error: "mentorEmail or email query is required" });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const account = await upsertMt5Account(body);
      sendJson(res, 200, { account });
      return;
    }

    if (req.method === "DELETE") {
      const body = await readJsonBody(req);
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      const email = body.email || url.searchParams.get("email") || "";
      const result = await removeMt5Account(email);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "MT5 account sync failed",
      details: error.data || null,
    });
  }
}
