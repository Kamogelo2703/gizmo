/** Allow Capacitor localhost shell + production site to call Vercel APIs. */
export function applyCorsHeaders(res) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function endOptions(res) {
  applyCorsHeaders(res);
  res.statusCode = 204;
  res.end();
}
