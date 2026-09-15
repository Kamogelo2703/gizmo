import { getOrCreateDeviceId } from "./deviceId.js";

const STORAGE_KEY = "apexea-device-access-v1";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return {};
    return raw;
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota
  }
}

/** Remember that this phone already unlocked access for an email (paid or bypass). */
export function rememberDeviceAccess(email, { paid = false, bypassed = false } = {}) {
  const key = normalizeEmail(email);
  if (!key.includes("@")) return null;
  const deviceId = getOrCreateDeviceId();
  const store = readStore();
  const device = store[deviceId] && typeof store[deviceId] === "object" ? store[deviceId] : {};
  const prev = device[key] && typeof device[key] === "object" ? device[key] : {};
  device[key] = {
    email: key,
    paid: Boolean(prev.paid || paid),
    bypassed: Boolean(prev.bypassed || bypassed),
    unlockedAt: Number(prev.unlockedAt) || Date.now(),
    updatedAt: Date.now(),
  };
  store[deviceId] = device;
  writeStore(store);
  return device[key];
}

/** True when this phone previously paid or was bypassed for the email. */
export function hasDeviceAccess(email) {
  const key = normalizeEmail(email);
  if (!key.includes("@")) return false;
  const deviceId = getOrCreateDeviceId();
  const row = readStore()?.[deviceId]?.[key];
  if (!row || typeof row !== "object") return false;
  return Boolean(row.paid || row.bypassed || row.unlockedAt);
}

/** License was already activated on this exact phone. */
export function isLicenseBoundToThisDevice(license) {
  const bound = String(license?.deviceId || "").trim();
  if (!bound) return false;
  return bound === getOrCreateDeviceId();
}

/**
 * Payment / unlock for CoverLock: only this phone counts.
 * Same email on another phone, or a different email, must pay again.
 */
export function hasPaidOnThisDevice(email) {
  return hasDeviceAccess(email);
}

export function isSignupEntitled(signup, email = "") {
  const key = email || signup?.email;
  // Device unlock wins even when local signup is still "pending" after a stale sync.
  if (hasDeviceAccess(key)) return true;
  if (!signup) return false;
  const status = String(signup.status || "").toLowerCase();
  if (status === "approved") return true;
  if (signup.accessPaid) return true;
  if (signup.appAccessUnlockedAt) return true;
  return false;
}
