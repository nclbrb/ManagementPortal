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
  taskLogs = [],
  taskItems = [],
  taskStages = [],
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
  const [pipelineRange, setPipelineRange] = useState("monthly");
  const [hoveredStage, setHoveredStage] = useState(null);
  const canDeriveTaskStageStats = Array.isArray(taskStages) && taskStages.length > 0 && Array.isArray(taskItems);
  const derivedTasksByStage = useMemo(() => {
    if (!canDeriveTaskStageStats) return [];
    const counts = new Map(taskStages.map((_, idx) => [idx, 0]));
    for (const task of taskItems) {
      const stageIndex = Number(task?.currentStage);
      if (!Number.isInteger(stageIndex) || !counts.has(stageIndex)) continue;
      counts.set(stageIndex, (counts.get(stageIndex) || 0) + 1);
    }
    const total = taskItems.length || 1;
    return taskStages.map((label, stageIndex) => {
      const count = counts.get(stageIndex) || 0;
      return {
        stageIndex,
        label: String(label || `Stage ${stageIndex + 1}`),
        count,
        pct: Math.round((count / total) * 1000) / 10,
      };
    });
  }, [canDeriveTaskStageStats, taskItems, taskStages]);
  const pipelineBaseRows = useMemo(
    () => (canDeriveTaskStageStats ? derivedTasksByStage : dashboard.tasksByStage || []),
    [canDeriveTaskStageStats, derivedTasksByStage, dashboard.tasksByStage]
  );
  const taskKpis = useMemo(() => {
    if (!canDeriveTaskStageStats) {
      return {
        total: dashboard.tasks?.total ?? 0,
        inProgress: dashboard.tasks?.inProgress ?? 0,
        completed: (dashboard.tasksByStage || []).slice(-1)[0]?.count || 0,
      };
    }
    const total = taskItems.length;
    const finalStageIdx = Math.max(taskStages.length - 1, 0);
    const completed = taskItems.filter((t) => Number(t?.currentStage) === finalStageIdx).length;
    const inProgress = Math.max(total - completed, 0);
    return { total, inProgress, completed };
  }, [canDeriveTaskStageStats, dashboard.tasks, dashboard.tasksByStage, taskItems, taskStages.length]);
  const pipelineRows = useMemo(() => {
    if (!Array.isArray(taskItems) || taskItems.length === 0) {
      return pipelineBaseRows.map((row) => ({ ...row, count: 0, pct: 0 }));
    }
    const nowTs = Date.now();
    const msByRange = {
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      yearly: 365 * 24 * 60 * 60 * 1000,
    };
    const cutoff = nowTs - (msByRange[pipelineRange] || msByRange.monthly);
    const counts = new Map(pipelineBaseRows.map((r) => [r.stageIndex, 0]));
    for (const task of taskItems) {
      const latestUpdate = Array.isArray(task?.updates) && task.updates.length > 0 ? task.updates[task.updates.length - 1] : null;
      const activityTs = Date.parse(latestUpdate?.at || task?.batchDate || "");
      if (!Number.isFinite(activityTs) || activityTs < cutoff) continue;
      const currentStage = Number(task?.currentStage);
      if (!Number.isInteger(currentStage) || !counts.has(currentStage)) continue;
      counts.set(currentStage, (counts.get(currentStage) || 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
    return pipelineBaseRows.map((r) => {
      const c = counts.get(r.stageIndex) || 0;
      return { ...r, count: c, pct: Math.round((c / total) * 1000) / 10 };
    });
  }, [pipelineBaseRows, pipelineRange, taskItems]);
  const currentStageCounts = useMemo(() => new Map(pipelineBaseRows.map((r) => [r.stageIndex, Number(r.count || 0)])), [pipelineBaseRows]);
  const pipelineMax = Math.max(1, ...pipelineRows.map((r) => Number(r.count || 0)));
  const busiestStage = useMemo(() => {
    // Busiest should reflect current live task distribution, not historical logs.
    const best = pipelineBaseRows.reduce((acc, row) => (row.count > (acc?.count ?? -1) ? row : acc), null);
    return best && Number(best.count || 0) > 0 ? best : null;
  }, [pipelineBaseRows]);
  const currentCompleted = taskKpis.completed;

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
          <span className="dash-stat-label">Task batches</span>
          <strong>{dashboard.tasks?.total ?? 0}</strong>
          <span className="dash-stat-hint">
            {dashboard.tasks?.completed ?? 0} filed · {dashboard.tasks?.inProgress ?? 0} in progress
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
              <h3>Recent batches</h3>
              <input
                className="dash-search"
                placeholder="Search batches…"
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
              />
            </div>
            <div className="dash-recent-scroll" ref={recentScrollRef}>
              <div className="table dash-recent-table">
                {dashboardRecent.length === 0 ? (
                  <p className="dash-muted">No batches match your search.</p>
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
                        <small>{`Batch date: ${t.batchDate}`}</small>
                      </div>
                      <div className="list-meta">
                        <span className="status-pill">{`Stage ${t.currentStage}`}</span>
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

      <article className="panel dash-stage-panel">
        <div className="panel-head">
          <h3>Task Chart</h3>
          <label className="dash-pipe-filter-wrap">
            <span>Range</span>
            <select value={pipelineRange} onChange={(e) => setPipelineRange(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>
        <div className="dash-pipe-kpis">
          <span>Total: <strong>{taskKpis.total}</strong></span>
          <span>In Progress: <strong>{taskKpis.inProgress}</strong></span>
          <span>Completed: <strong>{currentCompleted}</strong></span>
          <span>Busiest: <strong>{busiestStage ? `${busiestStage.label} (${busiestStage.count})` : "N/A"}</strong></span>
        </div>
        <div className="dash-pipe-chart">
          <div className="dash-pipe-axis">
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>
          <div className="dash-pipe-bars">
            {pipelineRows.map((row, idx) => {
              const h = Math.max(8, Math.round((Number(row.count || 0) / pipelineMax) * 100));
              const hue = 198 + idx * 24;
              return (
                <div key={row.stageIndex} className="dash-pipe-col" title={`${row.label}: ${row.count}`}>
                  <div className="dash-pipe-bar-wrap">
                    <span
                      className={`dash-pipe-bar ${hoveredStage === row.stageIndex ? "is-hovered" : ""}`}
                      style={{ height: `${h}%`, background: `hsl(${hue} 78% 48%)` }}
                      onMouseEnter={() => setHoveredStage(row.stageIndex)}
                      onMouseLeave={() => setHoveredStage(null)}
                    />
                  </div>
                  <small>{idx + 1}</small>
                </div>
              );
            })}
          </div>
          <p className="dash-pipe-note">Stages 1-{pipelineRows.length} (hover bars for details)</p>
          <div className="dash-pipe-hover">
            {hoveredStage == null ? (
              <span>Hover a bar to see stage details.</span>
            ) : (
              (() => {
                const row = pipelineRows.find((x) => x.stageIndex === hoveredStage);
                return row ? (
                  <span>
                    <strong>{row.label}</strong> • {currentStageCounts.get(row.stageIndex) || 0} batch(es) currently in this stage
                  </span>
                ) : (
                  <span>Hover a bar to see stage details.</span>
                );
              })()
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
