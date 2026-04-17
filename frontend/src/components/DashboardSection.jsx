import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";

export function DashboardSection({
  dashboard,
  dashboardSearch,
  setDashboardSearch,
  dashboardRecent,
  events,
  holidays = [],
  employees = [],
  userDisplayName = "User",
  onNavigate,
}) {
  const todayYmd = dayjs().format("YYYY-MM-DD");
  const [viewMonth, setViewMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const dayScrollRef = useRef(null);
  const recentScrollRef = useRef(null);

  const ym = viewMonth;

  const { calendarCells, monthLabel } = useMemo(() => {
    const first = dayjs(`${ym}-01`);
    const startPad = first.day();
    const dim = first.daysInMonth();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push({ type: "pad" });
    for (let d = 1; d <= dim; d++) {
      const dateStr = first.date(d).format("YYYY-MM-DD");
      cells.push({ type: "day", day: d, dateStr });
    }
    while (cells.length % 7 !== 0) cells.push({ type: "pad" });
    return { calendarCells: cells, monthLabel: first.format("MMMM YYYY") };
  }, [ym]);

  const eventsByDate = useMemo(() => {
    const m = {};
    for (const ev of events) {
      if (!ev?.date) continue;
      if (!ev.date.startsWith(ym)) continue;
      (m[ev.date] ||= []).push(ev);
    }
    return m;
  }, [events, ym]);

  const holidaysByDate = useMemo(() => {
    const m = {};
    for (const h of holidays) {
      if (!h?.date?.startsWith(ym)) continue;
      (m[h.date] ||= []).push(h);
    }
    return m;
  }, [holidays, ym]);

  const birthdaysByDate = useMemo(() => {
    const m = {};
    const year = dayjs(`${ym}-01`).year();
    for (const emp of employees) {
      if (!emp.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(emp.birthday)) continue;
      const bd = dayjs(emp.birthday);
      if (!bd.isValid()) continue;
      const occ = dayjs(`${year}-${bd.format("MM-DD")}`);
      if (!occ.isValid()) continue;
      const key = occ.format("YYYY-MM-DD");
      if (!key.startsWith(ym)) continue;
      (m[key] ||= []).push({ id: emp.id, name: emp.name });
    }
    return m;
  }, [employees, ym]);

  const selectedDayEvents = eventsByDate[selectedDate] || [];
  const selectedDayHolidays = holidaysByDate[selectedDate] || [];
  const selectedDayBirthdays = birthdaysByDate[selectedDate] || [];
  const upcomingFallback = (dashboard.upcomingEvents || []).filter((e) => e.date >= todayYmd).slice(0, 2);

  const goPrevMonth = () => {
    const nm = dayjs(`${ym}-01`).subtract(1, "month").format("YYYY-MM");
    setViewMonth(nm);
    setSelectedDate(`${nm}-01`);
  };

  const goNextMonth = () => {
    const nm = dayjs(`${ym}-01`).add(1, "month").format("YYYY-MM");
    setViewMonth(nm);
    setSelectedDate(`${nm}-01`);
  };

  const goToday = () => {
    const t = dayjs().format("YYYY-MM");
    setViewMonth(t);
    setSelectedDate(todayYmd);
  };

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const now = dayjs();
  const greeting =
    now.hour() < 12 ? "Good morning" : now.hour() < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    if (dayScrollRef.current) dayScrollRef.current.scrollTop = 0;
  }, [selectedDate]);

  useEffect(() => {
    if (recentScrollRef.current) recentScrollRef.current.scrollTop = 0;
  }, [dashboardSearch, dashboardRecent.length]);

  return (
    <section className="dash-simple">
      <div className="dash-overview">
        <div className="dash-overview-bg" aria-hidden="true" />
        <div className="dash-overview-inner">
          <div className="dash-overview-main">
            <span className="dash-kicker">Operations overview</span>
            <h2 className="dash-overview-title">
              {greeting}, <span className="dash-overview-accent">{userDisplayName}</span>!
            </h2>
            <p className="dash-overview-desc">
              Election operations at a glance: batches, OB slips, calendar, and staff. Data updates when the API is
              connected.
            </p>
            <div className="dash-overview-meta">
              <span className="dash-pulse" title="Workspace ready when backend is running">
                <span className="dash-pulse-dot" /> Live workspace
              </span>
              <span className="dash-meta-date">{now.format("dddd, MMMM D, YYYY")}</span>
            </div>
          </div>
          <div className="dash-overview-side">
            <div className="dash-overview-statbox">
              <span className="dash-overview-stat-label">Pipeline health</span>
              <strong className="dash-overview-stat-value">{dashboard.avgPipelinePct ?? 0}%</strong>
              <span className="dash-overview-stat-hint">Avg. progress across batches</span>
            </div>
            <div className="dash-overview-ring-wrap">
              <svg className="dash-overview-ring" viewBox="0 0 36 36" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
                <path
                  className="dash-overview-ring-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="dash-overview-ring-fg"
                  strokeDasharray={`${Math.min(dashboard.completionRate ?? 0, 100)}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="dash-overview-ring-label">
                <span>Final filing</span>
                <strong>{dashboard.completionRate ?? 0}%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {dashboard.insights?.length > 0 && (
        <div className="dash-insights-row" role="status">
          {dashboard.insights.map((ins, i) => (
            <div key={i} className={`dash-insight-chip dash-insight-chip--${ins.type}`}>
              <span className="dash-insight-chip-icon" aria-hidden="true">
                {ins.type === "warning" ? "!" : ins.type === "positive" ? "✓" : ins.type === "info" ? "i" : "•"}
              </span>
              <p>{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="dash-stats-row">
        <div className="dash-stat-card">
          <span className="dash-stat-label">Employees</span>
          <strong>{dashboard.employees}</strong>
          <span className="dash-stat-hint">
            {dashboard.employeesByType?.fullTime ?? 0} full-time · {dashboard.employeesByType?.partTime ?? 0} part-time
          </span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">Tasks</span>
          <strong>{dashboard.tasks?.total ?? 0}</strong>
          <span className="dash-stat-hint">
            {dashboard.tasks?.completed ?? 0} completed · {dashboard.tasks?.inProgress ?? 0} in progress
          </span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">OB slips (today)</span>
          <strong>{dashboard.todayOBSlips}</strong>
          <span className="dash-stat-hint">{dashboard.weekOBSlips ?? 0} in the last 7 days</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">Events + Holidays (today)</span>
          <strong>{dashboard.todayEvents}</strong>
          <span className="dash-stat-hint">{dashboard.weekEvents ?? 0} this week total</span>
        </div>
      </div>

      <div className="dash-main-grid">
        <article className="panel dash-cal-panel">
          <div className="dash-cal-head">
            <button type="button" className="dash-cal-nav" onClick={goPrevMonth} aria-label="Previous month">
              ‹
            </button>
            <div className="dash-cal-title">
              <h3>{monthLabel}</h3>
              <button type="button" className="btn-text dash-cal-today" onClick={goToday}>
                Today
              </button>
            </div>
            <button type="button" className="dash-cal-nav" onClick={goNextMonth} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="dash-cal-weekdays">
            {dowLabels.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <p className="dash-cal-legend-note">
            Dots: <span className="dash-cal-legend-i dash-cal-legend-i--holiday" /> PH holiday ·{" "}
            <span className="dash-cal-legend-i dash-cal-legend-i--birthday" /> birthday ·{" "}
            <span className="dash-cal-legend-i dash-cal-legend-i--event" /> event
          </p>
          <div className="dash-cal-grid">
            {calendarCells.map((cell, i) =>
              cell.type === "pad" ? (
                <div key={`pad-${i}`} className="dash-cal-cell dash-cal-cell--empty" />
              ) : (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={`dash-cal-cell ${cell.dateStr === todayYmd ? "dash-cal-cell--today" : ""} ${
                    cell.dateStr === selectedDate ? "dash-cal-cell--selected" : ""
                  }`}
                  onClick={() => setSelectedDate(cell.dateStr)}
                >
                  <span className="dash-cal-daynum">{cell.day}</span>
                  <span className="cal-app-dots dash-cal-dots-slot" aria-hidden="true">
                    {(holidaysByDate[cell.dateStr]?.length || 0) > 0 && (
                      <span className="cal-dot cal-dot--holiday" />
                    )}
                    {(birthdaysByDate[cell.dateStr]?.length || 0) > 0 && (
                      <span className="cal-dot cal-dot--birthday" />
                    )}
                    {(eventsByDate[cell.dateStr]?.length || 0) > 0 && (
                      <span className="cal-dot cal-dot--event" />
                    )}
                  </span>
                </button>
              )
            )}
          </div>
        </article>

        <div className="dash-data-col">
          <article className="panel dash-panel-day">
            <h3 className="dash-panel-day-title">{dayjs(selectedDate).format("MMM D, YYYY")}</h3>
            <div className="dash-day-scroll" ref={dayScrollRef}>
              {selectedDayHolidays.length > 0 && (
                <div className="dash-day-section">
                  <h4 className="dash-day-section-title">Philippines holidays</h4>
                  <ul className="dash-day-events dash-day-events--tight">
                    {selectedDayHolidays.map((h, idx) => (
                      <li key={`${h.date}-${h.name}-${idx}`}>
                        <strong>{h.name}</strong>
                        <span>{h.type === "bank" ? "PH bank" : "PH public"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDayBirthdays.length > 0 && (
                <div className="dash-day-section">
                  <h4 className="dash-day-section-title">Staff birthdays</h4>
                  <ul className="dash-day-events dash-day-events--tight">
                    {selectedDayBirthdays.map((b) => (
                      <li key={b.id}>
                        <strong>{b.name}</strong>
                        <span>Birthday</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDayEvents.length > 0 && (
                <div className="dash-day-section">
                  <h4 className="dash-day-section-title">Events</h4>
                  <ul className="dash-day-events">
                    {selectedDayEvents.map((ev) => (
                      <li key={ev.id}>
                        <strong>{ev.title}</strong>
                        <span>
                          {ev.time}
                          {ev.description ? ` · ${ev.description}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDayHolidays.length === 0 &&
                selectedDayBirthdays.length === 0 &&
                selectedDayEvents.length === 0 && (
                  <div className="dash-day-section">
                    <p className="dash-muted">No Philippines holidays, staff birthdays, or events on this day.</p>
                    {upcomingFallback.length > 0 ? (
                      <>
                        <h4 className="dash-day-section-title">Upcoming events</h4>
                        <ul className="dash-day-events dash-day-events--tight">
                          {upcomingFallback.map((ev) => (
                            <li key={`upcoming-${ev.id}`}>
                              <strong>{ev.title}</strong>
                              <span>
                                {ev.date}
                                {ev.time ? ` · ${ev.time}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                )}
            </div>

            <button type="button" className="btn-text dash-link-calendar" onClick={() => onNavigate("Event")}>
              Open full calendar →
            </button>
          </article>

          <article className="panel dash-panel-recent">
            <div className="panel-head">
              <h3>Recent tasks</h3>
              <input
                className="dash-search"
                placeholder="Search tasks…"
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
              />
            </div>
            <div className="dash-recent-scroll" ref={recentScrollRef}>
              <div className="table dash-recent-table">
                {dashboardRecent.length === 0 ? (
                  <p className="dash-muted">No tasks match your search.</p>
                ) : (
                  dashboardRecent.map((t) => (
                    <div
                      key={t.id}
                      className="list-item list-item--click"
                      role="button"
                      tabIndex={0}
                      onClick={() => onNavigate("Task Tracker")}
                      onKeyDown={(e) => e.key === "Enter" && onNavigate("Task Tracker")}
                    >
                      <div className="list-main">
                        <strong>{t.title}</strong>
                        <small>{`${t.dateFrom || t.batchDate || "—"} → ${t.dateTo || t.batchDate || "—"}`}</small>
                      </div>
                      <div className="list-meta">
                        <span className="status-pill">{t.status || "In Progress"}</span>
                        <span className="list-arrow">›</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
