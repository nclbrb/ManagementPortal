import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import dayjs from "dayjs";
import { SOCKET_URL, apiUrl } from "./apiConfig.js";

async function jsonFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Printable OB slip — layout tuned for A4 / letter and browser print dialog */
function buildObSlipPrintHtml(slip) {
  const date = escapeHtml(slip.date);
  const name = escapeHtml(slip.name);
  const position = escapeHtml(slip.position);
  const department = escapeHtml(slip.department);
  const purpose = escapeHtml(slip.purpose);
  const timeIn = escapeHtml(slip.timeIn);
  const timeOut = escapeHtml(slip.timeOut);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OB Slip - ${name}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 14mm 12mm; size: auto; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #142a44;
      background: #e8eef5;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      padding: 20px 16px 32px;
      background: #e8eef5;
    }
    .card {
      background: #fff;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 2px 16px rgba(15, 56, 111, 0.12);
      border: 1px solid #c5d4e8;
    }
    .masthead {
      background: linear-gradient(135deg, #0c2d5c 0%, #154a8a 52%, #1a5ba3 100%);
      color: #f0f6ff;
      padding: 18px 22px 20px;
      text-align: center;
    }
    .masthead-badge {
      display: inline-block;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      opacity: 0.92;
      margin-bottom: 6px;
    }
    .masthead h1 {
      margin: 0;
      font-size: 17pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .masthead-sub {
      margin: 8px 0 0;
      font-size: 9.5pt;
      opacity: 0.9;
      font-weight: 500;
    }
    .doc-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 22px;
      background: #f4f8fd;
      border-bottom: 1px solid #d7e2f0;
      font-size: 9.5pt;
      color: #3d5a78;
    }
    .doc-meta strong { color: #0f2844; font-weight: 700; }
    .fields { padding: 6px 0 8px; }
    .field-row {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 0 16px;
      border-bottom: 1px solid #e8eef5;
      min-height: 44px;
      align-items: stretch;
    }
    .field-row:last-of-type { border-bottom: none; }
    .field-label {
      padding: 12px 22px;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #5a7394;
      background: #fafcfe;
      border-right: 1px solid #e8eef5;
    }
    .field-value {
      padding: 12px 22px;
      font-size: 11pt;
      color: #142a44;
      word-break: break-word;
    }
    .field-value--block { white-space: pre-wrap; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      padding: 20px 22px 24px;
      border-top: 1px dashed #c5d4e8;
      margin-top: 4px;
    }
    .sig-line {
      border-top: 1px solid #1a3d66;
      padding-top: 8px;
      margin-top: 40px;
      font-size: 9pt;
      color: #5a7394;
      text-align: center;
    }
    .footer-note {
      text-align: center;
      padding: 12px 22px 18px;
      font-size: 8.5pt;
      color: #6d819d;
      background: #f8fafc;
      border-top: 1px solid #e8eef5;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="card">
      <header class="masthead">
        <div class="masthead-badge">Official document</div>
        <h1>Official Business Slip</h1>
        <p class="masthead-sub">Commission on Elections, Management Portal</p>
      </header>
      <div class="doc-meta">
        <span><strong>Date of travel / business:</strong> ${date}</span>
        <span><strong>Department:</strong> ${department}</span>
      </div>
      <div class="fields">
        <div class="field-row">
          <div class="field-label">Name</div>
          <div class="field-value">${name}</div>
        </div>
        <div class="field-row">
          <div class="field-label">Position</div>
          <div class="field-value">${position}</div>
        </div>
        <div class="field-row">
          <div class="field-label">Purpose</div>
          <div class="field-value field-value--block">${purpose}</div>
        </div>
        <div class="field-row">
          <div class="field-label">Time in</div>
          <div class="field-value">${timeIn}</div>
        </div>
        <div class="field-row">
          <div class="field-label">Time out</div>
          <div class="field-value">${timeOut}</div>
        </div>
      </div>
      <div class="signatures">
        <div>
          <div class="sig-line">Employee signature &amp; date</div>
        </div>
        <div>
          <div class="sig-line">Authorized approving officer</div>
        </div>
      </div>
      <p class="footer-note">Generated from COMELEC Management Portal. This slip is subject to internal policies and verification.</p>
    </div>
  </div>
</body>
</html>`;
}
const tabs = ["Dashboard", "Task Tracker", "OB Slip", "Calendar", "Employees"];
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  width: "16",
  height: "16",
};
const tabIcons = {
  Dashboard: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="5" />
      <rect x="13" y="10" width="8" height="11" />
      <rect x="3" y="13" width="8" height="8" />
    </svg>
  ),
  "Task Tracker": (
    <svg {...iconProps}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="18" r="1.5" />
    </svg>
  ),
  "OB Slip": (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  ),
  Calendar: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2.5" x2="8" y2="6" />
      <line x1="16" y1="2.5" x2="16" y2="6" />
    </svg>
  ),
  Employees: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M14.5 19c.2-2 1.8-3.5 4.2-3.9" />
    </svg>
  ),
};

function DashboardSection({ dashboard, dashboardSearch, setDashboardSearch, dashboardRecent, events, onNavigate }) {
  const todayYmd = dayjs().format("YYYY-MM-DD");
  const [viewMonth, setViewMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [selectedDate, setSelectedDate] = useState(todayYmd);

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

  const selectedDayEvents = eventsByDate[selectedDate] || [];

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

  return (
    <section className="dash-simple">
      <div className="dash-overview">
        <div className="dash-overview-bg" aria-hidden="true" />
        <div className="dash-overview-inner">
          <div className="dash-overview-main">
            <span className="dash-kicker">Operations overview</span>
            <h2 className="dash-overview-title">
              {greeting}, <span className="dash-overview-accent">COMELEC</span> workspace
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
          <span className="dash-stat-label">Events (today)</span>
          <strong>{dashboard.todayEvents}</strong>
          <span className="dash-stat-hint">{dashboard.weekEvents ?? 0} this week</span>
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
                  {(eventsByDate[cell.dateStr]?.length || 0) > 0 && (
                    <span className="dash-cal-dots" aria-hidden="true">
                      {(eventsByDate[cell.dateStr] || []).slice(0, 3).map((_, j) => (
                        <span key={j} className="dash-cal-dot" />
                      ))}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </article>

        <div className="dash-data-col">
          <article className="panel dash-panel-day">
            <h3 className="dash-panel-day-title">Events on {dayjs(selectedDate).format("MMM D, YYYY")}</h3>
            {selectedDayEvents.length === 0 ? (
              <p className="dash-muted">No events on this day. Use the Calendar tab to add one.</p>
            ) : (
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
            )}
            <button type="button" className="btn-text dash-link-calendar" onClick={() => onNavigate("Calendar")}>
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
            <div className="dash-recent-scroll">
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
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [tasksData, setTasksData] = useState({ stages: [], items: [], logs: [] });
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [obSlips, setObSlips] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [modalType, setModalType] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskPage, setTaskPage] = useState("list");
  const [taskProgress, setTaskProgress] = useState({ staff: "", note: "", stage: 1 });
  const [newTask, setNewTask] = useState({
    title: dayjs().format("YYYY-MM-DD"),
    assignedStaff: "",
    note: "",
    batchDate: dayjs().format("YYYY-MM-DD"),
  });
  const [newEmployee, setNewEmployee] = useState({ name: "", position: "", type: "full-time", department: "COMELEC" });
  const [newEvent, setNewEvent] = useState({ title: "", date: dayjs().format("YYYY-MM-DD"), time: "09:00", description: "" });
  const [newSlip, setNewSlip] = useState({
    date: dayjs().format("YYYY-MM-DD"),
    name: "",
    position: "",
    department: "COMELEC",
    purpose: "",
    timeIn: "08:00",
    timeOut: "17:00",
  });
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStageFilter, setTaskStageFilter] = useState("all");
  const [taskDateFilter, setTaskDateFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskError, setTaskError] = useState("");
  const [taskModalError, setTaskModalError] = useState("");
  const [obSearch, setObSearch] = useState("");
  const [obDateFilter, setObDateFilter] = useState("all");
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [backendOffline, setBackendOffline] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingObId, setEditingObId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [showFinalStepConfirm, setShowFinalStepConfirm] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const closeNav = () => setNavOpen(false);
    mq.addEventListener("change", closeNav);
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      mq.removeEventListener("change", closeNav);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const loadAll = async () => {
    try {
      const [d, t, e, c, o] = await Promise.all([
        jsonFetch(apiUrl("/dashboard")),
        jsonFetch(apiUrl("/tasks")),
        jsonFetch(apiUrl("/employees")),
        jsonFetch(apiUrl("/events")),
        jsonFetch(apiUrl("/ob-slips")),
      ]);
      setDashboard(d);
      setTasksData(t);
      setEmployees(e);
      setEvents(c);
      setObSlips(o);
      setBackendOffline(false);
    } catch {
      setBackendOffline(true);
      setDashboard(null);
      setTasksData({ stages: [], items: [], logs: [] });
      setEmployees([]);
      setEvents([]);
      setObSlips([]);
    }
  };

  useEffect(() => {
    loadAll();
    const socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
    });
    socket.on("connect", () => setBackendOffline(false));
    socket.on("connect_error", () => setBackendOffline(true));
    socket.on("realtime:update", (payload) => {
      setDashboard(payload.dashboard);
      setTasksData((prev) => ({ ...prev, items: payload.tasks }));
      setEmployees(payload.employees);
      setEvents(payload.events);
      setObSlips(payload.obSlips);
    });
    return () => socket.disconnect();
  }, []);

  const postData = async (path, body) => {
    const r = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `HTTP ${r.status}`);
    }
    return r.json();
  };

  const patchData = async (path, body) => {
    const r = await fetch(apiUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `HTTP ${r.status}`);
    }
    return r.json();
  };

  const deleteData = async (path) => {
    const r = await fetch(apiUrl(path), { method: "DELETE" });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `HTTP ${r.status}`);
    }
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };

  const closeModal = () => {
    setModalType("");
    setEditingTaskId(null);
    setEditingObId(null);
    setEditingEventId(null);
    setEditingEmployeeId(null);
    setTaskModalError("");
  };

  const submitTaskAdvance = () => {
    if (!selectedTask) return;
    const targetStage = Number(taskProgress.stage);
    const finalStageIndex = tasksData.stages.length - 1;
    if (targetStage === finalStageIndex && selectedTask.currentStage < finalStageIndex) {
      setShowFinalStepConfirm(true);
      return;
    }
    advanceTask(selectedTask.id);
  };

  const filteredEmployees = useMemo(
    () =>
      (employeeFilter === "all" ? employees : employees.filter((e) => e.type === employeeFilter)).filter((e) =>
        `${e.name} ${e.position}`.toLowerCase().includes(employeeSearch.toLowerCase())
      ),
    [employees, employeeFilter, employeeSearch]
  );

  const selectedTask = useMemo(
    () => tasksData.items.find((task) => task.id === selectedTaskId) || null,
    [tasksData.items, selectedTaskId]
  );

  const selectedTaskProgressPct = useMemo(() => {
    if (!selectedTask || !tasksData.stages.length) return 0;
    return Math.round(((selectedTask.currentStage + 1) / tasksData.stages.length) * 100);
  }, [selectedTask, tasksData.stages.length]);

  const selectedTaskUpdates = useMemo(() => {
    if (!selectedTask?.updates) return [];
    return [...selectedTask.updates].sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [selectedTask]);

  const filteredTasks = useMemo(() => {
    return tasksData.items.filter((task) => {
      const textPass = `${task.title} ${task.batchDate}`.toLowerCase().includes(taskSearch.toLowerCase());
      const stagePass = taskStageFilter === "all" || String(task.currentStage) === taskStageFilter;
      const datePass = !taskDateFilter || task.batchDate === taskDateFilter;
      const status =
        task.currentStage === tasksData.stages.length - 1
          ? "completed"
          : task.currentStage === 0
          ? "pending"
          : "in-progress";
      const statusPass = taskStatusFilter === "all" || taskStatusFilter === status;
      return textPass && stagePass && datePass && statusPass;
    });
  }, [tasksData.items, taskSearch, taskStageFilter, taskDateFilter, taskStatusFilter, tasksData.stages.length]);

  const taskSummary = useMemo(() => {
    const total = tasksData.items.length;
    const completed = tasksData.items.filter((t) => t.currentStage === tasksData.stages.length - 1).length;
    const pending = tasksData.items.filter((t) => t.currentStage === 0).length;
    const inProgress = Math.max(total - completed - pending, 0);
    return { total, pending, inProgress, completed };
  }, [tasksData.items, tasksData.stages.length]);

  const filteredObSlips = useMemo(() => {
    return obSlips.filter((s) => {
      const textPass = `${s.name} ${s.purpose} ${s.position}`.toLowerCase().includes(obSearch.toLowerCase());
      const datePass = obDateFilter === "all" || (obDateFilter === "today" && s.date === dayjs().format("YYYY-MM-DD"));
      return textPass && datePass;
    });
  }, [obSlips, obSearch, obDateFilter]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const textPass = `${ev.title} ${ev.description}`.toLowerCase().includes(eventSearch.toLowerCase());
      const today = dayjs().format("YYYY-MM-DD");
      const filterPass =
        eventFilter === "all" ||
        (eventFilter === "today" && ev.date === today) ||
        (eventFilter === "upcoming" && ev.date >= today);
      return textPass && filterPass;
    });
  }, [events, eventSearch, eventFilter]);

  const obSlipSummary = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
    const weekEnd = dayjs().endOf("week").format("YYYY-MM-DD");
    const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");
    const monthEnd = dayjs().endOf("month").format("YYYY-MM-DD");
    const total = obSlips.length;
    const todayCount = obSlips.filter((s) => s.date === today).length;
    const thisWeek = obSlips.filter((s) => s.date >= weekStart && s.date <= weekEnd).length;
    const thisMonth = obSlips.filter((s) => s.date >= monthStart && s.date <= monthEnd).length;
    return { total, today: todayCount, thisWeek, thisMonth };
  }, [obSlips]);

  const eventSummary = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const total = events.length;
    const todayCount = events.filter((e) => e.date === today).length;
    const upcoming = events.filter((e) => e.date > today).length;
    const past = events.filter((e) => e.date < today).length;
    return { total, today: todayCount, upcoming, past };
  }, [events]);

  const employeeSummary = useMemo(() => {
    const total = employees.length;
    const fullTime = employees.filter((e) => e.type === "full-time").length;
    const partTime = employees.filter((e) => e.type === "part-time").length;
    const departments = new Set(employees.map((e) => e.department || "COMELEC")).size;
    return { total, fullTime, partTime, departments };
  }, [employees]);

  const dashboardRecent = useMemo(() => {
    const tasks = dashboard?.recentTasks || [];
    return tasks.filter((t) => t.title.toLowerCase().includes(dashboardSearch.toLowerCase()));
  }, [dashboard, dashboardSearch]);

  const advanceTask = async (taskId) => {
    try {
      const response = await fetch(apiUrl(`/tasks/${taskId}/stage`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: Number(taskProgress.stage),
          assignedStaff: taskProgress.staff || "Assigned Staff",
          note: taskProgress.note,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTaskError(payload.error || "Unable to update task.");
        return;
      }
      setTaskError("");
      if (payload?.id) {
        setTasksData((prev) => ({
          ...prev,
          items: prev.items.map((t) => (t.id === payload.id ? payload : t)),
        }));
      }
      const nextStage = Math.min((payload?.currentStage ?? 0) + 1, Math.max((tasksData.stages?.length || 1) - 1, 0));
      setTaskProgress({ staff: "", note: "", stage: nextStage });
      setBackendOffline(false);
    } catch {
      setBackendOffline(true);
      setTaskError("Cannot reach backend. Start the API server and try again.");
    }
  };

  useEffect(() => {
    if (!selectedTask || taskPage !== "detail") return;
    const nextStage = Math.min(selectedTask.currentStage + 1, Math.max(tasksData.stages.length - 1, 0));
    setTaskProgress((prev) => ({
      ...prev,
      stage: nextStage,
    }));
  }, [selectedTask?.id, selectedTask?.currentStage, taskPage, tasksData.stages.length]);

  const importSlipExcel = async (file) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(apiUrl("/ob-slips/import-excel"), { method: "POST", body: form });
      if (!r.ok) throw new Error("Import failed");
      await loadAll();
    } catch {
      setBackendOffline(true);
    }
  };

  const printSlip = (slip) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(buildObSlipPrintHtml(slip));
    win.document.close();
    win.focus();
    win.print();
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setNavOpen(false);
  };

  return (
    <div className={`layout modern${navOpen ? " nav-open" : ""}`}>
      <button
        type="button"
        className="nav-toggle"
        aria-label={navOpen ? "Close menu" : "Open menu"}
        aria-expanded={navOpen}
        onClick={() => setNavOpen((o) => !o)}
      >
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
      </button>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          <h1>COMELEC</h1>
          <p>Commission on Elections Management Portal</p>
          <button type="button" className="sidebar-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            ×
          </button>
        </div>
        <nav className="side-nav">
          {tabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => selectTab(tab)}>
              <span className="nav-icon">{tabIcons[tab]}</span>
              <span>{tab}</span>
            </button>
          ))}
        </nav>
        <div className="live-pill">v1.0</div>
      </aside>

      <main className="content">
        {activeTab === "Dashboard" && (
          <header className="page-header page-header--dashboard">
            <span className="task-tracker-eyebrow">Overview</span>
            <h2 className="task-tracker-title">Dashboard</h2>
          </header>
        )}

        {backendOffline && (
          <div className="backend-banner" role="alert">
            <strong>Backend not reachable.</strong> Start the API: open a terminal in <code>backend</code> and run{" "}
            <code>npm run dev</code> (or <code>npm start</code>), then refresh this page.
            <button type="button" className="banner-retry" onClick={() => loadAll()}>
              Retry
            </button>
          </div>
        )}

        {activeTab === "Dashboard" && dashboard && (
          <DashboardSection
            dashboard={dashboard}
            dashboardSearch={dashboardSearch}
            setDashboardSearch={setDashboardSearch}
            dashboardRecent={dashboardRecent}
            events={events}
            onNavigate={selectTab}
          />
        )}

        {activeTab === "Task Tracker" && (
          <section className="tracker-layout single">
            {taskPage === "list" && (
              <div className="task-tracker-page task-tracker-page--stacked">
                <header className="task-tracker-intro">
                  <span className="task-tracker-eyebrow">Workflow</span>
                  <h2 className="task-tracker-title">Task Tracker</h2>
                  <p className="task-tracker-lede">
                    Monitor batch movement across each workflow step. Open a batch to advance it sequentially.
                  </p>
                </header>

                <div className="tracker-summary tracker-summary--row">
                  <article className="tracker-kpi">
                    <small>Total Batches</small>
                    <strong>{taskSummary.total}</strong>
                  </article>
                  <article className="tracker-kpi">
                    <small>Pending</small>
                    <strong>{taskSummary.pending}</strong>
                  </article>
                  <article className="tracker-kpi">
                    <small>In Progress</small>
                    <strong>{taskSummary.inProgress}</strong>
                  </article>
                  <article className="tracker-kpi">
                    <small>Completed</small>
                    <strong>{taskSummary.completed}</strong>
                  </article>
                </div>

                <div className="task-tracker-filters-card">
                  <div className="task-tracker-filters-label">Filter &amp; search</div>
                  <div className="task-tracker-toolbar">
                    <div className="inline-form task-tracker-filters">
                      <input placeholder="Search by title or date…" value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} />
                      <input type="date" value={taskDateFilter} onChange={(e) => setTaskDateFilter(e.target.value)} />
                      <select value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value)}>
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                      <select value={taskStageFilter} onChange={(e) => setTaskStageFilter(e.target.value)}>
                        <option value="all">All Stages</option>
                        {tasksData.stages.map((s, i) => (
                          <option key={s} value={String(i)}>{`${i}. ${s}`}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="task-tracker-add"
                      onClick={() => {
                        setEditingTaskId(null);
                        setNewTask({
                          title: dayjs().format("YYYY-MM-DD"),
                          assignedStaff: "",
                          note: "",
                          batchDate: dayjs().format("YYYY-MM-DD"),
                        });
                        setTaskModalError("");
                        setModalType("task");
                      }}
                    >
                      + Add batch
                    </button>
                  </div>
                </div>

                <article className="task-tracker-list-card">
                  <div className="task-tracker-list-heading">
                    <div>
                      <h3 className="task-tracker-list-title">Task list</h3>
                      <p className="task-tracker-list-sub">
                        {filteredTasks.length} batch{filteredTasks.length === 1 ? "" : "es"} match your filters
                      </p>
                    </div>
                  </div>
                  <div className="task-list task-list-scroll task-list-scroll--roomy">
                    {filteredTasks.length === 0 ? (
                      <div className="task-empty">No tasks match your current filters.</div>
                    ) : (
                      filteredTasks.map((task) => {
                        const progressPct = Math.round(((task.currentStage + 1) / tasksData.stages.length) * 100);
                        const status =
                          task.currentStage === tasksData.stages.length - 1
                            ? "Completed"
                            : task.currentStage === 0
                            ? "Pending"
                            : "In Progress";
                        const openTaskDetail = () => {
                          setSelectedTaskId(task.id);
                          setTaskPage("detail");
                          setTaskError("");
                          const nextStage = Math.min(task.currentStage + 1, tasksData.stages.length - 1);
                          setTaskProgress({ staff: "", note: "", stage: nextStage });
                        };
                        return (
                          <div
                            className="task-item list-item task-list-item"
                            role="button"
                            tabIndex={0}
                            key={task.id}
                            onClick={openTaskDetail}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openTaskDetail();
                              }
                            }}
                          >
                            <div className="list-main">
                              <strong>{task.title}</strong>
                              <small>{`Batch date: ${task.batchDate}`}</small>
                              <div className="task-progress-bar">
                                <span style={{ width: `${progressPct}%` }} />
                              </div>
                            </div>
                            <div className="list-meta list-meta--crud" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn-crud"
                                onClick={() => {
                                  setEditingTaskId(task.id);
                                  setNewTask({
                                    title: task.title,
                                    batchDate: task.batchDate,
                                    assignedStaff: "",
                                    note: "",
                                  });
                                  setTaskModalError("");
                                  setModalType("task");
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-crud btn-crud--danger"
                                onClick={async () => {
                                  if (!window.confirm("Delete this batch permanently?")) return;
                                  try {
                                    await deleteData(`/tasks/${task.id}`);
                                    if (selectedTaskId === task.id) {
                                      setSelectedTaskId(null);
                                      setTaskPage("list");
                                    }
                                    await loadAll();
                                  } catch {
                                    setBackendOffline(true);
                                  }
                                }}
                              >
                                Delete
                              </button>
                              <span className="status-pill">{status}</span>
                              <small>{`${progressPct}%`}</small>
                              <span className="list-arrow">›</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
            )}

            {taskPage === "detail" && selectedTask && (
              <article className="panel">
                <div className="panel-head panel-head--task-detail">
                  <h3>{selectedTask.title}</h3>
                  <div className="panel-head-actions">
                    <button
                      type="button"
                      className="btn-crud btn-crud--danger"
                      onClick={async () => {
                        if (!window.confirm("Delete this batch permanently?")) return;
                        try {
                          const id = selectedTask.id;
                          await deleteData(`/tasks/${id}`);
                          setSelectedTaskId(null);
                          setTaskPage("list");
                          await loadAll();
                        } catch {
                          setBackendOffline(true);
                        }
                      }}
                    >
                      Delete batch
                    </button>
                    <button type="button" onClick={() => setTaskPage("list")}>Back to Task List</button>
                  </div>
                </div>
                <div className="batch-details-card">
                  <div className="batch-details-head">
                    <h4>Batch details</h4>
                    <span className="status-pill">{`${selectedTaskProgressPct}% complete`}</span>
                  </div>
                  <div className="batch-details-grid">
                    <div>
                      <small>Batch date</small>
                      <strong>{selectedTask.batchDate}</strong>
                    </div>
                    <div>
                      <small>Current stage</small>
                      <strong>{tasksData.stages[selectedTask.currentStage] || "N/A"}</strong>
                    </div>
                    <div>
                      <small>Step position</small>
                      <strong>{`${selectedTask.currentStage + 1} of ${tasksData.stages.length}`}</strong>
                    </div>
                    <div>
                      <small>Last update</small>
                      <strong>{selectedTaskUpdates[0] ? dayjs(selectedTaskUpdates[0].at).format("MMM D, YYYY h:mm A") : "N/A"}</strong>
                    </div>
                  </div>
                </div>
                <div className="timeline horizontal-shipping">
                  {tasksData.stages.map((stage, index) => {
                    const state =
                      index < selectedTask.currentStage ? "done" : index === selectedTask.currentStage ? "current" : "pending";
                    return (
                      <div className={`shipping-step-h ${state}`} key={`${selectedTask.id}-${stage}`}>
                        <span className="shipping-bullet">{index + 1}</span>
                        <div className="shipping-content">
                          <p className="shipping-title">{stage}</p>
                          <small>{state === "done" ? "Completed" : state === "current" ? "In Progress" : "Waiting"}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitTaskAdvance();
                  }}
                >
                  <select
                    value={selectedTask.currentStage >= tasksData.stages.length - 1 ? "" : taskProgress.stage}
                    onChange={(e) => setTaskProgress({ ...taskProgress, stage: e.target.value })}
                  >
                    {tasksData.stages
                      .map((s, i) => ({ label: s, index: i }))
                      .filter(({ index }) => index === selectedTask.currentStage + 1 || (selectedTask.currentStage === 2 && index === 1))
                      .map(({ label, index }) => (
                        <option value={index} key={label}>{`${index}. ${label}`}</option>
                      ))}
                    {selectedTask.currentStage >= tasksData.stages.length - 1 && <option value="">Final stage reached</option>}
                  </select>
                  <input placeholder="Assign Staff" value={taskProgress.staff} onChange={(e) => setTaskProgress({ ...taskProgress, staff: e.target.value })} required />
                  <input placeholder="Note (optional)" value={taskProgress.note} onChange={(e) => setTaskProgress({ ...taskProgress, note: e.target.value })} />
                  <button
                    className={`apply-step-btn ${selectedTask.currentStage >= tasksData.stages.length - 1 ? "apply-step-btn--done" : ""}`}
                    disabled={selectedTask.currentStage >= tasksData.stages.length - 1}
                  >
                    {selectedTask.currentStage >= tasksData.stages.length - 1 ? "Batch Completed" : "Apply Sequential Update"}
                  </button>
                  {taskError && <small className="form-error">{taskError}</small>}
                </form>
                <section className="batch-logs">
                  <h4>Batch logs</h4>
                  {selectedTaskUpdates.length === 0 ? (
                    <p className="modal-hint">No log entries yet.</p>
                  ) : (
                    <div className="batch-logs-list">
                      {selectedTaskUpdates.map((u) => (
                        <article className="batch-log-item" key={`${selectedTask.id}-${u.at}-${u.stage}`}>
                          <div className="batch-log-head">
                            <strong>{tasksData.stages[u.stage] || `Stage ${u.stage}`}</strong>
                            <small>{dayjs(u.at).format("MMM D, YYYY h:mm A")}</small>
                          </div>
                          <p>{u.note || "No note provided."}</p>
                          <small>{`Assigned: ${u.assignedStaff || "Assigned Staff"}`}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            )}
          </section>
        )}

        {activeTab === "OB Slip" && (
          <section className="tracker-layout single">
            <div className="task-tracker-page task-tracker-page--stacked">
              <header className="task-tracker-intro">
                <span className="task-tracker-eyebrow">Documents</span>
                <h2 className="task-tracker-title">Official Business Slips</h2>
                <p className="task-tracker-lede">
                  Record and print OB slips for field work. Search slips, export or import Excel, and add new entries.
                </p>
              </header>

              <div className="tracker-summary tracker-summary--row">
                <article className="tracker-kpi">
                  <small>Total OB Slips</small>
                  <strong>{obSlipSummary.total}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Today</small>
                  <strong>{obSlipSummary.today}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>This week</small>
                  <strong>{obSlipSummary.thisWeek}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>This month</small>
                  <strong>{obSlipSummary.thisMonth}</strong>
                </article>
              </div>

              <div className="task-tracker-filters-card">
                <div className="task-tracker-filters-label">Filter &amp; search</div>
                <div className="task-tracker-toolbar task-tracker-toolbar--ob-slip">
                  <div className="inline-form task-tracker-filters">
                    <input placeholder="Search slip" value={obSearch} onChange={(e) => setObSearch(e.target.value)} />
                    <select value={obDateFilter} onChange={(e) => setObDateFilter(e.target.value)}>
                      <option value="all">All Dates</option>
                      <option value="today">Today</option>
                    </select>
                    <button
                      type="button"
                      className="ob-slip-action"
                      onClick={() => window.open(apiUrl("/ob-slips/export-excel"), "_blank")}
                    >
                      Export Excel
                    </button>
                    <label className="upload-btn ob-slip-action">
                      Import Excel
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => e.target.files?.[0] && importSlipExcel(e.target.files[0])}
                      />
                    </label>
                    <button
                      type="button"
                      className="task-tracker-add ob-slip-action"
                      onClick={() => {
                        setEditingObId(null);
                        setNewSlip({
                          date: dayjs().format("YYYY-MM-DD"),
                          name: "",
                          position: "",
                          department: "COMELEC",
                          purpose: "",
                          timeIn: "08:00",
                          timeOut: "17:00",
                        });
                        setModalType("ob");
                      }}
                    >
                      + Add Slip
                    </button>
                  </div>
                </div>
              </div>

              <article className="task-tracker-list-card">
                <div className="task-tracker-list-heading">
                  <div>
                    <h3 className="task-tracker-list-title">Slip queue</h3>
                    <p className="task-tracker-list-sub">
                      {filteredObSlips.length} slip{filteredObSlips.length === 1 ? "" : "s"} match your filters
                    </p>
                  </div>
                </div>
                <div className="table task-list-scroll task-list-scroll--roomy">
                  {filteredObSlips.map((s) => (
                    <div key={s.id} className="slip-card">
                      <div className="list-main">
                        <strong>{s.name}</strong>
                        <small>{`${s.position} • ${s.department} • ${s.date}`}</small>
                        <small>{`${s.purpose} (${s.timeIn}-${s.timeOut})`}</small>
                      </div>
                      <div className="list-meta list-meta--crud">
                        <button
                          type="button"
                          className="btn-crud"
                          onClick={() => {
                            setEditingObId(s.id);
                            setNewSlip({
                              date: s.date,
                              name: s.name,
                              position: s.position,
                              department: s.department || "COMELEC",
                              purpose: s.purpose,
                              timeIn: s.timeIn,
                              timeOut: s.timeOut,
                            });
                            setModalType("ob");
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-crud btn-crud--danger"
                          onClick={async () => {
                            if (!window.confirm("Delete this OB slip?")) return;
                            try {
                              await deleteData(`/ob-slips/${s.id}`);
                              await loadAll();
                            } catch {
                              setBackendOffline(true);
                            }
                          }}
                        >
                          Delete
                        </button>
                        <button type="button" onClick={() => printSlip(s)}>Print Slip</button>
                        <span className="list-arrow">›</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}

        {activeTab === "Calendar" && (
          <section className="tracker-layout single">
            <div className="task-tracker-page task-tracker-page--stacked">
              <header className="task-tracker-intro">
                <span className="task-tracker-eyebrow">Scheduling</span>
                <h2 className="task-tracker-title">Calendar &amp; events</h2>
                <p className="task-tracker-lede">
                  Track hearings, deadlines, and field activities. Filter by today or upcoming, or add a new event.
                </p>
              </header>

              <div className="tracker-summary tracker-summary--row">
                <article className="tracker-kpi">
                  <small>Total events</small>
                  <strong>{eventSummary.total}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Today</small>
                  <strong>{eventSummary.today}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Upcoming</small>
                  <strong>{eventSummary.upcoming}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Past</small>
                  <strong>{eventSummary.past}</strong>
                </article>
              </div>

              <div className="task-tracker-filters-card">
                <div className="task-tracker-filters-label">Filter &amp; search</div>
                <div className="task-tracker-toolbar">
                  <div className="inline-form task-tracker-filters">
                    <input placeholder="Search event" value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} />
                    <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
                      <option value="all">All</option>
                      <option value="today">Today</option>
                      <option value="upcoming">Upcoming</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="task-tracker-add"
                    onClick={() => {
                      setEditingEventId(null);
                      setNewEvent({ title: "", date: dayjs().format("YYYY-MM-DD"), time: "09:00", description: "" });
                      setModalType("event");
                    }}
                  >
                    + Add Event
                  </button>
                </div>
              </div>

              <article className="task-tracker-list-card">
                <div className="task-tracker-list-heading">
                  <div>
                    <h3 className="task-tracker-list-title">Event list</h3>
                    <p className="task-tracker-list-sub">
                      {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} match your filters
                    </p>
                  </div>
                </div>
                <div className="table task-list-scroll task-list-scroll--roomy">
                  {filteredEvents.map((ev) => (
                    <div key={ev.id} className="list-item">
                      <div className="list-main">
                        <strong>{ev.title}</strong>
                        <small>{`${ev.date} • ${ev.time}`}</small>
                        <small>{ev.description || "No description"}</small>
                      </div>
                      <div className="list-meta list-meta--crud">
                        <button
                          type="button"
                          className="btn-crud"
                          onClick={() => {
                            setEditingEventId(ev.id);
                            setNewEvent({
                              title: ev.title,
                              date: ev.date,
                              time: ev.time || "09:00",
                              description: ev.description || "",
                            });
                            setModalType("event");
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-crud btn-crud--danger"
                          onClick={async () => {
                            if (!window.confirm("Delete this event?")) return;
                            try {
                              await deleteData(`/events/${ev.id}`);
                              await loadAll();
                            } catch {
                              setBackendOffline(true);
                            }
                          }}
                        >
                          Delete
                        </button>
                        <span className="status-pill">Scheduled</span>
                        <span className="list-arrow">›</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}

        {activeTab === "Employees" && (
          <section className="tracker-layout single">
            <div className="task-tracker-page task-tracker-page--stacked">
              <header className="task-tracker-intro">
                <span className="task-tracker-eyebrow">Roster</span>
                <h2 className="task-tracker-title">Employees</h2>
                <p className="task-tracker-lede">
                  Manage COMELEC staff and assignments. Search by name or role, filter by employment type, and add new hires.
                </p>
              </header>

              <div className="tracker-summary tracker-summary--row">
                <article className="tracker-kpi">
                  <small>Total employees</small>
                  <strong>{employeeSummary.total}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Full-time</small>
                  <strong>{employeeSummary.fullTime}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Part-time</small>
                  <strong>{employeeSummary.partTime}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Departments</small>
                  <strong>{employeeSummary.departments}</strong>
                </article>
              </div>

              <div className="task-tracker-filters-card">
                <div className="task-tracker-filters-label">Filter &amp; search</div>
                <div className="task-tracker-toolbar">
                  <div className="inline-form task-tracker-filters">
                    <input placeholder="Search employee" value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} />
                    <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                      <option value="all">All Employees</option>
                      <option value="full-time">Full-Time</option>
                      <option value="part-time">Part-Time</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="task-tracker-add"
                    onClick={() => {
                      setEditingEmployeeId(null);
                      setNewEmployee({ name: "", position: "", type: "full-time", department: "COMELEC" });
                      setModalType("employee");
                    }}
                  >
                    + Add Employee
                  </button>
                </div>
              </div>

              <article className="task-tracker-list-card">
                <div className="task-tracker-list-heading">
                  <div>
                    <h3 className="task-tracker-list-title">Staff directory</h3>
                    <p className="task-tracker-list-sub">
                      {filteredEmployees.length} employee{filteredEmployees.length === 1 ? "" : "s"} match your filters
                    </p>
                  </div>
                </div>
                <div className="table task-list-scroll task-list-scroll--roomy">
                  {filteredEmployees.map((emp) => (
                    <div key={emp.id} className="list-item">
                      <div className="list-main">
                        <strong>{emp.name}</strong>
                        <small>{`${emp.position} • ${emp.department}`}</small>
                      </div>
                      <div className="list-meta list-meta--crud">
                        <button
                          type="button"
                          className="btn-crud"
                          onClick={() => {
                            setEditingEmployeeId(emp.id);
                            setNewEmployee({
                              name: emp.name,
                              position: emp.position,
                              type: emp.type,
                              department: emp.department || "COMELEC",
                            });
                            setModalType("employee");
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-crud btn-crud--danger"
                          onClick={async () => {
                            if (!window.confirm("Delete this employee?")) return;
                            try {
                              await deleteData(`/employees/${emp.id}`);
                              await loadAll();
                            } catch {
                              setBackendOffline(true);
                            }
                          }}
                        >
                          Delete
                        </button>
                        <span className="status-pill">{emp.type === "full-time" ? "Full-Time" : "Part-Time"}</span>
                        <span className="list-arrow">›</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}
      </main>

      {modalType === "task" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTaskId ? "Edit batch" : "Add batch"}</h3>
            <form
              className="modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingTaskId) {
                    await patchData(`/tasks/${editingTaskId}`, {
                      title: newTask.title,
                      batchDate: newTask.batchDate,
                    });
                  } else {
                    await postData("/tasks", newTask);
                  }
                  closeModal();
                  setNewTask({
                    title: dayjs().format("YYYY-MM-DD"),
                    assignedStaff: "",
                    note: "",
                    batchDate: dayjs().format("YYYY-MM-DD"),
                  });
                  await loadAll();
                } catch (err) {
                  const message = String(err?.message || "");
                  let userMessage = "Unable to save batch. Check title/date and try again.";
                  try {
                    const parsed = JSON.parse(message);
                    if (parsed?.error) userMessage = parsed.error;
                  } catch {
                    /* ignore non-JSON error payload */
                  }
                  setTaskModalError(userMessage);
                }
              }}
            >
              <label>Date (required)</label>
              <input type="date" value={newTask.batchDate} onChange={(e) => setNewTask({ ...newTask, batchDate: e.target.value })} required />
              <label>Title</label>
              <input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} required />
              {!editingTaskId && (
                <>
                  <label>Assigned Staff</label>
                  <input value={newTask.assignedStaff} onChange={(e) => setNewTask({ ...newTask, assignedStaff: e.target.value })} />
                  <label>Note</label>
                  <input value={newTask.note} onChange={(e) => setNewTask({ ...newTask, note: e.target.value })} />
                </>
              )}
              {editingTaskId && <p className="modal-hint">Stage updates stay on the batch detail view.</p>}
              {taskModalError && <p className="form-error">{taskModalError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>Cancel</button>
                <button type="submit">{editingTaskId ? "Save changes" : "Add batch"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFinalStepConfirm && selectedTask && (
        <div className="modal-backdrop" onClick={() => setShowFinalStepConfirm(false)}>
          <div className="modal final-submit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="final-submit-head">
              <span className="final-step-check" aria-hidden="true">✓</span>
              <div>
                <h3>Confirm final submission</h3>
                <p className="modal-hint">One last check before marking this batch as done.</p>
              </div>
            </div>
            <div className="final-submit-body">
              <p>
                Batch: <strong>{selectedTask.title}</strong>
              </p>
              <p>
                Target step: <strong>Final Filing</strong>
              </p>
            </div>
            <div className="modal-actions final-submit-actions">
              <button type="button" className="final-cancel-btn" onClick={() => setShowFinalStepConfirm(false)}>Cancel</button>
              <button
                type="button"
                className="final-submit-btn"
                onClick={() => {
                  setShowFinalStepConfirm(false);
                  advanceTask(selectedTask.id);
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {modalType === "ob" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingObId ? "Edit slip" : "Add slip"}</h3>
            <form
              className="modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingObId) {
                    await patchData(`/ob-slips/${editingObId}`, newSlip);
                  } else {
                    await postData("/ob-slips", newSlip);
                  }
                  closeModal();
                  setNewSlip({
                    date: dayjs().format("YYYY-MM-DD"),
                    name: "",
                    position: "",
                    department: "COMELEC",
                    purpose: "",
                    timeIn: "08:00",
                    timeOut: "17:00",
                  });
                  await loadAll();
                } catch {
                  setBackendOffline(true);
                }
              }}
            >
              <label>Date</label>
              <input type="date" value={newSlip.date} onChange={(e) => setNewSlip({ ...newSlip, date: e.target.value })} required />
              <label>Name</label>
              <input value={newSlip.name} onChange={(e) => setNewSlip({ ...newSlip, name: e.target.value })} required />
              <label>Position</label>
              <input value={newSlip.position} onChange={(e) => setNewSlip({ ...newSlip, position: e.target.value })} required />
              <label>Department</label>
              <input value={newSlip.department} onChange={(e) => setNewSlip({ ...newSlip, department: e.target.value })} />
              <label>Purpose</label>
              <input value={newSlip.purpose} onChange={(e) => setNewSlip({ ...newSlip, purpose: e.target.value })} required />
              <label>Time In</label>
              <input type="time" value={newSlip.timeIn} onChange={(e) => setNewSlip({ ...newSlip, timeIn: e.target.value })} />
              <label>Time Out</label>
              <input type="time" value={newSlip.timeOut} onChange={(e) => setNewSlip({ ...newSlip, timeOut: e.target.value })} />
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>Cancel</button>
                <button type="submit">{editingObId ? "Save changes" : "Save slip"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === "event" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEventId ? "Edit event" : "Add event"}</h3>
            <form
              className="modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingEventId) {
                    await patchData(`/events/${editingEventId}`, newEvent);
                  } else {
                    await postData("/events", newEvent);
                  }
                  closeModal();
                  setNewEvent({ title: "", date: dayjs().format("YYYY-MM-DD"), time: "09:00", description: "" });
                  await loadAll();
                } catch {
                  setBackendOffline(true);
                }
              }}
            >
              <label>Event Title</label>
              <input value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} required />
              <label>Date</label>
              <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} required />
              <label>Time</label>
              <input type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} />
              <label>Description</label>
              <input value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>Cancel</button>
                <button type="submit">{editingEventId ? "Save changes" : "Add event"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === "employee" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEmployeeId ? "Edit employee" : "Add employee"}</h3>
            <form
              className="modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingEmployeeId) {
                    await patchData(`/employees/${editingEmployeeId}`, newEmployee);
                  } else {
                    await postData("/employees", newEmployee);
                  }
                  closeModal();
                  setNewEmployee({ name: "", position: "", type: "full-time", department: "COMELEC" });
                  await loadAll();
                } catch {
                  setBackendOffline(true);
                }
              }}
            >
              <label>Full Name</label>
              <input value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} required />
              <label>Position</label>
              <input value={newEmployee.position} onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })} required />
              <label>Department</label>
              <input value={newEmployee.department} onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })} />
              <label>Employment Type</label>
              <select value={newEmployee.type} onChange={(e) => setNewEmployee({ ...newEmployee, type: e.target.value })}>
                <option value="full-time">Full-Time</option>
                <option value="part-time">Part-Time</option>
              </select>
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>Cancel</button>
                <button type="submit">{editingEmployeeId ? "Save changes" : "Add employee"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
