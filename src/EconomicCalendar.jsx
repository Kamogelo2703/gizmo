import { useEffect, useMemo, useState } from "react";
import {
  fetchEconomicEvents,
  formatEventDay,
  todayDateKey,
} from "./economicCalendarApi.js";
import {
  getNextOfficialEvent,
  matchMentorDirection,
} from "./economicCalendarSchedule.js";
import { useApp } from "./store.jsx";

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

  // Refresh "today" across midnight so the next event advances automatically.
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
  const today = todayDateKey(now);
  const nextEvent = useMemo(() => getNextOfficialEvent(now), [now]);
  const isToday = Boolean(nextEvent && nextEvent.date === today);
  const directions = useMemo(
    () => matchMentorDirection(nextEvent, mentorEvents),
    [nextEvent, mentorEvents]
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
        Economic calendar
      </button>

      {!open ? null : (
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
                {nextEvent.note ? (
                  <p className="econ-cal-next-note">{nextEvent.note}</p>
                ) : null}
                <p className="econ-cal-copy">
                  {isToday
                    ? directions
                      ? `The next event is today — ${nextEvent.title} on ${formatEventDay(nextEvent.date)}. Follow your mentor’s signal direction below.`
                      : `The next event is today — ${nextEvent.title} on ${formatEventDay(nextEvent.date)}. Come back once your mentor posts a signal direction.`
                    : `The next event is on ${formatEventDay(nextEvent.date)} (${nextEvent.title}). Come back on the day for directions.`}
                </p>
                {isToday && directions ? (
                  <div className="econ-cal-directions">
                    <p className="econ-cal-directions-label">Signal direction</p>
                    <p className="econ-cal-directions-body">{directions}</p>
                  </div>
                ) : null}
                <p className="econ-cal-hint">
                  Shows one event at a time (NFP, PPI, CPI, or FOMC). After this day it updates
                  automatically. Signal directions remove themselves the day after the event.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
