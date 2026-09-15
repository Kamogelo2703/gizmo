import { endOptions } from "../_cors.js";
import {
  listSignups,
  readJsonBody,
  sendJson,
  setSignupAccessPaid,
  setSignupPremiumScanner,
  setSignupStatus,
  upsertSignup,
} from "./_lib.js";
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    endOptions(res);
    return;
  }

  try {
    if (req.method === "GET") {
      const signups = await listSignups();
      sendJson(res, 200, { signups });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const signup = await upsertSignup(body.email, {
        status: body.status || "pending",
      });
      sendJson(res, 200, { signup });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      if (body.premiumScanner === true || body.action === "premiumScanner") {
        // Single write — setSignupPremiumScanner also approves the account.
        const signup = await setSignupPremiumScanner(body.email, true);
        sendJson(res, 200, { signup, premiumScanner: true });
        return;
      }
      if (
        body.accessPaid === true ||
        body.action === "accessPaid" ||
        body.action === "markPaid"
      ) {
        const signup = await setSignupAccessPaid(body.email, true);
        sendJson(res, 200, { signup, accessPaid: true });
        return;
      }
      const signup = await setSignupStatus(body.email, body.status);
      sendJson(res, 200, { signup });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Signup sync failed",
      details: error.data || null,
    });
  }
}
