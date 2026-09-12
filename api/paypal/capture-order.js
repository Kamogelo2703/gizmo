import { setSignupStatus, upsertSignup } from "../signups/_lib.js";
import {
  captureLifetimeOrder,
  extractCaptureEmail,
  isCaptureCompleted,
  isLifetimeAmountPaid,
  readJsonBody,
  sendJson,
} from "./_lib.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const orderId = String(body.orderId || body.id || "").trim();
    const fallbackEmail = String(body.email || "")
      .trim()
      .toLowerCase();

    const capture = await captureLifetimeOrder(orderId);
    if (!isCaptureCompleted(capture)) {
      sendJson(res, 402, {
        error: "Payment was not completed",
        status: capture?.status || null,
      });
      return;
    }
    if (!isLifetimeAmountPaid(capture)) {
      sendJson(res, 402, {
        error: "Payment amount did not match lifetime access price",
      });
      return;
    }

    const email = extractCaptureEmail(capture) || fallbackEmail;
    if (!email || !email.includes("@")) {
      sendJson(res, 400, { error: "Paid, but no email was linked to the order" });
      return;
    }

    // Ensure the signup exists, then auto-approve because payment cleared.
    await upsertSignup(email, { status: "pending" });
    const signup = await setSignupStatus(email, "approved");

    sendJson(res, 200, {
      ok: true,
      orderId,
      email,
      signup,
      captureStatus: capture.status,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Could not capture PayPal payment",
      details: error.data || null,
    });
  }
}
