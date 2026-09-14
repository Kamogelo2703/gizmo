import { listLicenses } from "../licenses/_lib.js";
import { listMentors } from "../mentors/_lib.js";
import {
  clientEmailFromAccount,
  listConnectedTradingAccounts,
  tagAccountClientEmail,
} from "../metaapi/_lib.js";
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

  const byEmail = new Map();
  const accounts = await listMt5Accounts();
  for (const row of accounts) {
    const item = normalizeMt5Account(row);
    if (!item || !clientMeta.has(item.email)) continue;
    byEmail.set(item.email, {
      ...item,
      clientName: clientMeta.get(item.email)?.clientName || "",
    });
  }

  // MetaAPI is the durable source when GitHub registry sync is unavailable.
  try {
    const live = await listConnectedTradingAccounts();
    for (const account of live) {
      const email = clientEmailFromAccount(account);
      if (!email || !clientMeta.has(email)) continue;
      const accountId = String(account.id || account._id || "").trim();
      if (!accountId) continue;
      byEmail.set(email, {
        email,
        accountId,
        login: String(account.login || "").trim(),
        server: String(account.server || "").trim(),
        company: String(account.name || "").trim(),
        platform: account.platform === "mt4" ? "MT4" : "MT5",
        region: String(account.region || account.primaryReplica?.region || "").trim(),
        connectedAt: Date.now(),
        updatedAt: Date.now(),
        clientName: clientMeta.get(email)?.clientName || "",
      });
    }
  } catch {
    // Keep registry-only results if MetaAPI listing fails.
  }

  return Array.from(byEmail.values()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
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
      // Tag MetaAPI so mentors can discover this client without GitHub sync.
      if (account?.accountId && account?.email) {
        try {
          await tagAccountClientEmail(account.accountId, account.email);
        } catch {
          // best-effort
        }
      }
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
