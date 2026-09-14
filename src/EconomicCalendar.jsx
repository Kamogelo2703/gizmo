import { useEffect, useMemo, useState } from "react";
import {
  fetchEconomicEvents,
  formatEventDay,
  getEventsOnDate,
  getNextEvent,
  todayDateKey,
} from "./economicCalendarApi.js";
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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const mentorEmail = useMemo(
    () => resolveMentorEmail({ activeBot, coverEmail, eas, licenseKeys }),
    [activeBot, coverEmail, eas, licenseKeys]
  );

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchEconomicEvents(mentorEmail);
        if (!cancelled) setEvents(list);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mentorEmail]);

  const today = todayDateKey();
  const nextEvent = useMemo(() => getNextEvent(events), [events]);
  const todayEvents = useMemo(() => getEventsOnDate(events, today), [events, today]);
  const upcoming = useMemo(() => {
    return (Array.isArray(events) ? events : [])
      .filter((e) => e.date >= today)
      .slice(0, 6);
  }, [events, today]);

  const isToday = nextEvent && nextEvent.date === today;
  const directionsToday = todayEvents
    .map((e) => e.directions)
    .filter(Boolean)
    .join("\n\n");

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
              <p className="econ-cal-copy">Loading events…</p>
            ) : !nextEvent ? (
              <p className="econ-cal-copy">
                No upcoming events yet. Your mentor will add dates and directions here.
              </p>
            ) : (
              <>
                <p className="econ-cal-next-label">Next event</p>
                <p className="econ-cal-next-day">{formatEventDay(nextEvent.date)}</p>
                <p className="econ-cal-next-title">{nextEvent.title}</p>
                <p className="econ-cal-copy">
                  {isToday
                    ? directionsToday
                      ? `The next event is today (${formatEventDay(nextEvent.date)}). Follow your mentor’s directions below.`
                      : "The next event is today. Come back once your mentor posts directions."
                    : `The next event is on ${formatEventDay(nextEvent.date)}. Come back on the day for directions.`}
                </p>
                {isToday && directionsToday ? (
                  <div className="econ-cal-directions">
                    <p className="econ-cal-directions-label">Today’s directions</p>
                    <p className="econ-cal-directions-body">{directionsToday}</p>
                  </div>
                ) : null}
              </>
            )}

            {upcoming.length > 0 ? (
              <div className="econ-cal-list">
                <p className="econ-cal-list-label">Upcoming dates</p>
                <ul>
                  {upcoming.map((event) => (
                    <li key={event.id}>
                      <strong>{formatEventDay(event.date)}</strong>
                      <span>{event.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
