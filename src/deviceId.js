const DEVICE_ID_KEY = "apexea-device-id";

/** Stable per-browser id so a license stays locked to the first phone that connects. */
export function getOrCreateDeviceId() {
  try {
    const existing = String(localStorage.getItem(DEVICE_ID_KEY) || "").trim();
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-temp-${Date.now().toString(36)}`;
  }
}
