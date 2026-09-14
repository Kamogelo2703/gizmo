/**
 * Official US macro events shown in the app Economic Calendar.
 * Only NFP, PPI, CPI, and FOMC. Dates from BLS / Federal Reserve schedules.
 * After an event day passes, getNextOfficialEvent() advances to the next one.
 */

export const MACRO_EVENT_TYPES = ["NFP", "PPI", "CPI", "FOMC"];

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

function todayDateKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @type {{ id: string, date: string, title: string, note?: string }[]} */
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
].map((row) => ({
  ...row,
  date: normalizeEventDate(row.date),
  title: String(row.title || "").trim().toUpperCase(),
}));

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

export function getNextOfficialEvent(now = new Date()) {
  const today = todayDateKey(now);
  // Show the event on its day; the following day auto-advances to the next.
  return OFFICIAL_MACRO_EVENTS.find((event) => event.date >= today) || null;
}

export function listUpcomingOfficialEvents(now = new Date(), limit = 12) {
  const today = todayDateKey(now);
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

export function matchMentorDirection(official, mentorEvents = []) {
  if (!official) return "";
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
