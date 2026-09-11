import {
  createLicense,
  findLicense,
  findLicensesByEmail,
  listLicenses,
  markLicenseUsed,
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

  try {
    if (req.method === "GET") {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      const key = url.searchParams.get("key") || "";
      const email = url.searchParams.get("email") || "";
      if (key) {
        const license = await findLicense(key);
        if (!license) {
          sendJson(res, 404, { error: "Invalid license key" });
          return;
        }
        sendJson(res, 200, { license });
        return;
      }
      if (email) {
        const licenses = await findLicensesByEmail(email);
        sendJson(res, 200, { licenses });
        return;
      }
      const licenses = await listLicenses();
      sendJson(res, 200, { licenses });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const license = await createLicense(body);
      sendJson(res, 200, { license });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const license = await markLicenseUsed(body.key);
      sendJson(res, 200, { license });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "License sync failed",
      details: error.data || null,
    });
  }
}
