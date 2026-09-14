import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatEventDay } from "./economicCalendarApi.js";
import {
  getMentorSignalForEvent,
  getNextOfficialEvent,
  SA_TIMEZONE,
} from "./economicCalendarSchedule.js";
import { useApp } from "./store.jsx";

function todaySaDateKey(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SA_TIMEZONE,
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

function resolveMentorEmail({ activeBot, coverEmail, eas, licenseKeys }) {
  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const account = normalize(coverEmail);
  const botId = String(activeBot?.id || "").trim();
  const keys = Array.isArray(licenseKeys) ? licenseKeys : [];
  const eaList = Array.isArray(eas) ? eas : [];

  if (botId) {
    const forBot = keys
      .filter(
        (row) =>
          String(row.botId || "").trim() === botId ||
          String(row.bot?.id || "").trim() === botId
      )
      .sort(
        (a, b) =>
          Number(b.usedAt || b.updatedAt || 0) - Number(a.usedAt || a.updatedAt || 0)
      );
    const fromBot = normalize(forBot.find((row) => row?.used)?.mentorEmail || forBot[0]?.mentorEmail);
    if (fromBot) return fromBot;
    const ea = eaList.find((item) => String(item.id || "").trim() === botId);
    const fromEa = normalize(ea?.ownerEmail);
    if (fromEa) return fromEa;
  }

  if (account) {
    const used = keys
      .filter((row) => row?.used && normalize(row.clientEmail) === account)
      .sort(
        (a, b) =>
          Number(b.usedAt || b.updatedAt || 0) - Number(a.usedAt || a.updatedAt || 0)
      );
    const fromUsed = normalize(used[0]?.mentorEmail);
    if (fromUsed) return fromUsed;
  }

  return "";
}

export default function EconomicCalendarButton({ variant = "zeta" }) {
  const { activeBot, coverEmail, eas, licenseKeys } = useApp();
  const [open, setOpen] = useState(false);
  const [mentorEvents, setMentorEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const mentorEmail = useMemo(
    () => resolveMentorEmail({ activeBot, coverEmail, eas, licenseKeys }),
    [activeBot, coverEmail, eas, licenseKeys]
  );

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { fetchEconomicEvents } = await import("./economicCalendarApi.js");
        const list = await fetchEconomicEvents(mentorEmail);
        if (!cancelled) setMentorEvents(list);
      } catch {
        if (!cancelled) setMentorEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mentorEmail]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const today = todaySaDateKey(now);
  const nextEvent = useMemo(() => getNextOfficialEvent(now), [now]);
  const isToday = Boolean(nextEvent && nextEvent.date === today);
  // Show mentor signal for the current/next event until the day after (then it clears).
  const signal = useMemo(
    () => getMentorSignalForEvent(nextEvent, mentorEvents, now),
    [nextEvent, mentorEvents, now]
  );

  return (
    <>
      <button
        className={`econ-cal-btn econ-cal-btn-${variant}`}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="econ-cal-btn-ring" aria-hidden="true" />
        <span className="econ-cal-btn-ring econ-cal-btn-ring--outer" aria-hidden="true" />
        <span className="econ-cal-btn-label">Economic calendar</span>
      </button>

      {!open
        ? null
        : createPortal(
            <div
              className="econ-cal-backdrop"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                className="econ-cal-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Economic calendar"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="econ-cal-panel-head">
                  <h2>Economic calendar</h2>
                  <button
                    className="econ-cal-close"
                    type="button"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                {loading ? (
                  <p className="econ-cal-copy">Loading next event…</p>
                ) : !nextEvent ? (
                  <p className="econ-cal-copy">
                    No upcoming NFP, PPI, CPI, or FOMC events on the calendar.
                  </p>
                ) : (
                  <>
                    <p className="econ-cal-next-label">Next event</p>
                    <p className="econ-cal-next-title">{nextEvent.title}</p>
                    <p className="econ-cal-next-day">{formatEventDay(nextEvent.date)}</p>
                    <p className="econ-cal-next-note">
                      {nextEvent.timeSa || nextEvent.timeEt} SAST
                      {nextEvent.note ? ` · ${nextEvent.note}` : ""}
                    </p>
                    <div className="econ-cal-directions">
                      <p className="econ-cal-directions-label">Signal direction</p>
                      {signal ? (
                        <p className="econ-cal-directions-body">{signal}</p>
                      ) : (
                        <p className="econ-cal-directions-body is-empty">
                          {isToday
                            ? "No signal direction from your mentor yet."
                            : "No signal direction yet — your mentor will add it from their portal."}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )}
    </>
  );
}
