/** Live production API host — secrets stay on Vercel. */
export const PROD_API_ORIGIN = "https://www.apex-ea.com";

/** Native Capacitor shell (or local Vite) is not same-origin with apex-ea.com. */
export function needsAbsoluteApi() {
  if (typeof window === "undefined") return false;
  try {
    if (
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  const host = String(window.location?.hostname || "");
  return host === "localhost" || host === "127.0.0.1";
}

/** Prefix `/api/...` paths with production origin when the UI is not on apex-ea.com. */
export function apiUrl(path = "/") {
  const raw = String(path || "/");
  if (/^https?:\/\//i.test(raw)) return raw;
  const p = raw.startsWith("/") ? raw : `/${raw}`;
  return needsAbsoluteApi() ? `${PROD_API_ORIGIN}${p}` : p;
}

/**
 * Resolve media/src values for <img> and fetch.
 * Keeps data URLs and absolute URLs; absolutizes `/api/...` on native.
 * Local static assets (`/logo.png`) stay relative so they load from the APK.
 */
export function mediaUrl(src) {
  const value = String(src || "").trim();
  if (!value) return value;
  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }
  if (value.startsWith("/api/")) return apiUrl(value);
  return value;
}

/**
 * Home / hero / orb display source for a bot.
 * Prefer instant local bytes (data URL / packaged asset) so Android cold start
 * is not blank while /api/licenses/photo loads from apex-ea.com.
 * Durable API paths are used when that is all we have.
 */
export function resolveBotPhotoSrc(bot, fallback = "/logo.png") {
  const id = String(bot?.id || "").trim();
  const photo = String(bot?.photo || "").trim();

  // Instant local / absolute sources — never block first paint on a network hop.
  if (photo.startsWith("data:image/") || photo.startsWith("blob:")) return photo;
  if (/^https?:\/\//i.test(photo)) return photo;
  if (photo && photo !== "/logo.png" && !photo.startsWith("/api/")) {
    return mediaUrl(photo);
  }

  // Durable remote photo when local bytes were slimmed away.
  if (photo.startsWith("/api/licenses/photo")) return mediaUrl(photo);
  if (id && (!photo || photo === "/logo.png")) {
    return mediaUrl(
      `/api/licenses/photo?botId=${encodeURIComponent(id)}&v=full`
    );
  }
  if (photo) return mediaUrl(photo);
  return fallback;
}
