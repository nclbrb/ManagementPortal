import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import dayjs from "dayjs";
import { SOCKET_URL, apiUrl, AUTH_STORAGE_KEY, getAuthHeaders } from "./apiConfig.js";
import comelecLogo from "./assets/comelec.png";

async function jsonFetch(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
  });
  if (r.status === 401) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    throw new Error("UNAUTHORIZED");
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function AuthGate({ mode, setMode, email, setEmail, password, setPassword, name, setName, error, setError, busy, setBusy, onAuthed }) {
  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "Sign-in failed.");
        return;
      }
      onAuthed(data.user, data.token);
    } catch {
      setError("Cannot reach the server. Start the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "Sign-up failed.");
        return;
      }
      onAuthed(data.user, data.token);
    } catch {
      setError("Cannot reach the server. Start the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gate">
      <div className="auth-gate-shell">
        <aside className="auth-gate-brand">
          <div className="auth-gate-brand-logo" role="img" aria-label="COMELEC logo" />
          <p className="auth-gate-brand-tag">COMELEC • Republic of the Philippines</p>
          <h1>Management Portal</h1>
          <p className="auth-gate-brand-sub">Commission on Elections</p>
          <p className="auth-gate-brand-sub2">Staff and Operations System</p>
          <div className="auth-gate-brand-pills">
            <span>Tasks</span>
            <span>OB Slips</span>
            <span>Calendar</span>
          </div>
        </aside>

        <section className="auth-gate-card">
          <header className="auth-gate-head">
            <span className="auth-gate-badge">COMELEC ACCESS</span>
            <h2>{mode === "login" ? "Admin Login" : "Create Account"}</h2>
            <p className="auth-gate-subtitle">
              {mode === "login"
                ? "Please enter your credentials to access the COMELEC management dashboard."
                : "Set up your account credentials to start using the management portal."}
            </p>
          </header>

          {mode === "login" ? (
            <form className="auth-gate-form" onSubmit={submitLogin}>
              <label>
                Email Address
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Security Password
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {error ? <p className="form-error auth-gate-error">{error}</p> : null}
              <button type="submit" className="auth-gate-submit" disabled={busy}>
                {busy ? "Signing in..." : "Sign in to Console"}
              </button>
              <p className="auth-gate-switch">
                No account yet?{" "}
                <button type="button" onClick={() => { setMode("signup"); setError(""); }}>
                  Sign up
                </button>
              </p>
            </form>
          ) : (
            <form className="auth-gate-form" onSubmit={submitSignup}>
              <label>
                Display Name
                <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
              </label>
              <label>
                Email Address
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Security Password
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </label>
              <p className="auth-gate-hint">Password must be at least 6 characters.</p>
              {error ? <p className="form-error auth-gate-error">{error}</p> : null}
              <button type="submit" className="auth-gate-submit" disabled={busy}>
                {busy ? "Creating account..." : "Create Account"}
              </button>
              <p className="auth-gate-switch">
                Already have an account?{" "}
                <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                  Log in
                </button>
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function staffInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Printable OB slip — prints selected slips, 4 per page */
function buildObSlipPrintHtml(input) {
  const logoSrc = escapeHtml(comelecLogo);
  const slips = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const makeSlipMarkup = (slip) => {
    const date = escapeHtml(slip.date);
    const name = escapeHtml(slip.name);
    const position = escapeHtml(slip.position);
    const department = escapeHtml(slip.department || "COMELEC");
    const purpose = escapeHtml(slip.purpose);
    const timeIn = escapeHtml(slip.timeIn);
    const timeOut = escapeHtml(slip.timeOut);
    return `
      <section class="ob-slip">
        <header class="ob-head">
          <div class="ob-seal-wrap" aria-hidden="true"><img src="${logoSrc}" alt="COMELEC" /></div>
          <div class="ob-head-text">
            <p class="ob-line">Republic of the Philippines</p>
            <p class="ob-line ob-city">CITY OF CABUYAO</p>
            <p class="ob-line">Province of Laguna</p>
            <h1>Official Business Slip</h1>
          </div>
        </header>

        <div class="ob-body">
          <div class="ob-row"><span class="label">Date :</span><span class="line">${date}</span></div>
          <div class="ob-row"><span class="label">Name :</span><span class="line">${name}</span></div>
          <div class="ob-row"><span class="label">Position :</span><span class="line">${position}</span></div>
          <div class="ob-row"><span class="label">Department :</span><span class="line">${department}</span></div>
          <div class="ob-row ob-purpose"><span class="label">Purpose :</span><span class="line">${purpose}</span></div>
          <div class="ob-row ob-time">
            <span class="label">Time in :</span><span class="line">${timeIn}</span>
            <span class="label label-right">Time Out :</span><span class="line">${timeOut}</span>
          </div>

          <div class="ob-return">
            <span class="label">Will be back?</span>
            <span class="check-wrap">YES <span class="check"></span></span>
            <span class="check-wrap">NO <span class="check"></span></span>
          </div>

          <div class="ob-row"><span class="label">Received by :</span><span class="line">&nbsp;</span></div>
          <div class="ob-row"><span class="label">Approved by :</span><span class="line">&nbsp;</span></div>
          <div class="ob-row"><span class="label">Encoded by :</span><span class="line">&nbsp;</span></div>
        </div>

        <footer class="ob-foot">
          <div class="sig-name">ATTY. RALPH JIREH A. BARTOLOME</div>
          <div class="sig-role">Dept. Head's Signature</div>
        </footer>
      </section>`;
  };
  const pages = [];
  for (let i = 0; i < slips.length; i += 4) pages.push(slips.slice(i, i + 4));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OB Slip - ${name}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: Letter portrait; margin: 8mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      background: #fff;
      line-height: 1.25;
    }
    .print-page {
      width: 100%;
      min-height: calc(100vh - 1px);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 7mm;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    .ob-slip {
      border: 1.4px solid #000;
      padding: 7mm 6mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 0;
    }
    .ob-head {
      display: grid;
      grid-template-columns: 20mm 1fr;
      gap: 3mm;
      align-items: start;
      margin-bottom: 3mm;
    }
    .ob-seal-wrap {
      width: 18mm;
      height: 18mm;
      display: grid;
      place-items: center;
    }
    .ob-seal-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .ob-head-text { text-align: center; }
    .ob-line { margin: 0; font-size: 10px; font-weight: 700; }
    .ob-city { font-size: 12px; letter-spacing: 0.03em; }
    .ob-head h1 {
      margin: 3mm 0 0;
      font-size: 12px;
      font-weight: 700;
    }
    .ob-body { display: grid; gap: 2.2mm; margin-top: 1mm; }
    .ob-row {
      display: grid;
      grid-template-columns: 22mm 1fr;
      align-items: end;
      gap: 2mm;
      font-size: 10px;
    }
    .ob-row .label { font-weight: 700; }
    .line {
      border-bottom: 1px solid #000;
      min-height: 3.6mm;
      padding: 0 1mm 0.2mm;
      font-size: 10px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .ob-purpose .line {
      white-space: normal;
      min-height: 8mm;
      line-height: 1.2;
      display: flex;
      align-items: flex-end;
      padding-top: 0;
      padding-bottom: 0.6mm;
    }
    .ob-time {
      grid-template-columns: 16mm 1fr 20mm 1fr;
      gap: 2mm;
    }
    .label-right { text-align: right; }
    .ob-return {
      display: flex;
      align-items: center;
      gap: 4mm;
      font-size: 10px;
      margin-top: 0.6mm;
    }
    .check-wrap { display: inline-flex; align-items: center; gap: 1.5mm; font-weight: 700; }
    .check {
      display: inline-block;
      width: 6mm;
      height: 6mm;
      border: 1px solid #000;
    }
    .ob-foot {
      margin-top: 4.5mm;
      text-align: center;
      border-top: 1px solid transparent;
    }
    .sig-name {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.01em;
      border-bottom: 1px solid #000;
      padding-bottom: 1.2mm;
      margin-top: 5.5mm;
    }
    .sig-role {
      margin-top: 1.2mm;
      font-size: 10px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  ${pages
    .map(
      (chunk) => `
  <div class="print-page">
    ${chunk.map((s) => makeSlipMarkup(s)).join("\n")}
  </div>`
    )
    .join("\n")}
</body>
</html>`;
}
const tabs = ["Dashboard", "Task Tracker", "OB Slip", "Calendar", "Employees"];

const COMELEC_NAV_KEY = "comelec_nav_v1";

function readStoredNav() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COMELEC_NAV_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function normalizeNav(o) {
  if (!o || typeof o !== "object") return null;
  const tab = tabs.includes(o.tab) ? o.tab : "Dashboard";
  return {
    tab,
    taskPage: o.taskPage === "detail" || o.taskPage === "list" ? o.taskPage : "list",
    selectedTaskId: typeof o.selectedTaskId === "string" ? o.selectedTaskId : null,
    obPage: o.obPage === "detail" || o.obPage === "list" ? o.obPage : "list",
    selectedObSlipId: typeof o.selectedObSlipId === "string" ? o.selectedObSlipId : null,
    employeePage: o.employeePage === "detail" || o.employeePage === "list" ? o.employeePage : "list",
    selectedEmployeeId: typeof o.selectedEmployeeId === "string" ? o.selectedEmployeeId : null,
  };
}

const initialAppNav = typeof window !== "undefined" ? normalizeNav(readStoredNav()) : null;

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

function DashboardSection({
  dashboard,
  dashboardSearch,
  setDashboardSearch,
  dashboardRecent,
  events,
  holidays = [],
  employees = [],
  taskLogs = [],
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
  const pipelineBaseRows = dashboard.tasksByStage || [];
  const pipelineRows = useMemo(() => {
    if (!Array.isArray(taskLogs) || taskLogs.length === 0) return pipelineBaseRows;
    const nowTs = Date.now();
    const msByRange = {
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      yearly: 365 * 24 * 60 * 60 * 1000,
    };
    const cutoff = nowTs - (msByRange[pipelineRange] || msByRange.monthly);
    const counts = new Map(pipelineBaseRows.map((r) => [r.stageIndex, 0]));
    for (const log of taskLogs) {
      const ts = Date.parse(log?.at || "");
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      let s = Number(log?.details?.stage);
      if (!Number.isInteger(s)) s = Number(log?.details?.stageIndex);
      if (!Number.isInteger(s)) continue;
      if (!counts.has(s)) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
    return pipelineBaseRows.map((r) => {
      const c = counts.get(r.stageIndex) || 0;
      return { ...r, count: c, pct: Math.round((c / total) * 1000) / 10 };
    });
  }, [pipelineBaseRows, taskLogs, pipelineRange]);
  const currentStageCounts = useMemo(
    () => new Map((dashboard.tasksByStage || []).map((r) => [r.stageIndex, Number(r.count || 0)])),
    [dashboard.tasksByStage]
  );
  const pipelineMax = Math.max(1, ...pipelineRows.map((r) => Number(r.count || 0)));
  const busiestStage = pipelineRows.reduce((best, row) => (row.count > (best?.count || -1) ? row : best), null);
  const currentCompleted = (dashboard.tasksByStage || []).slice(-1)[0]?.count || 0;

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
                  {(holidaysByDate[cell.dateStr]?.length ||
                    birthdaysByDate[cell.dateStr]?.length ||
                    eventsByDate[cell.dateStr]?.length) > 0 && (
                    <span className="cal-app-dots" aria-hidden="true">
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
                  )}
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
          <h3>Task Pipeline</h3>
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
          <span>Total: <strong>{dashboard.tasks?.total ?? 0}</strong></span>
          <span>In Progress: <strong>{dashboard.tasks?.inProgress ?? 0}</strong></span>
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

function CalendarSection({
  holidays,
  events,
  employees,
  eventSearch,
  setEventSearch,
  eventFilter,
  setEventFilter,
  calendarShowArchived,
  setCalendarShowArchived,
  eventSummary,
  filteredEvents,
  setEditingEventId,
  setNewEvent,
  setModalType,
  deleteData,
  patchData,
  loadAll,
  setBackendOffline,
}) {
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

  const visibleCalendarEvents = useMemo(
    () => (calendarShowArchived ? events : events.filter((e) => !e.archived)),
    [events, calendarShowArchived]
  );

  const eventsByDate = useMemo(() => {
    const m = {};
    for (const ev of visibleCalendarEvents) {
      if (!ev?.date?.startsWith(ym)) continue;
      (m[ev.date] ||= []).push(ev);
    }
    return m;
  }, [visibleCalendarEvents, ym]);

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

  const selectedHolidays = holidaysByDate[selectedDate] || [];
  const selectedBirthdays = birthdaysByDate[selectedDate] || [];
  const selectedEvents = eventsByDate[selectedDate] || [];

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

  const openAddEvent = () => {
    setEditingEventId(null);
    setNewEvent({ title: "", date: selectedDate, time: "09:00", description: "" });
    setModalType("event");
  };

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="task-tracker-page task-tracker-page--stacked cal-app">
      <header className="task-tracker-intro">
        <span className="task-tracker-eyebrow">Scheduling</span>
        <h2 className="task-tracker-title">Calendar</h2>
        <p className="task-tracker-lede">
          <strong>Philippines (PH)</strong> national holidays (public and bank) come from the holiday calendar and refresh with live data.
          Staff birthdays and your events show on the grid. Archive old events to keep the list tidy.
        </p>
      </header>

      <div className="tracker-summary tracker-summary--row cal-app-kpis">
        <article className="tracker-kpi">
          <small>Active events</small>
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
          <small>Archived</small>
          <strong>{eventSummary.archived}</strong>
        </article>
      </div>

      <div className="cal-app-legend" aria-label="Calendar legend">
        <span>
          <i className="cal-legend-dot cal-legend-dot--holiday" /> PH holiday
        </span>
        <span>
          <i className="cal-legend-dot cal-legend-dot--birthday" /> Birthday
        </span>
        <span>
          <i className="cal-legend-dot cal-legend-dot--event" /> Event
        </span>
      </div>

      <div className="task-tracker-filters-card">
        <div className="task-tracker-filters-label">Filter &amp; list</div>
        <div className="task-tracker-toolbar cal-app-toolbar">
          <div className="inline-form task-tracker-filters">
            <input placeholder="Search events…" value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} />
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="all">All active</option>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="archived">Archived only</option>
            </select>
            <label className="cal-checkbox-label">
              <input
                type="checkbox"
                checked={calendarShowArchived}
                onChange={(e) => setCalendarShowArchived(e.target.checked)}
              />
              Show archived on calendar
            </label>
          </div>
          <button type="button" className="task-tracker-add" onClick={openAddEvent}>
            + Add Event
          </button>
        </div>
      </div>

      <div className="cal-app-main">
        <article className="panel cal-app-cal-panel">
          <div className="dash-cal-head cal-app-cal-head">
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
          <div className="dash-cal-grid cal-app-cal-grid">
            {calendarCells.map((cell, i) =>
              cell.type === "pad" ? (
                <div key={`pad-${i}`} className="dash-cal-cell dash-cal-cell--empty" />
              ) : (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={`dash-cal-cell cal-app-cal-cell ${cell.dateStr === todayYmd ? "dash-cal-cell--today" : ""} ${
                    cell.dateStr === selectedDate ? "dash-cal-cell--selected" : ""
                  }`}
                  onClick={() => setSelectedDate(cell.dateStr)}
                >
                  <span className="dash-cal-daynum">{cell.day}</span>
                  <span className="cal-app-dots" aria-hidden="true">
                    {(holidaysByDate[cell.dateStr]?.length || 0) > 0 && <span className="cal-dot cal-dot--holiday" />}
                    {(birthdaysByDate[cell.dateStr]?.length || 0) > 0 && <span className="cal-dot cal-dot--birthday" />}
                    {(eventsByDate[cell.dateStr]?.length || 0) > 0 && <span className="cal-dot cal-dot--event" />}
                  </span>
                </button>
              )
            )}
          </div>
        </article>

        <div className="cal-app-side">
          <article className="panel cal-app-day-panel">
            <h3 className="cal-app-day-title">{dayjs(selectedDate).format("dddd, MMM D, YYYY")}</h3>

            {selectedHolidays.length > 0 && (
              <div className="cal-app-day-block">
                <h4 className="cal-app-day-block-title">Philippines holidays</h4>
                <ul className="cal-app-day-list">
                  {selectedHolidays.map((h, idx) => (
                    <li key={`${h.date}-${h.name}-${idx}`}>
                      <strong>{h.name}</strong>
                      <span className="cal-app-tag cal-app-tag--holiday">{h.type === "bank" ? "PH bank" : "PH public"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedBirthdays.length > 0 && (
              <div className="cal-app-day-block">
                <h4 className="cal-app-day-block-title">Staff birthdays</h4>
                <ul className="cal-app-day-list">
                  {selectedBirthdays.map((b) => (
                    <li key={b.id}>
                      <strong>{b.name}</strong>
                      <span className="cal-app-tag cal-app-tag--birthday">Birthday</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cal-app-day-block">
              <h4 className="cal-app-day-block-title">Events</h4>
              {selectedEvents.length === 0 ? (
                <p className="modal-hint">No events this day. Use Add Event or pick another date.</p>
              ) : (
                <ul className="cal-app-day-list cal-app-day-list--events">
                  {selectedEvents.map((ev) => (
                    <li key={ev.id}>
                      <div>
                        <strong>{ev.title}</strong>
                        <small>{ev.time || "—"}</small>
                        {ev.archived && <span className="cal-app-tag cal-app-tag--archived">Archived</span>}
                      </div>
                      <div className="cal-app-day-actions">
                        {!ev.archived && (
                          <button
                            type="button"
                            className="btn-text"
                            onClick={async () => {
                              try {
                                await patchData(`/events/${ev.id}`, { archived: true });
                                await loadAll();
                              } catch {
                                setBackendOffline(true);
                              }
                            }}
                          >
                            Archive
                          </button>
                        )}
                        {ev.archived && (
                          <button
                            type="button"
                            className="btn-text"
                            onClick={async () => {
                              try {
                                await patchData(`/events/${ev.id}`, { archived: false });
                                await loadAll();
                              } catch {
                                setBackendOffline(true);
                              }
                            }}
                          >
                            Unarchive
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </div>
      </div>

      <article className="task-tracker-list-card">
        <div className="task-tracker-list-heading">
          <div>
            <h3 className="task-tracker-list-title">Event list</h3>
            <p className="task-tracker-list-sub">
              {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}{" "}
              {filteredEvents.length === 1 ? "matches" : "match"} your filters
            </p>
          </div>
        </div>
        <div className="table task-list-scroll task-list-scroll--roomy">
          {filteredEvents.map((ev) => (
            <div key={ev.id} className={`list-item cal-app-event-row ${ev.archived ? "cal-app-event-row--archived" : ""}`}>
              <div className="list-main">
                <strong>{ev.title}</strong>
                <small>{`${ev.date} · ${ev.time || "—"}`}</small>
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
                {!ev.archived ? (
                  <button
                    type="button"
                    className="btn-crud"
                    onClick={async () => {
                      try {
                        await patchData(`/events/${ev.id}`, { archived: true });
                        await loadAll();
                      } catch {
                        setBackendOffline(true);
                      }
                    }}
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-crud"
                    onClick={async () => {
                      try {
                        await patchData(`/events/${ev.id}`, { archived: false });
                        await loadAll();
                      } catch {
                        setBackendOffline(true);
                      }
                    }}
                  >
                    Unarchive
                  </button>
                )}
                <button
                  type="button"
                  className="btn-crud btn-crud--danger"
                  onClick={async () => {
                    if (!window.confirm("Delete this event permanently?")) return;
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
                <span className="status-pill">{ev.archived ? "Archived" : "Scheduled"}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState(() => initialAppNav?.tab ?? "Dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [tasksData, setTasksData] = useState({ stages: [], items: [], logs: [] });
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [obSlips, setObSlips] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [modalType, setModalType] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(() => initialAppNav?.selectedTaskId ?? null);
  const [taskPage, setTaskPage] = useState(() => initialAppNav?.taskPage ?? "list");
  const [taskProgress, setTaskProgress] = useState({ staff: "", note: "", stage: "1" });
  const [newTask, setNewTask] = useState({
    title: dayjs().format("YYYY-MM-DD"),
    assignedStaff: "",
    note: "",
    batchDate: dayjs().format("YYYY-MM-DD"),
  });
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    position: "",
    type: "full-time",
    department: "COMELEC",
    birthday: "",
    email: "",
    contactNo: "",
    address: "",
  });
  const [holidays, setHolidays] = useState([]);
  const [calendarShowArchived, setCalendarShowArchived] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", date: dayjs().format("YYYY-MM-DD"), time: "09:00", description: "" });
  const [newSlip, setNewSlip] = useState({
    date: dayjs().format("YYYY-MM-DD"),
    name: "",
    position: "",
    department: "COMELEC",
    purpose: "",
    timeIn: "08:00",
    timeOut: "17:00",
    employeeId: "",
  });
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStageFilter, setTaskStageFilter] = useState("all");
  const [taskDateFilter, setTaskDateFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskListPage, setTaskListPage] = useState(1);
  const [taskError, setTaskError] = useState("");
  const [taskModalError, setTaskModalError] = useState("");
  const [obSearch, setObSearch] = useState("");
  const [obQuickRange, setObQuickRange] = useState("all");
  const [obPickDate, setObPickDate] = useState("");
  const [obArchiveScope, setObArchiveScope] = useState("active");
  const [obListPage, setObListPage] = useState(1);
  const [obPage, setObPage] = useState(() => initialAppNav?.obPage ?? "list");
  const [selectedObSlipId, setSelectedObSlipId] = useState(() => initialAppNav?.selectedObSlipId ?? null);
  const [obExportIds, setObExportIds] = useState([]);
  const obImportInputRef = useRef(null);
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeSort, setEmployeeSort] = useState("az");
  const [backendOffline, setBackendOffline] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authFormMode, setAuthFormMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingObId, setEditingObId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [showFinalStepConfirm, setShowFinalStepConfirm] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => initialAppNav?.selectedEmployeeId ?? null);
  const [employeePage, setEmployeePage] = useState(() => initialAppNav?.employeePage ?? "list");

  const navSnapRef = useRef({
    tab: initialAppNav?.tab ?? "Dashboard",
    taskPage: initialAppNav?.taskPage ?? "list",
    selectedTaskId: initialAppNav?.selectedTaskId ?? null,
    obPage: initialAppNav?.obPage ?? "list",
    selectedObSlipId: initialAppNav?.selectedObSlipId ?? null,
    employeePage: initialAppNav?.employeePage ?? "list",
    selectedEmployeeId: initialAppNav?.selectedEmployeeId ?? null,
  });
  const historyPrimedRef = useRef(false);

  useLayoutEffect(() => {
    navSnapRef.current = {
      tab: activeTab,
      taskPage,
      selectedTaskId,
      obPage,
      selectedObSlipId,
      employeePage,
      selectedEmployeeId,
    };
  }, [activeTab, taskPage, selectedTaskId, obPage, selectedObSlipId, employeePage, selectedEmployeeId]);

  const applyAndPushNav = (updates) => {
    const merged = normalizeNav({ ...navSnapRef.current, ...updates });
    if (!merged) return;
    window.history.pushState({ comelec: merged }, "", "");
    try {
      localStorage.setItem(COMELEC_NAV_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
    setActiveTab(merged.tab);
    setTaskPage(merged.taskPage);
    setSelectedTaskId(merged.selectedTaskId);
    setObPage(merged.obPage);
    setSelectedObSlipId(merged.selectedObSlipId);
    setEmployeePage(merged.employeePage);
    setSelectedEmployeeId(merged.selectedEmployeeId);
  };

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
      const ping = await fetch(apiUrl("/health"));
      if (!ping.ok) throw new Error("Backend health check failed.");
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
      try {
        const hi = await jsonFetch(apiUrl("/holidays"));
        setHolidays(hi.holidays || []);
      } catch {
        setHolidays([]);
      }
    } catch (e) {
      if (String(e?.message) === "UNAUTHORIZED") {
        setAuthUser(false);
        return;
      }
      setBackendOffline(true);
      setDashboard(null);
      setTasksData({ stages: [], items: [], logs: [] });
      setEmployees([]);
      setEvents([]);
      setObSlips([]);
      setHolidays([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) {
      setAuthUser(false);
      return () => {};
    }
    (async () => {
      try {
        const u = await jsonFetch(apiUrl("/auth/me"));
        if (!cancelled) setAuthUser(u);
      } catch {
        if (!cancelled) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthUser(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authUser || typeof authUser !== "object") return undefined;
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
      if (Array.isArray(payload.holidays)) setHolidays(payload.holidays);
    });
    return () => socket.disconnect();
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser || typeof authUser !== "object") return;
    const snap = normalizeNav({
      tab: activeTab,
      taskPage,
      selectedTaskId,
      obPage,
      selectedObSlipId,
      employeePage,
      selectedEmployeeId,
    });
    if (snap) {
      try {
        localStorage.setItem(COMELEC_NAV_KEY, JSON.stringify(snap));
      } catch {
        /* ignore */
      }
    }
  }, [authUser, activeTab, taskPage, selectedTaskId, obPage, selectedObSlipId, employeePage, selectedEmployeeId]);

  useEffect(() => {
    if (!authUser || typeof authUser !== "object") {
      historyPrimedRef.current = false;
      return;
    }
    if (historyPrimedRef.current) return;
    historyPrimedRef.current = true;
    if (!window.history.state?.comelec) {
      const snap = normalizeNav({
        tab: activeTab,
        taskPage,
        selectedTaskId,
        obPage,
        selectedObSlipId,
        employeePage,
        selectedEmployeeId,
      });
      if (snap) window.history.replaceState({ comelec: snap }, "", "");
    }
  }, [authUser, activeTab, taskPage, selectedTaskId, obPage, selectedObSlipId, employeePage, selectedEmployeeId]);

  useEffect(() => {
    const onPop = (e) => {
      const n = normalizeNav(e.state?.comelec);
      if (!n) return;
      setActiveTab(n.tab);
      setTaskPage(n.taskPage);
      setSelectedTaskId(n.selectedTaskId);
      setObPage(n.obPage);
      setSelectedObSlipId(n.selectedObSlipId);
      setEmployeePage(n.employeePage);
      setSelectedEmployeeId(n.selectedEmployeeId);
      try {
        localStorage.setItem(COMELEC_NAV_KEY, JSON.stringify(n));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (activeTab === "Task Tracker" && taskPage === "detail" && selectedTaskId && tasksData.stages.length > 0) {
      if (!tasksData.items.some((t) => t.id === selectedTaskId)) {
        setTaskPage("list");
        setSelectedTaskId(null);
      }
    }
    if (activeTab === "OB Slip" && obPage === "detail" && selectedObSlipId) {
      if (obSlips.length > 0 && !obSlips.some((s) => s.id === selectedObSlipId)) {
        setObPage("list");
        setSelectedObSlipId(null);
      }
    }
    if (activeTab === "Employees" && employeePage === "detail" && selectedEmployeeId) {
      if (employees.length > 0 && !employees.some((e) => e.id === selectedEmployeeId)) {
        setEmployeePage("list");
        setSelectedEmployeeId(null);
      }
    }
  }, [
    activeTab,
    taskPage,
    selectedTaskId,
    tasksData.items,
    obPage,
    selectedObSlipId,
    obSlips,
    employeePage,
    selectedEmployeeId,
    employees,
  ]);

  const postData = async (path, body) => {
    const r = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthUser(false);
      throw new Error("UNAUTHORIZED");
    }
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `HTTP ${r.status}`);
    }
    return r.json();
  };

  const patchData = async (path, body) => {
    const r = await fetch(apiUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthUser(false);
      throw new Error("UNAUTHORIZED");
    }
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `HTTP ${r.status}`);
    }
    return r.json();
  };

  const deleteData = async (path) => {
    const r = await fetch(apiUrl(path), { method: "DELETE", headers: { ...getAuthHeaders() } });
    if (r.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthUser(false);
      throw new Error("UNAUTHORIZED");
    }
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

  const employeesSorted = useMemo(
    () => [...employees].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })),
    [employees]
  );

  const filteredEmployees = useMemo(
    () => {
      const base = (employeeFilter === "all" ? employeesSorted : employeesSorted.filter((e) => e.type === employeeFilter)).filter(
        (e) =>
          `${e.name} ${e.position} ${e.department || ""} ${e.email || ""} ${e.contactNo || ""} ${e.address || ""}`
            .toLowerCase()
            .includes(employeeSearch.toLowerCase())
      );
      if (employeeSort === "za") return [...base].reverse();
      return base;
    },
    [employeesSorted, employeeFilter, employeeSearch, employeeSort]
  );

  useEffect(() => {
    setObExportIds((prev) => prev.filter((id) => obSlips.some((s) => s.id === id)));
  }, [obSlips]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  );

  const selectedTask = useMemo(
    () => tasksData.items.find((task) => task.id === selectedTaskId) || null,
    [tasksData.items, selectedTaskId]
  );

  const selectedObSlip = useMemo(
    () => obSlips.find((s) => s.id === selectedObSlipId) || null,
    [obSlips, selectedObSlipId]
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
    const filtered = tasksData.items.filter((task) => {
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
    return [...filtered].sort((a, b) => {
      const aKey = `${a.batchDate || ""}T${a.updatedAt || a.createdAt || ""}`;
      const bKey = `${b.batchDate || ""}T${b.updatedAt || b.createdAt || ""}`;
      return bKey.localeCompare(aKey);
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
    const today = dayjs().format("YYYY-MM-DD");
    const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
    const weekEnd = dayjs().endOf("week").format("YYYY-MM-DD");
    const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");
    const monthEnd = dayjs().endOf("month").format("YYYY-MM-DD");
    const filtered = obSlips.filter((s) => {
      const textPass = `${s.name} ${s.purpose} ${s.position}`.toLowerCase().includes(obSearch.toLowerCase());
      if (obArchiveScope === "active" && s.archived) return false;
      if (obArchiveScope === "archived" && !s.archived) return false;
      let datePass = true;
      if (obPickDate) datePass = s.date === obPickDate;
      else if (obQuickRange === "today") datePass = s.date === today;
      else if (obQuickRange === "week") datePass = s.date >= weekStart && s.date <= weekEnd;
      else if (obQuickRange === "month") datePass = s.date >= monthStart && s.date <= monthEnd;
      return textPass && datePass;
    });
    return [...filtered].sort((a, b) => {
      const aKey = `${a.date || ""}T${a.timeOut || a.timeIn || ""}`;
      const bKey = `${b.date || ""}T${b.timeOut || b.timeIn || ""}`;
      return bKey.localeCompare(aKey);
    });
  }, [obSlips, obSearch, obPickDate, obQuickRange, obArchiveScope]);

  const LIST_PAGE_SIZE = 5;
  const taskListPages = Math.max(1, Math.ceil(filteredTasks.length / LIST_PAGE_SIZE));
  const taskPageSafe = Math.min(taskListPage, taskListPages);
  const pagedTasks = useMemo(
    () => filteredTasks.slice((taskPageSafe - 1) * LIST_PAGE_SIZE, taskPageSafe * LIST_PAGE_SIZE),
    [filteredTasks, taskPageSafe]
  );

  const obListPages = Math.max(1, Math.ceil(filteredObSlips.length / LIST_PAGE_SIZE));
  const obPageSafe = Math.min(obListPage, obListPages);
  const pagedObSlips = useMemo(
    () => filteredObSlips.slice((obPageSafe - 1) * LIST_PAGE_SIZE, obPageSafe * LIST_PAGE_SIZE),
    [filteredObSlips, obPageSafe]
  );

  const filteredObSlipIds = useMemo(() => pagedObSlips.map((s) => s.id), [pagedObSlips]);
  const obAllFilteredSelected =
    filteredObSlipIds.length > 0 && filteredObSlipIds.every((id) => obExportIds.includes(id));

  const toggleObSelectAllFiltered = () => {
    setObExportIds((prev) => {
      if (filteredObSlipIds.length === 0) return prev;
      const allOn = filteredObSlipIds.every((id) => prev.includes(id));
      if (allOn) return prev.filter((id) => !filteredObSlipIds.includes(id));
      return [...new Set([...prev, ...filteredObSlipIds])];
    });
  };

  const filteredEvents = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const nowTs = Date.now();
    const filtered = events
      .filter((ev) => {
        const textPass = `${ev.title} ${ev.description || ""}`.toLowerCase().includes(eventSearch.toLowerCase());
        if (!textPass) return false;
        if (eventFilter === "archived") return !!ev.archived;
        if (ev.archived) return false;
        if (eventFilter === "today") return ev.date === today;
        if (eventFilter === "upcoming") return ev.date >= today;
        return true;
      });

    return [...filtered].sort((a, b) => {
        const aTs = Date.parse(`${a.date}T${a.time || "23:59"}`);
        const bTs = Date.parse(`${b.date}T${b.time || "23:59"}`);
        const aUpcoming = Number.isFinite(aTs) && aTs >= nowTs;
        const bUpcoming = Number.isFinite(bTs) && bTs >= nowTs;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        if (aUpcoming && bUpcoming) return aTs - bTs;
        if (Number.isFinite(aTs) && Number.isFinite(bTs)) return bTs - aTs;
        return (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""));
      });
  }, [events, eventSearch, eventFilter]);

  useEffect(() => {
    setTaskListPage(1);
  }, [taskSearch, taskStageFilter, taskDateFilter, taskStatusFilter, tasksData.items.length]);

  useEffect(() => {
    if (taskListPage > taskListPages) setTaskListPage(taskListPages);
  }, [taskListPage, taskListPages]);

  useEffect(() => {
    setObListPage(1);
  }, [obSearch, obPickDate, obQuickRange, obArchiveScope, obSlips.length]);

  useEffect(() => {
    if (obListPage > obListPages) setObListPage(obListPages);
  }, [obListPage, obListPages]);

  const obSlipSummary = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
    const weekEnd = dayjs().endOf("week").format("YYYY-MM-DD");
    const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");
    const monthEnd = dayjs().endOf("month").format("YYYY-MM-DD");
    const active = obSlips.filter((s) => !s.archived);
    const archivedN = obSlips.filter((s) => s.archived).length;
    return {
      total: active.length,
      archivedN,
      today: active.filter((s) => s.date === today).length,
      thisWeek: active.filter((s) => s.date >= weekStart && s.date <= weekEnd).length,
      thisMonth: active.filter((s) => s.date >= monthStart && s.date <= monthEnd).length,
    };
  }, [obSlips]);

  const eventSummary = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const active = events.filter((e) => !e.archived);
    const archived = events.filter((e) => e.archived).length;
    return {
      total: active.length,
      archived,
      today: active.filter((e) => e.date === today).length,
      upcoming: active.filter((e) => e.date > today).length,
      past: active.filter((e) => e.date < today).length,
    };
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
      setTaskProgress({ staff: "", note: "", stage: String(nextStage) });
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
      stage: String(nextStage),
    }));
  }, [selectedTask?.id, selectedTask?.currentStage, taskPage, tasksData.stages.length]);

  const importSlipExcel = async (file) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(apiUrl("/ob-slips/import-excel"), { method: "POST", headers: { ...getAuthHeaders() }, body: form });
      if (r.status === 401) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthUser(false);
        return;
      }
      if (!r.ok) throw new Error("Import failed");
      await loadAll();
    } catch {
      setBackendOffline(true);
    } finally {
      const el = obImportInputRef.current;
      if (el) el.value = "";
    }
  };

  const printSlip = (slip) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(buildObSlipPrintHtml(slip));
    win.document.close();
    win.focus();
    const attemptPrint = () => {
      try {
        const imgs = Array.from(win.document.images || []);
        const ready = imgs.every((img) => img.complete && img.naturalWidth > 0);
        if (ready) {
          win.print();
          return;
        }
        let remaining = imgs.length;
        if (remaining === 0) {
          win.print();
          return;
        }
        const done = () => {
          remaining -= 1;
          if (remaining <= 0) win.print();
        };
        imgs.forEach((img) => {
          if (img.complete) done();
          else {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          }
        });
        setTimeout(() => win.print(), 1200);
      } catch {
        win.print();
      }
    };
    win.addEventListener("load", attemptPrint, { once: true });
  };

  const printSelectedObSlips = () => {
    const selected = obSlips.filter((s) => obExportIds.includes(s.id));
    if (selected.length === 0) {
      window.alert("Select at least one slip to print.");
      return;
    }
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(buildObSlipPrintHtml(selected));
    win.document.close();
    win.focus();
    const attemptPrint = () => {
      try {
        const imgs = Array.from(win.document.images || []);
        const ready = imgs.every((img) => img.complete && img.naturalWidth > 0);
        if (ready) {
          win.print();
          return;
        }
        let remaining = imgs.length;
        if (remaining === 0) {
          win.print();
          return;
        }
        const done = () => {
          remaining -= 1;
          if (remaining <= 0) win.print();
        };
        imgs.forEach((img) => {
          if (img.complete) done();
          else {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          }
        });
        setTimeout(() => win.print(), 1200);
      } catch {
        win.print();
      }
    };
    win.addEventListener("load", attemptPrint, { once: true });
  };

  const selectTab = (tab) => {
    setNavOpen(false);
    const updates = { tab };
    if (tab !== "Employees") {
      updates.employeePage = "list";
      updates.selectedEmployeeId = null;
    }
    if (tab !== "OB Slip") {
      updates.obPage = "list";
      updates.selectedObSlipId = null;
    }
    if (tab === "Task Tracker") {
      updates.taskPage = "list";
      updates.selectedTaskId = null;
    }
    applyAndPushNav(updates);
  };

  const downloadObSlipsExport = async () => {
    try {
      const q = obExportIds.length > 0 ? `?ids=${encodeURIComponent(obExportIds.join(","))}` : "";
      const r = await fetch(apiUrl(`/ob-slips/export-excel${q}`), { headers: { ...getAuthHeaders() } });
      if (r.status === 401) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthUser(false);
        return;
      }
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ob-slips.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setBackendOffline(true);
    }
  };

  if (authUser === null) {
    return (
      <div className="auth-gate auth-gate--loading">
        <div className="auth-gate-card auth-gate-card--loading">
          <p className="auth-gate-loading">Loading session…</p>
        </div>
      </div>
    );
  }

  if (authUser === false) {
    return (
      <AuthGate
        mode={authFormMode}
        setMode={setAuthFormMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        name={authName}
        setName={setAuthName}
        error={authError}
        setError={setAuthError}
        busy={authBusy}
        setBusy={setAuthBusy}
        onAuthed={(user, token) => {
          localStorage.setItem(AUTH_STORAGE_KEY, token);
          setAuthUser(user);
        }}
      />
    );
  }

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
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <p className="sidebar-user-label">Signed in</p>
            <p className="sidebar-user-name">{authUser.name || authUser.email}</p>
            <button
              type="button"
              className="sidebar-logout"
              onClick={async () => {
                try {
                  await fetch(apiUrl("/auth/logout"), { method: "POST", headers: { ...getAuthHeaders() } });
                } catch {
                  /* ignore */
                }
                localStorage.removeItem(AUTH_STORAGE_KEY);
                setAuthUser(false);
                setNavOpen(false);
              }}
            >
              Log out
            </button>
          </div>
          <div className="live-pill">v1.0</div>
          <div className="sidebar-devs">
            <p className="sidebar-devs-label">Developers</p>
            <p className="sidebar-devs-names">Nicole Borabo, Andrei Asnan</p>
          </div>
        </div>
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
            events={events.filter((e) => !e.archived)}
            holidays={holidays}
            employees={employees}
            taskLogs={tasksData.logs || []}
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
                      pagedTasks.map((task) => {
                        const progressPct = Math.round(((task.currentStage + 1) / tasksData.stages.length) * 100);
                        const status =
                          task.currentStage === tasksData.stages.length - 1
                            ? "Completed"
                            : task.currentStage === 0
                            ? "Pending"
                            : "In Progress";
                        const isCompleted = task.currentStage === tasksData.stages.length - 1;
                        const openTaskDetail = () => {
                          setTaskError("");
                          const nextStage = Math.min(task.currentStage + 1, tasksData.stages.length - 1);
                          setTaskProgress({ staff: "", note: "", stage: String(nextStage) });
                          applyAndPushNav({ taskPage: "detail", selectedTaskId: task.id });
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
                              <div className={`task-progress-bar${isCompleted ? " task-progress-bar--complete" : ""}`}>
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
                                      applyAndPushNav({ taskPage: "list", selectedTaskId: null });
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
                  {filteredTasks.length > LIST_PAGE_SIZE && (
                    <div className="list-pagination" aria-label="Task list pages">
                      {Array.from({ length: taskListPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={`task-page-${p}`}
                          type="button"
                          className={`list-page-btn ${p === taskPageSafe ? "is-active" : ""}`}
                          onClick={() => setTaskListPage(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
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
                          applyAndPushNav({ taskPage: "list", selectedTaskId: null });
                          await loadAll();
                        } catch {
                          setBackendOffline(true);
                        }
                      }}
                    >
                      Delete batch
                    </button>
                    <button type="button" onClick={() => applyAndPushNav({ taskPage: "list", selectedTaskId: null })}>
                      Back to Task List
                    </button>
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
                    value={selectedTask.currentStage >= tasksData.stages.length - 1 ? "" : String(taskProgress.stage)}
                    onChange={(e) => setTaskProgress({ ...taskProgress, stage: e.target.value })}
                  >
                    {tasksData.stages
                      .map((s, i) => ({ label: s, index: i }))
                      .filter(({ index }) => index === selectedTask.currentStage + 1 || (selectedTask.currentStage === 2 && index === 1))
                      .map(({ label, index }) => (
                        <option value={String(index)} key={label}>{`${index + 1}. ${label}`}</option>
                      ))}
                    {selectedTask.currentStage >= tasksData.stages.length - 1 && <option value="">Final stage reached</option>}
                  </select>
                  <select
                    value={taskProgress.staff}
                    onChange={(e) => setTaskProgress({ ...taskProgress, staff: e.target.value })}
                    required
                    aria-label="Assigned employee"
                  >
                    <option value="">Select employee</option>
                    {employeesSorted.map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
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
            {obPage === "list" && (
              <div className="task-tracker-page task-tracker-page--stacked">
                <header className="task-tracker-intro">
                  <span className="task-tracker-eyebrow">Documents</span>
                  <h2 className="task-tracker-title">Official Business Slips</h2>
                  <p className="task-tracker-lede">Click a slip for full details, print, archive, or edit.</p>
                </header>

                <div className="tracker-summary tracker-summary--row">
                  <article className="tracker-kpi">
                    <small>Active slips</small>
                    <strong>{obSlipSummary.total}</strong>
                    <span className="tracker-kpi-hint">{obSlipSummary.archivedN} archived</span>
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
                      <input
                        placeholder="Search slip"
                        value={obSearch}
                        onChange={(e) => setObSearch(e.target.value)}
                        aria-label="Search slips"
                      />
                      <div className="ob-date-filter" title="Exact slip date">
                        <span className="ob-date-filter-icon" aria-hidden="true">
                          {tabIcons.Calendar}
                        </span>
                        <input
                          type="date"
                          className="ob-date-filter-input"
                          value={obPickDate}
                          onChange={(e) => setObPickDate(e.target.value)}
                          aria-label="Filter by slip date"
                        />
                        {obPickDate ? (
                          <button type="button" className="ob-date-filter-clear" onClick={() => setObPickDate("")}>
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <select
                        value={obQuickRange}
                        onChange={(e) => setObQuickRange(e.target.value)}
                        disabled={!!obPickDate}
                        title={obPickDate ? "Clear the date field to use a preset range" : ""}
                        aria-label="Date range preset"
                      >
                        <option value="all">Any date</option>
                        <option value="today">Today</option>
                        <option value="week">This week</option>
                        <option value="month">This month</option>
                      </select>
                      <select value={obArchiveScope} onChange={(e) => setObArchiveScope(e.target.value)} aria-label="Archive filter">
                        <option value="active">Active only</option>
                        <option value="archived">Archived only</option>
                        <option value="all">Active + archived</option>
                      </select>
                      <button type="button" className="ob-slip-action" onClick={printSelectedObSlips}>
                        {obExportIds.length > 0 ? `Print selected (${obExportIds.length})` : "Print selected"}
                      </button>
                      <button type="button" className="ob-slip-action" onClick={() => downloadObSlipsExport()}>
                        {obExportIds.length > 0 ? `Export selected (${obExportIds.length})` : "Export Excel"}
                      </button>
                      <label className="upload-btn ob-slip-action">
                        Import Excel
                        <input
                          ref={obImportInputRef}
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
                            employeeId: "",
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
                  <div className="task-tracker-list-heading task-tracker-list-heading--ob-export">
                    <div>
                      <h3 className="task-tracker-list-title">Slip queue</h3>
                      <p className="task-tracker-list-sub">
                        {filteredObSlips.length} slip{filteredObSlips.length === 1 ? "" : "s"} match your filters
                        {obExportIds.length > 0 ? ` · ${obExportIds.length} selected for export` : ""}
                      </p>
                    </div>
                    {pagedObSlips.length > 0 ? (
                      <label className="ob-slip-select-all">
                        <input type="checkbox" checked={obAllFilteredSelected} onChange={toggleObSelectAllFiltered} />
                        <span>Select visible page</span>
                      </label>
                    ) : null}
                  </div>
                  <div className="task-list task-list-scroll task-list-scroll--roomy">
                    {filteredObSlips.length === 0 ? (
                      <div className="task-empty">No slips match your filters.</div>
                    ) : (
                      pagedObSlips.map((s) => {
                        const openDetail = () => {
                          applyAndPushNav({ obPage: "detail", selectedObSlipId: s.id });
                        };
                        return (
                          <div
                            key={s.id}
                            className={`task-item list-item task-list-item ob-slip-row${s.archived ? " ob-slip-row--archived" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={openDetail}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openDetail();
                              }
                            }}
                          >
                            <div className="ob-slip-row-check" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={obExportIds.includes(s.id)}
                                onChange={() =>
                                  setObExportIds((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))
                                }
                                aria-label={`Select ${s.name} for export`}
                              />
                            </div>
                            <div className="list-main">
                              <strong>{s.name}</strong>
                              <small>{`${s.position} • ${s.department || "COMELEC"} • ${s.date}`}</small>
                              <small>{`${s.purpose} (${s.timeIn}-${s.timeOut})`}</small>
                            </div>
                            <div className="list-meta list-meta--crud" onClick={(e) => e.stopPropagation()}>
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
                                    employeeId: s.employeeId || "",
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
                                  if (!window.confirm("Delete this OB slip permanently?")) return;
                                  try {
                                    await deleteData(`/ob-slips/${s.id}`);
                                    setObExportIds((p) => p.filter((x) => x !== s.id));
                                    if (selectedObSlipId === s.id) {
                                      applyAndPushNav({ obPage: "list", selectedObSlipId: null });
                                    }
                                    await loadAll();
                                  } catch {
                                    setBackendOffline(true);
                                  }
                                }}
                              >
                                Delete
                              </button>
                              {s.archived ? (
                                <span className="status-pill status-pill--muted">Archived</span>
                              ) : (
                                <span className="status-pill">Active</span>
                              )}
                              <span className="list-arrow">›</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {filteredObSlips.length > LIST_PAGE_SIZE && (
                    <div className="list-pagination" aria-label="OB slip list pages">
                      {Array.from({ length: obListPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={`ob-page-${p}`}
                          type="button"
                          className={`list-page-btn ${p === obPageSafe ? "is-active" : ""}`}
                          onClick={() => setObListPage(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            )}

            {obPage === "detail" && selectedObSlip && (
              <article className="panel ob-slip-detail-panel">
                <div className="panel-head panel-head--task-detail">
                  <h3>{selectedObSlip.name}</h3>
                  <div className="panel-head-actions">
                    <button type="button" className="btn-crud" onClick={() => printSlip(selectedObSlip)}>
                      Print
                    </button>
                    <button
                      type="button"
                      className="btn-crud"
                      onClick={() => {
                        setEditingObId(selectedObSlip.id);
                        setNewSlip({
                          date: selectedObSlip.date,
                          name: selectedObSlip.name,
                          position: selectedObSlip.position,
                          department: selectedObSlip.department || "COMELEC",
                          purpose: selectedObSlip.purpose,
                          timeIn: selectedObSlip.timeIn,
                          timeOut: selectedObSlip.timeOut,
                          employeeId: selectedObSlip.employeeId || "",
                        });
                        setModalType("ob");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-crud"
                      onClick={async () => {
                        try {
                          await patchData(`/ob-slips/${selectedObSlip.id}`, { archived: !selectedObSlip.archived });
                          await loadAll();
                        } catch {
                          setBackendOffline(true);
                        }
                      }}
                    >
                      {selectedObSlip.archived ? "Restore" : "Archive"}
                    </button>
                    <button
                      type="button"
                      className="btn-crud btn-crud--danger"
                      onClick={async () => {
                        if (!window.confirm("Delete this OB slip permanently?")) return;
                        try {
                          await deleteData(`/ob-slips/${selectedObSlip.id}`);
                          setObExportIds((p) => p.filter((x) => x !== selectedObSlip.id));
                          applyAndPushNav({ obPage: "list", selectedObSlipId: null });
                          await loadAll();
                        } catch {
                          setBackendOffline(true);
                        }
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => applyAndPushNav({ obPage: "list", selectedObSlipId: null })}>
                      Back to slip queue
                    </button>
                  </div>
                </div>
                <div className="batch-details-card">
                  <div className="batch-details-head">
                    <h4>Slip details</h4>
                    <span className={`status-pill${selectedObSlip.archived ? " status-pill--muted" : ""}`}>
                      {selectedObSlip.archived ? "Archived" : "Active"}
                    </span>
                  </div>
                  <div className="batch-details-grid">
                    <div>
                      <small>Date</small>
                      <strong>{selectedObSlip.date}</strong>
                    </div>
                    <div>
                      <small>Name</small>
                      <strong>{selectedObSlip.name}</strong>
                    </div>
                    <div>
                      <small>Position</small>
                      <strong>{selectedObSlip.position}</strong>
                    </div>
                    <div>
                      <small>Department</small>
                      <strong>{selectedObSlip.department || "COMELEC"}</strong>
                    </div>
                    <div className="batch-details-span-2">
                      <small>Purpose</small>
                      <strong>{selectedObSlip.purpose}</strong>
                    </div>
                    <div>
                      <small>Time in</small>
                      <strong>{selectedObSlip.timeIn}</strong>
                    </div>
                    <div>
                      <small>Time out</small>
                      <strong>{selectedObSlip.timeOut}</strong>
                    </div>
                    {selectedObSlip.createdAt ? (
                      <div>
                        <small>Recorded</small>
                        <strong>{dayjs(selectedObSlip.createdAt).format("MMM D, YYYY h:mm A")}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )}

            {obPage === "detail" && !selectedObSlip && (
              <article className="panel">
                <p className="modal-hint">This slip is no longer in the list.</p>
                <button type="button" onClick={() => applyAndPushNav({ obPage: "list", selectedObSlipId: null })}>
                  Back to slip queue
                </button>
              </article>
            )}
          </section>
        )}

        {activeTab === "Calendar" && (
          <section className="tracker-layout single">
            <CalendarSection
              holidays={holidays}
              events={events}
              employees={employees}
              eventSearch={eventSearch}
              setEventSearch={setEventSearch}
              eventFilter={eventFilter}
              setEventFilter={setEventFilter}
              calendarShowArchived={calendarShowArchived}
              setCalendarShowArchived={setCalendarShowArchived}
              eventSummary={eventSummary}
              filteredEvents={filteredEvents}
              setEditingEventId={setEditingEventId}
              setNewEvent={setNewEvent}
              setModalType={setModalType}
              deleteData={deleteData}
              patchData={patchData}
              loadAll={loadAll}
              setBackendOffline={setBackendOffline}
            />
          </section>
        )}

        {activeTab === "Employees" && (
          <section className="tracker-layout single">
            {employeePage === "list" && (
              <div className="task-tracker-page task-tracker-page--stacked">
                <header className="task-tracker-intro">
                  <span className="task-tracker-eyebrow">Roster</span>
                  <h2 className="task-tracker-title">Employees</h2>
                  <p className="task-tracker-lede">
                    Browse staff, open a profile for basic info, or add new hires. Click a row to open their page.
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
                      <input
                        placeholder="Search by name, role, or department…"
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                      />
                      <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                        <option value="all">All Employees</option>
                        <option value="full-time">Full-Time</option>
                        <option value="part-time">Part-Time</option>
                      </select>
                      <select value={employeeSort} onChange={(e) => setEmployeeSort(e.target.value)} aria-label="Sort employees">
                        <option value="az">Sort: A-Z</option>
                        <option value="za">Sort: Z-A</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="task-tracker-add"
                      onClick={() => {
                        setEditingEmployeeId(null);
                        setNewEmployee({
                          name: "",
                          position: "",
                          type: "full-time",
                          department: "COMELEC",
                          birthday: "",
                          email: "",
                          contactNo: "",
                          address: "",
                        });
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
                  <div className="task-list task-list-scroll task-list-scroll--roomy">
                    {filteredEmployees.length === 0 ? (
                      <div className="task-empty">No employees match your filters.</div>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const openProfile = () => {
                          applyAndPushNav({ employeePage: "detail", selectedEmployeeId: emp.id });
                        };
                        return (
                          <div
                            key={emp.id}
                            className="staff-list-item list-item task-list-item"
                            role="button"
                            tabIndex={0}
                            onClick={openProfile}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openProfile();
                              }
                            }}
                          >
                            <div className="staff-list-main">
                              <span className="staff-avatar" aria-hidden="true">
                                {staffInitials(emp.name)}
                              </span>
                              <div className="list-main">
                                <strong>{emp.name}</strong>
                                <small className="staff-list-meta-line">{emp.position}</small>
                              </div>
                            </div>
                            <div className="list-meta list-meta--crud" onClick={(e) => e.stopPropagation()}>
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
                                    birthday: emp.birthday || "",
                                    email: emp.email || "",
                                    contactNo: emp.contactNo || "",
                                    address: emp.address || "",
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
                                    if (selectedEmployeeId === emp.id) {
                                      applyAndPushNav({ employeePage: "list", selectedEmployeeId: null });
                                    }
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
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
            )}

            {employeePage === "detail" && selectedEmployee && (
              <article className="panel staff-detail-panel">
                <div className="panel-head panel-head--task-detail panel-head--staff-detail">
                  <h3>{selectedEmployee.name}</h3>
                  <div className="panel-head-actions">
                    <button
                      type="button"
                      className="btn-crud"
                      onClick={() => {
                        setEditingEmployeeId(selectedEmployee.id);
                        setNewEmployee({
                          name: selectedEmployee.name,
                          position: selectedEmployee.position,
                          type: selectedEmployee.type,
                          department: selectedEmployee.department || "COMELEC",
                          birthday: selectedEmployee.birthday || "",
                          email: selectedEmployee.email || "",
                          contactNo: selectedEmployee.contactNo || "",
                          address: selectedEmployee.address || "",
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
                          await deleteData(`/employees/${selectedEmployee.id}`);
                          applyAndPushNav({ employeePage: "list", selectedEmployeeId: null });
                          await loadAll();
                        } catch {
                          setBackendOffline(true);
                        }
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => applyAndPushNav({ employeePage: "list", selectedEmployeeId: null })}>
                      Back to staff directory
                    </button>
                  </div>
                </div>

                <div className="staff-detail-hero">
                  <div className="staff-avatar staff-avatar--large" aria-hidden="true">
                    {staffInitials(selectedEmployee.name)}
                  </div>
                  <div className="staff-detail-hero-text">
                    <p className="staff-detail-kicker">Employee Profile</p>
                    <p className="staff-detail-role">{selectedEmployee.position}</p>
                    <p className="staff-detail-dept">{selectedEmployee.department || "No department set"}</p>
                    <span className="status-pill staff-detail-type-pill">
                      {selectedEmployee.type === "full-time" ? "Full-time" : "Part-time"}
                    </span>
                  </div>
                </div>

                <div className="staff-detail-highlights">
                  <div className="staff-highlight-card">
                    <small>Department</small>
                    <strong>{selectedEmployee.department || "COMELEC"}</strong>
                  </div>
                  <div className="staff-highlight-card">
                    <small>Birthday</small>
                    <strong>
                      {selectedEmployee.birthday ? dayjs(selectedEmployee.birthday).format("MMM D, YYYY") : "Not set"}
                    </strong>
                  </div>
                  <div className="staff-highlight-card">
                    <small>Contact no.</small>
                    <strong>{selectedEmployee.contactNo || "Not set"}</strong>
                  </div>
                </div>

                <div className="staff-detail-grid">
                  <div className="staff-basic-info-card">
                    <div className="staff-basic-info-head">
                      <h4>Work details</h4>
                      <span className="staff-basic-info-kicker">Role</span>
                    </div>
                    <div className="staff-basic-info-grid">
                      <div>
                        <small>Full name</small>
                        <strong>{selectedEmployee.name}</strong>
                      </div>
                      <div>
                        <small>Position</small>
                        <strong>{selectedEmployee.position}</strong>
                      </div>
                      <div>
                        <small>Department</small>
                        <strong>{selectedEmployee.department || "—"}</strong>
                      </div>
                      <div>
                        <small>Employment type</small>
                        <strong>{selectedEmployee.type === "full-time" ? "Full-time" : "Part-time"}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="staff-basic-info-card staff-basic-info-card--contact">
                    <div className="staff-basic-info-head">
                      <h4>Contact details</h4>
                      <span className="staff-basic-info-kicker">Reach out</span>
                    </div>
                    <div className="staff-basic-info-grid">
                      <div className="staff-basic-info-span">
                        <small>Gmail / email</small>
                        <strong>
                          {selectedEmployee.email ? (
                            <a className="staff-contact-link" href={`mailto:${selectedEmployee.email}`}>
                              {selectedEmployee.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </strong>
                      </div>
                      <div>
                        <small>Contact no.</small>
                        <strong>
                          {selectedEmployee.contactNo ? (
                            <a className="staff-contact-link" href={`tel:${String(selectedEmployee.contactNo).replace(/\s/g, "")}`}>
                              {selectedEmployee.contactNo}
                            </a>
                          ) : (
                            "—"
                          )}
                        </strong>
                      </div>
                      <div className="staff-basic-info-span">
                        <small>Address</small>
                        <strong className="staff-address-block">
                          {selectedEmployee.address?.trim() ? selectedEmployee.address : "—"}
                        </strong>
                      </div>
                      <div className="staff-basic-info-span">
                        <small>Staff record ID</small>
                        <strong className="staff-id-mono">{selectedEmployee.id}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {employeePage === "detail" && !selectedEmployee && (
              <article className="panel">
                <p className="modal-hint">This staff member is no longer in the list.</p>
                <button type="button" onClick={() => applyAndPushNav({ employeePage: "list", selectedEmployeeId: null })}>
                  Back to staff directory
                </button>
              </article>
            )}
          </section>
        )}
      </main>

      {modalType === "task" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTaskId ? "Edit batch" : "Add batch"}</h3>
            <form
              className="modal-form modal-form--compact"
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
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="task-batch-date">Batch date</label>
                  <input
                    id="task-batch-date"
                    type="date"
                    value={newTask.batchDate}
                    onChange={(e) => setNewTask({ ...newTask, batchDate: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="task-title">Title</label>
                  <input
                    id="task-title"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    required
                  />
                </div>
              </div>
              {!editingTaskId && (
                <>
                  <div className="modal-field">
                    <label htmlFor="task-staff">Assigned staff</label>
                    <select
                      id="task-staff"
                      value={newTask.assignedStaff}
                      onChange={(e) => setNewTask({ ...newTask, assignedStaff: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {employeesSorted.map((emp) => (
                        <option key={emp.id} value={emp.name}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="modal-field modal-field--task-note">
                    <label htmlFor="task-note">Note</label>
                    <textarea
                      id="task-note"
                      rows={5}
                      placeholder="Initial handoff, courier, or other details…"
                      value={newTask.note}
                      onChange={(e) => setNewTask({ ...newTask, note: e.target.value })}
                    />
                  </div>
                </>
              )}
              {editingTaskId && <p className="modal-hint">Stage updates stay on the batch detail view.</p>}
              {taskModalError && <p className="form-error">{taskModalError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit">{editingTaskId ? "Save changes" : "Add batch"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFinalStepConfirm && selectedTask && (
        <div className="modal-backdrop" onClick={() => setShowFinalStepConfirm(false)}>
          <div className="modal modal--compact final-submit-modal" onClick={(e) => e.stopPropagation()}>
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
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>{editingObId ? "Edit slip" : "Add slip"}</h3>
            <form
              className="modal-form modal-form--compact"
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
                    employeeId: "",
                  });
                  await loadAll();
                } catch {
                  setBackendOffline(true);
                }
              }}
            >
              <div className="modal-field">
                <label htmlFor="ob-modal-employee">Employee name</label>
                <select
                  id="ob-modal-employee"
                  value={newSlip.employeeId || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setNewSlip({ ...newSlip, employeeId: "" });
                      return;
                    }
                    const emp = employees.find((x) => x.id === id);
                    if (!emp) return;
                    setNewSlip({
                      ...newSlip,
                      employeeId: id,
                      name: emp.name,
                      position: emp.position,
                      department: emp.department || "COMELEC",
                    });
                  }}
                >
                  <option value="">Manual entry (type below)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                <p className="modal-hint">Choose a roster employee to fill name, position, and department.</p>
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ob-slip-date">Date</label>
                  <input
                    id="ob-slip-date"
                    type="date"
                    value={newSlip.date}
                    onChange={(e) => setNewSlip({ ...newSlip, date: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ob-slip-name">Name</label>
                  <input
                    id="ob-slip-name"
                    value={newSlip.name}
                    onChange={(e) => setNewSlip({ ...newSlip, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ob-slip-position">Position</label>
                  <input
                    id="ob-slip-position"
                    value={newSlip.position}
                    onChange={(e) => setNewSlip({ ...newSlip, position: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ob-slip-dept">Department</label>
                  <input
                    id="ob-slip-dept"
                    value={newSlip.department}
                    onChange={(e) => setNewSlip({ ...newSlip, department: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="ob-slip-purpose">Purpose</label>
                <input
                  id="ob-slip-purpose"
                  value={newSlip.purpose}
                  onChange={(e) => setNewSlip({ ...newSlip, purpose: e.target.value })}
                  required
                />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ob-slip-in">Time in</label>
                  <input
                    id="ob-slip-in"
                    type="time"
                    value={newSlip.timeIn}
                    onChange={(e) => setNewSlip({ ...newSlip, timeIn: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ob-slip-out">Time out</label>
                  <input
                    id="ob-slip-out"
                    type="time"
                    value={newSlip.timeOut}
                    onChange={(e) => setNewSlip({ ...newSlip, timeOut: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit">{editingObId ? "Save changes" : "Save slip"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === "event" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEventId ? "Edit event" : "Add event"}</h3>
            <form
              className="modal-form modal-form--compact"
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
              <div className="modal-field">
                <label htmlFor="ev-title">Event title</label>
                <input
                  id="ev-title"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  required
                />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ev-date">Date</label>
                  <input
                    id="ev-date"
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ev-time">Time</label>
                  <input
                    id="ev-time"
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="ev-desc">Description (optional)</label>
                <textarea
                  id="ev-desc"
                  rows={2}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit">{editingEventId ? "Save changes" : "Add event"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === "employee" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEmployeeId ? "Edit employee" : "Add employee"}</h3>
            <form
              className="modal-form modal-form--compact"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingEmployeeId) {
                    await patchData(`/employees/${editingEmployeeId}`, newEmployee);
                  } else {
                    await postData("/employees", newEmployee);
                  }
                  closeModal();
                  setNewEmployee({
                    name: "",
                    position: "",
                    type: "full-time",
                    department: "COMELEC",
                    birthday: "",
                    email: "",
                    contactNo: "",
                    address: "",
                  });
                  await loadAll();
                } catch {
                  setBackendOffline(true);
                }
              }}
            >
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="emp-name">Full name</label>
                  <input
                    id="emp-name"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="emp-position">Position</label>
                  <input
                    id="emp-position"
                    value={newEmployee.position}
                    onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="emp-dept">Department</label>
                  <input
                    id="emp-dept"
                    value={newEmployee.department}
                    onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="emp-type">Employment type</label>
                  <select
                    id="emp-type"
                    value={newEmployee.type}
                    onChange={(e) => setNewEmployee({ ...newEmployee, type: e.target.value })}
                  >
                    <option value="full-time">Full-Time</option>
                    <option value="part-time">Part-Time</option>
                  </select>
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="emp-bday">Birthday (optional)</label>
                <input
                  id="emp-bday"
                  type="date"
                  value={newEmployee.birthday || ""}
                  onChange={(e) => setNewEmployee({ ...newEmployee, birthday: e.target.value })}
                />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="emp-email">Gmail / email (optional)</label>
                  <input
                    id="emp-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@gmail.com"
                    value={newEmployee.email || ""}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="emp-phone">Contact no. (optional)</label>
                  <input
                    id="emp-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="09XX XXX XXXX"
                    value={newEmployee.contactNo || ""}
                    onChange={(e) => setNewEmployee({ ...newEmployee, contactNo: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="emp-addr">Address (optional)</label>
                <textarea
                  id="emp-addr"
                  rows={2}
                  placeholder="Street, barangay, city"
                  value={newEmployee.address || ""}
                  onChange={(e) => setNewEmployee({ ...newEmployee, address: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
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
