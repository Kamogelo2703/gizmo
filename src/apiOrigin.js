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
 * Tiny legacy data-URL embeds (~40–48KB) look soft when upscaled on Android
 * retina WebViews — prefer the durable full-quality photo API when we have an id.
 */
export function resolveBotPhotoSrc(bot, fallback = "/logo.png") {
  const id = String(bot?.id || "").trim();
  const photo = String(bot?.photo || "").trim();
  // Durable API path when we already have one.
  if (photo.startsWith("/api/licenses/photo")) return mediaUrl(photo);
  if (/^https?:\/\//i.test(photo)) return photo;
  // Tiny legacy data-URL embeds look soft when upscaled on Android retina
  // WebViews — prefer the durable full-quality photo API when we have an id.
  if (id && photo.startsWith("data:image/")) {
    return mediaUrl(
      `/api/licenses/photo?botId=${encodeURIComponent(id)}&v=full`
    );
  }
  if (photo) return mediaUrl(photo);
  return fallback;
}
