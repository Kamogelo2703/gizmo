/**
 * Official US macro events shown in the app Economic Calendar.
 * Only NFP, PPI, CPI, and FOMC. Dates from BLS / Federal Reserve schedules.
 * After an event day passes, getNextOfficialEvent() advances to the next one.
 *
 * Signal directions:
 * - Editable until 1 hour before the event start (ET)
 * - Visible to clients only on the event day
 * - Removed automatically the day after
 */

export const MACRO_EVENT_TYPES = ["NFP", "PPI", "CPI", "FOMC"];
/** Default release times in US Eastern (24h HH:MM). */
export const DEFAULT_EVENT_TIMES_ET = {
  NFP: "08:30",
  PPI: "08:30",
  CPI: "08:30",
  FOMC: "14:00",
};

function normalizeEventDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayDateKey(now = new Date(), timeZone = "America/New_York") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fall through
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function withEventTime(row) {
  const title = String(row.title || "").trim().toUpperCase();
  const timeEt =
    String(row.timeEt || DEFAULT_EVENT_TIMES_ET[title] || "08:30").trim() || "08:30";
  return {
    ...row,
    date: normalizeEventDate(row.date),
    title,
    timeEt,
  };
}

/** @type {{ id: string, date: string, title: string, timeEt: string, note?: string }[]} */
export const OFFICIAL_MACRO_EVENTS = [
  // September 2026
  { id: "nfp-2026-09-04", date: "2026-09-04", title: "NFP", note: "August employment" },
  { id: "ppi-2026-09-10", date: "2026-09-10", title: "PPI", note: "August PPI" },
  { id: "cpi-2026-09-11", date: "2026-09-11", title: "CPI", note: "August CPI" },
  { id: "fomc-2026-09-16", date: "2026-09-16", title: "FOMC", note: "Sep 15–16 decision" },
  // October 2026
  { id: "nfp-2026-10-02", date: "2026-10-02", title: "NFP", note: "September employment" },
  { id: "cpi-2026-10-14", date: "2026-10-14", title: "CPI", note: "September CPI" },
  { id: "ppi-2026-10-15", date: "2026-10-15", title: "PPI", note: "September PPI" },
  { id: "fomc-2026-10-28", date: "2026-10-28", title: "FOMC", note: "Oct 27–28 decision" },
  // November 2026
  { id: "nfp-2026-11-06", date: "2026-11-06", title: "NFP", note: "October employment" },
  { id: "cpi-2026-11-10", date: "2026-11-10", title: "CPI", note: "October CPI" },
  { id: "ppi-2026-11-13", date: "2026-11-13", title: "PPI", note: "October PPI" },
  // December 2026
  { id: "nfp-2026-12-04", date: "2026-12-04", title: "NFP", note: "November employment" },
  { id: "fomc-2026-12-09", date: "2026-12-09", title: "FOMC", note: "Dec 8–9 decision" },
  { id: "cpi-2026-12-10", date: "2026-12-10", title: "CPI", note: "November CPI" },
  { id: "ppi-2026-12-15", date: "2026-12-15", title: "PPI", note: "November PPI" },
].map(withEventTime);

export function normalizeMacroTitle(title) {
  const raw = String(title || "")
    .trim()
    .toUpperCase();
  if (MACRO_EVENT_TYPES.includes(raw)) return raw;
  if (/\bNFP\b|NON[\s-]?FARM|EMPLOYMENT SITUATION|PAYROLL/i.test(raw)) return "NFP";
  if (/\bPPI\b|PRODUCER PRICE/i.test(raw)) return "PPI";
  if (/\bCPI\b|CONSUMER PRICE/i.test(raw)) return "CPI";
  if (/\bFOMC\b|FED(ERAL)?\s*RESERVE|RATE DECISION/i.test(raw)) return "FOMC";
  return "";
}

/**
 * Event start instant in the viewer's local clock, based on US/Eastern release time.
 */
export function getOfficialEventStartMs(event, now = new Date()) {
  if (!event?.date) return null;
  const timeEt =
    String(event.timeEt || DEFAULT_EVENT_TIMES_ET[normalizeMacroTitle(event.title)] || "08:30")
      .trim() || "08:30";
  const [hh, mm] = timeEt.split(":").map((n) => Number(n));
  const hour = Number.isFinite(hh) ? hh : 8;
  const minute = Number.isFinite(mm) ? mm : 30;

  // Build an ISO-like local ET timestamp and let the engine resolve DST.
  // Using Date parsing of America/New_York via Intl offset probe.
  const probe = new Date(`${event.date}T12:00:00Z`);
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const tzName = etParts.find((p) => p.type === "timeZoneName")?.value || "GMT-4";
  const match = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  let offset = "-04:00";
  if (match) {
    const sign = match[1].startsWith("-") ? "-" : "+";
    const oh = String(Math.abs(Number(match[1]))).padStart(2, "0");
    const om = String(match[2] ? Number(match[2]) : 0).padStart(2, "0");
    offset = `${sign}${oh}:${om}`;
  }
  const iso = `${event.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
  const ms = Date.parse(iso);
  if (Number.isFinite(ms)) return ms;
  // Fallback: treat as local time
  const local = new Date(
    Number(event.date.slice(0, 4)),
    Number(event.date.slice(5, 7)) - 1,
    Number(event.date.slice(8, 10)),
    hour,
    minute,
    0,
    0
  );
  return local.getTime();
}

export function getSignalEditLockMs(event) {
  const start = getOfficialEventStartMs(event);
  if (start == null) return null;
  return start - 60 * 60 * 1000;
}

export function isSignalDirectionEditable(event, now = new Date()) {
  if (!event) return false;
  const todayEt = todayDateKey(now, "America/New_York");
  // Past event days are expired — not editable.
  if (event.date < todayEt) return false;
  const lockAt = getSignalEditLockMs(event);
  if (lockAt == null) return event.date > todayEt;
  // Future days stay editable; on event day lock 1 hour before release.
  return now.getTime() < lockAt;
}

export function isSignalDirectionVisibleToday(event, now = new Date()) {
  if (!event) return false;
  const todayEt = todayDateKey(now, "America/New_York");
  return event.date === todayEt;
}

export function isSignalDirectionExpired(eventOrDate, now = new Date()) {
  const date = normalizeEventDate(eventOrDate?.date || eventOrDate);
  if (!date) return true;
  const todayEt = todayDateKey(now, "America/New_York");
  return date < todayEt;
}

export function formatSignalLockLabel(event, now = new Date()) {
  if (!event) return "";
  if (isSignalDirectionExpired(event, now)) return "Expired — removed after event day";
  if (isSignalDirectionEditable(event, now)) {
    const lockAt = getSignalEditLockMs(event);
    if (lockAt == null) return "Editable";
    const mins = Math.max(0, Math.round((lockAt - now.getTime()) / 60000));
    if (event.date > todayDateKey(now, "America/New_York")) {
      return `Editable until 1 hour before ${event.title} (${event.timeEt} ET)`;
    }
    return `Editable for ${mins} more minute${mins === 1 ? "" : "s"} (locks 1 hour before ${event.timeEt} ET)`;
  }
  return `Locked — editing closed 1 hour before ${event.title} (${event.timeEt} ET)`;
}

export function getNextOfficialEvent(now = new Date()) {
  const today = todayDateKey(now, "America/New_York");
  // Show the event on its day; the following day auto-advances to the next.
  return OFFICIAL_MACRO_EVENTS.find((event) => event.date >= today) || null;
}

export function listUpcomingOfficialEvents(now = new Date(), limit = 12) {
  const today = todayDateKey(now, "America/New_York");
  return OFFICIAL_MACRO_EVENTS.filter((event) => event.date >= today).slice(
    0,
    Math.max(1, Number(limit) || 12)
  );
}

export function findOfficialEvent({ id = "", date = "", title = "" } = {}) {
  const key = String(id || "").trim();
  if (key) {
    const byId = OFFICIAL_MACRO_EVENTS.find((event) => event.id === key);
    if (byId) return byId;
  }
  const day = normalizeEventDate(date);
  const macro = normalizeMacroTitle(title);
  if (!day || !macro) return null;
  return (
    OFFICIAL_MACRO_EVENTS.find(
      (event) => event.date === day && event.title === macro
    ) || null
  );
}

export function matchMentorDirection(official, mentorEvents = [], now = new Date()) {
  if (!official) return "";
  // Directions only show on the event day; they remove themselves the day after.
  if (!isSignalDirectionVisibleToday(official, now)) return "";
  const list = Array.isArray(mentorEvents) ? mentorEvents : [];
  const exact = list.find(
    (row) =>
      String(row.officialEventId || "").trim() === official.id ||
      String(row.id || "").trim() === official.id ||
      (normalizeEventDate(row.date) === official.date &&
        normalizeMacroTitle(row.title) === official.title)
  );
  return String(exact?.directions || "").trim();
}

export function filterActiveMentorDirections(mentorEvents = [], now = new Date()) {
  return (Array.isArray(mentorEvents) ? mentorEvents : []).filter(
    (row) => !isSignalDirectionExpired(row, now)
  );
}
