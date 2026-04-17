import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import dayjs from "dayjs";
import { SOCKET_URL, apiUrl, AUTH_STORAGE_KEY, getAuthHeaders } from "./apiConfig.js";
import comelecLogo from "./assets/comelec.png";
import { jsonFetch } from "./lib/jsonFetch.js";
import { COMELEC_NAV_KEY, initialAppNav, normalizeNav, tabs } from "./lib/navStore.js";
import { TASK_STATUSES, TASK_STAGES } from "./lib/taskConstants.js";
import { buildTaskListPrintHtml } from "./tasks/buildTaskListPrintHtml.js";
import { staffInitials } from "./lib/strings.js";
import { buildObSlipPrintHtml } from "./obSlip/printObSlipHtml.js";
import { tabIcons } from "./icons/tabIcons.jsx";
import { AuthGate } from "./components/AuthGate.jsx";
import { DashboardSection } from "./components/DashboardSection.jsx";
import { EventSection } from "./components/EventSection.jsx";

function App() {
  const [activeTab, setActiveTab] = useState(() => initialAppNav?.tab ?? "Dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [tasksData, setTasksData] = useState({ statuses: TASK_STATUSES, stages: TASK_STAGES, items: [], logs: [] });
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [obSlips, setObSlips] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [modalType, setModalType] = useState("");
  const [taskViewId, setTaskViewId] = useState(null);
  const [taskPrintOpen, setTaskPrintOpen] = useState(false);
  const [printTaskRange, setPrintTaskRange] = useState({
    from: dayjs().format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
    employeeId: "all",
    status: "all",
    /** "active" | "archived" | "all" — which tasks to include on the printed sheet */
    archiveScope: "active",
  });
  /** '' | employee id | 'manual' — roster pick for task assignee field */
  const [taskAssigneePick, setTaskAssigneePick] = useState("");
  const [newTask, setNewTask] = useState({
    title: "",
    dateFrom: dayjs().format("YYYY-MM-DD"),
    dateTo: dayjs().format("YYYY-MM-DD"),
    assignee: "",
    notes: "",
    status: "In Progress",
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
    profileImage: "",
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
  const [taskDateFilter, setTaskDateFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskArchiveFilter, setTaskArchiveFilter] = useState("active");
  const [taskListPage, setTaskListPage] = useState(1);
  const [taskModalError, setTaskModalError] = useState("");
  const [obSearch, setObSearch] = useState("");
  const [obQuickRange, setObQuickRange] = useState("all");
  const [obPickDate, setObPickDate] = useState("");
  const [obArchiveScope, setObArchiveScope] = useState("active");
  const [obListPage, setObListPage] = useState(1);
  const [obSlipViewId, setObSlipViewId] = useState(null);
  const [eventViewId, setEventViewId] = useState(null);
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => initialAppNav?.selectedEmployeeId ?? null);
  const [employeePage, setEmployeePage] = useState(() => initialAppNav?.employeePage ?? "list");

  const navSnapRef = useRef({
    tab: initialAppNav?.tab ?? "Dashboard",
    employeePage: initialAppNav?.employeePage ?? "list",
    selectedEmployeeId: initialAppNav?.selectedEmployeeId ?? null,
  });
  const historyPrimedRef = useRef(false);

  useLayoutEffect(() => {
    navSnapRef.current = {
      tab: activeTab,
      employeePage,
      selectedEmployeeId,
    };
  }, [activeTab, employeePage, selectedEmployeeId]);

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
    setEmployeePage(merged.employeePage);
    setSelectedEmployeeId(merged.selectedEmployeeId);
  };

  useEffect(() => {
    const mqDesktop = window.matchMedia("(min-width: 901px)");
    const closeNavOnDesktop = () => {
      if (mqDesktop.matches) setNavOpen(false);
    };
    closeNavOnDesktop();
    mqDesktop.addEventListener("change", closeNavOnDesktop);
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      mqDesktop.removeEventListener("change", closeNavOnDesktop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /** Lock background scroll when the drawer is open (mobile / narrow). Matches CSS breakpoint max-width: 900px. */
  useEffect(() => {
    const mqNarrow = window.matchMedia("(max-width: 900px)");
    const syncBodyScrollLock = () => {
      const lock = navOpen && mqNarrow.matches;
      document.body.classList.toggle("nav-drawer-open", lock);
    };
    syncBodyScrollLock();
    mqNarrow.addEventListener("change", syncBodyScrollLock);
    return () => {
      mqNarrow.removeEventListener("change", syncBodyScrollLock);
      document.body.classList.remove("nav-drawer-open");
    };
  }, [navOpen]);

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
      setTasksData({ statuses: TASK_STATUSES, stages: TASK_STAGES, items: [], logs: [] });
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
      if (payload.tasks && typeof payload.tasks === "object" && Array.isArray(payload.tasks.items)) {
        setTasksData({
          statuses: Array.isArray(payload.tasks.statuses) ? payload.tasks.statuses : TASK_STATUSES,
          stages: Array.isArray(payload.tasks.stages) ? payload.tasks.stages : TASK_STAGES,
          items: payload.tasks.items,
          logs: Array.isArray(payload.tasks.logs) ? payload.tasks.logs : [],
        });
      }
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
  }, [authUser, activeTab, employeePage, selectedEmployeeId]);

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
        employeePage,
        selectedEmployeeId,
      });
      if (snap) window.history.replaceState({ comelec: snap }, "", "");
    }
  }, [authUser, activeTab, employeePage, selectedEmployeeId]);

  useEffect(() => {
    const onPop = (e) => {
      const n = normalizeNav(e.state?.comelec);
      if (!n) return;
      setActiveTab(n.tab);
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
    if (activeTab === "OB Slip" && obSlipViewId && !obSlips.some((s) => s.id === obSlipViewId)) {
      setObSlipViewId(null);
      setModalType("");
    }
    if (activeTab === "Event" && eventViewId && !events.some((e) => e.id === eventViewId)) {
      setEventViewId(null);
      setModalType("");
    }
    if (activeTab === "Employees" && employeePage === "detail" && selectedEmployeeId) {
      if (employees.length > 0 && !employees.some((e) => e.id === selectedEmployeeId)) {
        setEmployeePage("list");
        setSelectedEmployeeId(null);
      }
    }
  }, [
    activeTab,
    obSlipViewId,
    obSlips,
    eventViewId,
    events,
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
    setTaskViewId(null);
    setObSlipViewId(null);
    setEventViewId(null);
    setTaskAssigneePick("");
    setEditingObId(null);
    setEditingEventId(null);
    setEditingEmployeeId(null);
    setTaskModalError("");
  };

  const handleEmployeePhotoChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Please choose a valid image file.");
      return;
    }
    if (file.size > 1_600_000) {
      window.alert("Image is too large. Please use an image below 1.6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setNewEmployee((prev) => ({ ...prev, profileImage: value }));
    };
    reader.readAsDataURL(file);
  };

  const userDisplayName = useMemo(() => {
    if (!authUser || typeof authUser !== "object") return "User";
    const mail = String(authUser.email || "").trim().toLowerCase();
    const roster = employees.find((e) => String(e.email || "").trim().toLowerCase() === mail);
    const fromRoster = roster?.name?.trim();
    const fromAccount = String(authUser.name || "").trim();
    return fromRoster || fromAccount || mail || "User";
  }, [authUser, employees]);

  const employeesSorted = useMemo(
    () => [...employees].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })),
    [employees]
  );

  const resolveTaskAssigneePick = (assignee) => {
    const a = String(assignee || "").trim().toLowerCase();
    if (!a) return "";
    const match = employeesSorted.find((e) => String(e.name || "").trim().toLowerCase() === a);
    return match ? match.id : "manual";
  };

  const advanceTaskStage = async (taskId) => {
    if (!taskId) return;
    try {
      const task = tasksData.items.find((t) => t.id === taskId);
      if (!task) return;
      const currentStage = Number(task.currentStage ?? 0);
      const nextStage = Math.min(currentStage + 1, TASK_STAGES.length - 1);
      await patchData(`/tasks/${taskId}/stage`, {
        stage: nextStage,
        assignedStaff: task.assignee || "",
        note: `Stage advanced to ${TASK_STAGES[nextStage]}`,
      });
      await loadAll();
      setBackendOffline(false);
    } catch {
      setBackendOffline(true);
    }
  };

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

  const viewingTask = useMemo(
    () => (taskViewId ? tasksData.items.find((task) => task.id === taskViewId) || null : null),
    [tasksData.items, taskViewId]
  );

  const viewingObSlip = useMemo(() => obSlips.find((s) => s.id === obSlipViewId) || null, [obSlips, obSlipViewId]);

  const viewingEvent = useMemo(() => events.find((e) => e.id === eventViewId) || null, [events, eventViewId]);

  const filteredTasks = useMemo(() => {
    const filtered = tasksData.items.filter((task) => {
      const textPass = `${task.title} ${task.dateFrom || ""} ${task.dateTo || ""} ${task.assignee || ""} ${task.notes || ""}`
        .toLowerCase()
        .includes(taskSearch.toLowerCase());
      let archivePass = true;
      if (taskArchiveFilter === "active") archivePass = !task.archived;
      else if (taskArchiveFilter === "archived") archivePass = !!task.archived;
      const datePass =
        !taskDateFilter ||
        (String(task.dateFrom || "") <= taskDateFilter && String(task.dateTo || "") >= taskDateFilter);
      const statusPass = taskStatusFilter === "all" || task.status === taskStatusFilter;
      return textPass && archivePass && datePass && statusPass;
    });
    return [...filtered].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [tasksData.items, taskSearch, taskDateFilter, taskStatusFilter, taskArchiveFilter]);

  const taskSummary = useMemo(() => {
    const active = tasksData.items.filter((t) => !t.archived);
    const total = active.length;
    const completed = active.filter((t) => t.status === "Completed").length;
    const inProgress = active.filter((t) => t.status === "In Progress").length;
    const pending = active.filter((t) => t.status === "On Hold" || t.status === "Cancelled").length;
    return { total, pending, inProgress, completed };
  }, [tasksData.items]);

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
  }, [taskSearch, taskDateFilter, taskStatusFilter, taskArchiveFilter, tasksData.items.length]);

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

  const printTaskListSheet = () => {
    const { from, to, employeeId, status: printStatus, archiveScope } = printTaskRange;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      window.alert("Please enter valid dates (YYYY-MM-DD).");
      return;
    }
    if (from > to) {
      window.alert("Start date cannot be after end date.");
      return;
    }
    const emp = employeeId === "all" ? null : employeesSorted.find((e) => e.id === employeeId);
    const byEmployee = (t) => {
      if (!emp) return true;
      return String(t.assignee || "").trim().toLowerCase() === String(emp.name || "").trim().toLowerCase();
    };
    const byStatus = (t) => {
      if (printStatus === "all") return true;
      return (t.status || "In Progress") === printStatus;
    };
    const byArchive = (t) => {
      if (archiveScope === "active") return !t.archived;
      if (archiveScope === "archived") return !!t.archived;
      return true;
    };
    const archiveLabel =
      archiveScope === "active" ? "Active only" : archiveScope === "archived" ? "Archived only" : "Active + archived";
    const overlapsRange = (t) => String(t.dateFrom || "") <= to && String(t.dateTo || "") >= from;
    const rows = tasksData.items
      .filter((t) => byArchive(t) && byEmployee(t) && byStatus(t))
      .filter(overlapsRange)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map((t) => ({
        dateRange: `${t.dateFrom || "—"} - ${t.dateTo || "—"}`,
        task: t.title,
        assigned: t.assignee || "—",
        status: t.status || "In Progress",
        notes: t.notes || "",
      }));
    const logoUrl =
      typeof comelecLogo === "string" && (comelecLogo.startsWith("http://") || comelecLogo.startsWith("https://"))
        ? comelecLogo
        : comelecLogo.startsWith("data:")
        ? comelecLogo
        : new URL(comelecLogo, window.location.origin).href;
    const filterItems = [
      { label: "Date range", value: `${from} - ${to}` },
      { label: "Employee", value: employeeId === "all" ? "All" : emp?.name || "—" },
      { label: "Status", value: printStatus === "all" ? "All" : printStatus },
      { label: "Archive", value: archiveLabel },
    ];
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(
      buildTaskListPrintHtml({
        title: "Employee Task List",
        logoUrl,
        filterItems,
        rows,
      })
    );
    win.document.close();
    win.focus();
    win.addEventListener(
      "load",
      () => {
        const imgs = Array.from(win.document.images || []);
        if (imgs.length === 0) {
          win.print();
          return;
        }
        let pending = imgs.length;
        const kick = () => {
          pending -= 1;
          if (pending <= 0) win.print();
        };
        imgs.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) kick();
          else {
            img.addEventListener("load", kick, { once: true });
            img.addEventListener("error", kick, { once: true });
          }
        });
      },
      { once: true }
    );
  };

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

  const handleLogout = async () => {
    try {
      await fetch(apiUrl("/auth/logout"), { method: "POST", headers: { ...getAuthHeaders() } });
    } catch {
      /* ignore */
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthUser(false);
    setNavOpen(false);
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
        tabIndex={navOpen ? -1 : 0}
        onClick={() => setNavOpen((o) => !o)}
      >
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
      </button>

      {navOpen && (
        <div className="nav-backdrop" role="presentation" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          <div className="brand-top">
            <span className="brand-mark" aria-hidden="true">
              <img src={comelecLogo} alt="" />
            </span>
            <div>
              <h1>COMELEC Portal</h1>
              <p>Management Workspace</p>
            </div>
          </div>
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
            <p className="sidebar-user-name">{userDisplayName}</p>
            <button type="button" className="sidebar-logout" onClick={handleLogout}>
              Log out
            </button>
          </div>
          <div className="live-pill">v1.0</div>
          <div className="sidebar-devs">
            <p className="sidebar-devs-label">Developers</p>
            <p className="sidebar-devs-names">
              <span>Nicole Borabo</span>
              <span>Andrei Asnan</span>
            </p>
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
            userDisplayName={userDisplayName}
            onNavigate={selectTab}
          />
        )}

        {activeTab === "Task Tracker" && (
          <section className="tracker-layout single">
            <div className="task-tracker-page task-tracker-page--stacked">
              <header className="task-tracker-intro">
                <span className="task-tracker-eyebrow">Workflow</span>
                <h2 className="task-tracker-title">Task Tracker</h2>
                <p className="task-tracker-lede">Create tasks, assign staff, and track status from the list.</p>
              </header>

              <div className="tracker-summary tracker-summary--row">
                <article className="tracker-kpi">
                  <small>Total tasks</small>
                  <strong>{taskSummary.total}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>On hold / cancelled</small>
                  <strong>{taskSummary.pending}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>In progress</small>
                  <strong>{taskSummary.inProgress}</strong>
                </article>
                <article className="tracker-kpi">
                  <small>Completed</small>
                  <strong>{taskSummary.completed}</strong>
                </article>
              </div>

              <div className="task-tracker-filters-card">
                <div className="task-tracker-filters-label">Filter &amp; search</div>
                <div className="task-tracker-toolbar cal-app-toolbar">
                  <div className="inline-form task-tracker-filters">
                    <input
                      placeholder="Search title, dates, assignee, notes…"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                    />
                    <input type="date" value={taskDateFilter} onChange={(e) => setTaskDateFilter(e.target.value)} />
                    <select value={taskStatusFilter} className="mp-select" onChange={(e) => setTaskStatusFilter(e.target.value)}>
                      <option value="all">All statuses</option>
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select value={taskArchiveFilter} className="mp-select" onChange={(e) => setTaskArchiveFilter(e.target.value)}>
                      <option value="active">Active only</option>
                      <option value="archived">Archived only</option>
                      <option value="all">Active + archived</option>
                    </select>
                  </div>
                  <button type="button" className="task-tracker-add" onClick={() => setTaskPrintOpen(true)}>
                    Print
                  </button>
                  <button
                    type="button"
                    className="task-tracker-add"
                    onClick={() => {
                      setEditingTaskId(null);
                      setTaskAssigneePick("");
                      setNewTask({
                        title: "",
                        dateFrom: dayjs().format("YYYY-MM-DD"),
                        dateTo: dayjs().format("YYYY-MM-DD"),
                        assignee: "",
                        notes: "",
                        status: "In Progress",
                      });
                      setTaskModalError("");
                      setModalType("task");
                    }}
                  >
                    + Add Task
                  </button>
                </div>
              </div>

              <article className="task-tracker-list-card">
                <div className="task-tracker-list-heading">
                  <div>
                    <h3 className="task-tracker-list-title">Task list</h3>
                    <p className="task-tracker-list-sub">
                      {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} match your filters
                    </p>
                  </div>
                </div>
                <div className="task-list task-list-scroll task-list-scroll--roomy">
                  {filteredTasks.length === 0 ? (
                    <div className="task-empty">No tasks match your current filters.</div>
                  ) : (
                    pagedTasks.map((task) => {
                      const openTaskView = () => {
                        setTaskViewId(task.id);
                        setModalType("taskView");
                      };
                      return (
                        <div
                          className="task-item list-item task-list-item"
                          role="button"
                          tabIndex={0}
                          key={task.id}
                          onClick={openTaskView}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openTaskView();
                            }
                          }}
                        >
                          <div className="list-main">
                            <strong>{task.title}</strong>
                            <small>{`${task.dateFrom || "—"} → ${task.dateTo || "—"}`}</small>
                            {task.archived ? <span className="status-pill status-pill--muted">Archived</span> : null}
                          </div>
                          <div className="list-meta list-meta--crud" onClick={(e) => e.stopPropagation()}>
                            <select
                              className="mp-select task-styled-select"
                              aria-label="Task status"
                              value={task.status || "In Progress"}
                              onChange={async (e) => {
                                const next = e.target.value;
                                try {
                                  await patchData(`/tasks/${task.id}`, { status: next });
                                  await loadAll();
                                } catch {
                                  setBackendOffline(true);
                                }
                              }}
                            >
                              {TASK_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn-crud"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTaskId(task.id);
                                setTaskAssigneePick(resolveTaskAssigneePick(task.assignee));
                                setNewTask({
                                  title: task.title,
                                  dateFrom: task.dateFrom,
                                  dateTo: task.dateTo,
                                  assignee: task.assignee || "",
                                  notes: task.notes || "",
                                  status: task.status || "In Progress",
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
                                if (!window.confirm("Delete this task permanently?")) return;
                                try {
                                  await deleteData(`/tasks/${task.id}`);
                                  if (taskViewId === task.id) {
                                    setTaskViewId(null);
                                    setModalType("");
                                  }
                                  await loadAll();
                                } catch {
                                  setBackendOffline(true);
                                }
                              }}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              className="btn-crud"
                              onClick={async () => {
                                try {
                                  await patchData(`/tasks/${task.id}`, { archived: !task.archived });
                                  await loadAll();
                                } catch {
                                  setBackendOffline(true);
                                }
                              }}
                            >
                              {task.archived ? "Unarchive" : "Archive"}
                            </button>
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
          </section>
        )}

        {activeTab === "OB Slip" && (
          <section className="tracker-layout single">
            <div className="task-tracker-page task-tracker-page--stacked">
              <header className="task-tracker-intro">
                <span className="task-tracker-eyebrow">Documents</span>
                <h2 className="task-tracker-title">Official Business Slips</h2>
                <p className="task-tracker-lede">Click a slip for details in a modal, or use row actions to print, edit, archive, or delete.</p>
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
                        className="mp-select"
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
                      <select
                        className="mp-select"
                        value={obArchiveScope}
                        onChange={(e) => setObArchiveScope(e.target.value)}
                        aria-label="Archive filter"
                      >
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
                        const openObView = () => {
                          setObSlipViewId(s.id);
                          setModalType("obSlipView");
                        };
                        return (
                          <div
                            key={s.id}
                            className={`task-item list-item task-list-item ob-slip-row${s.archived ? " ob-slip-row--archived" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={openObView}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openObView();
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
                                className="btn-crud"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printSlip(s);
                                }}
                              >
                                Print
                              </button>
                              <button
                                type="button"
                                className="btn-crud btn-crud--danger"
                                onClick={async () => {
                                  if (!window.confirm("Delete this OB slip permanently?")) return;
                                  try {
                                    await deleteData(`/ob-slips/${s.id}`);
                                    setObExportIds((p) => p.filter((x) => x !== s.id));
                                    if (obSlipViewId === s.id) {
                                      setObSlipViewId(null);
                                      setModalType("");
                                    }
                                    await loadAll();
                                  } catch {
                                    setBackendOffline(true);
                                  }
                                }}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className="btn-crud"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await patchData(`/ob-slips/${s.id}`, { archived: !s.archived });
                                    await loadAll();
                                  } catch {
                                    setBackendOffline(true);
                                  }
                                }}
                              >
                                {s.archived ? "Unarchive" : "Archive"}
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
          </section>
        )}

        {activeTab === "Event" && (
          <section className="tracker-layout single">
            <EventSection
              eventSearch={eventSearch}
              setEventSearch={setEventSearch}
              eventFilter={eventFilter}
              setEventFilter={setEventFilter}
              calendarShowArchived={calendarShowArchived}
              setCalendarShowArchived={setCalendarShowArchived}
              eventSummary={eventSummary}
              filteredEvents={filteredEvents}
              eventViewId={eventViewId}
              setEventViewId={setEventViewId}
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
                      <select
                        className="mp-select"
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                      >
                        <option value="all">All Employees</option>
                        <option value="full-time">Full-Time</option>
                        <option value="part-time">Part-Time</option>
                      </select>
                      <select
                        className="mp-select"
                        value={employeeSort}
                        onChange={(e) => setEmployeeSort(e.target.value)}
                        aria-label="Sort employees"
                      >
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
                          profileImage: "",
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
                              {emp.profileImage ? (
                                <img className="staff-avatar staff-avatar--photo" src={emp.profileImage} alt={`${emp.name} profile`} />
                              ) : (
                                <span className="staff-avatar" aria-hidden="true">
                                  {staffInitials(emp.name)}
                                </span>
                              )}
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
                                    profileImage: emp.profileImage || "",
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
                          profileImage: selectedEmployee.profileImage || "",
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

                <div className="staff-detail-highlights">
                  <div className="staff-highlight-card staff-highlight-card--department">
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
                  <aside className="staff-profile-visual-card">
                    <h4>Profile picture</h4>
                    <div className="staff-profile-photo">
                      {selectedEmployee.profileImage ? (
                        <img
                          className="staff-profile-photo-img"
                          src={selectedEmployee.profileImage}
                          alt={`${selectedEmployee.name} profile`}
                        />
                      ) : (
                        <span className="staff-avatar staff-avatar--xl" aria-hidden="true">
                          {staffInitials(selectedEmployee.name)}
                        </span>
                      )}
                    </div>
                    <p className="staff-profile-caption">
                      Upload a profile photo in Employee form. If none is uploaded, initials are shown automatically.
                    </p>
                  </aside>

                  <div className="staff-detail-info-stack">
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
                        <div className="staff-basic-info-span">
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
            <h3>{editingTaskId ? "Edit task" : "Add task"}</h3>
            <form
              className="modal-form modal-form--compact"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingTaskId) {
                    await patchData(`/tasks/${editingTaskId}`, {
                      title: newTask.title,
                      dateFrom: newTask.dateFrom,
                      dateTo: newTask.dateTo,
                      assignee: newTask.assignee,
                      notes: newTask.notes,
                      status: newTask.status,
                    });
                  } else {
                    await postData("/tasks", {
                      title: newTask.title,
                      dateFrom: newTask.dateFrom,
                      dateTo: newTask.dateTo,
                      assignee: newTask.assignee,
                      notes: newTask.notes,
                    });
                  }
                  closeModal();
                  setNewTask({
                    title: "",
                    dateFrom: dayjs().format("YYYY-MM-DD"),
                    dateTo: dayjs().format("YYYY-MM-DD"),
                    assignee: "",
                    notes: "",
                    status: "In Progress",
                  });
                  await loadAll();
                } catch (err) {
                  const message = String(err?.message || "");
                  let userMessage = "Unable to save task. Check fields and try again.";
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
              <div className="modal-field">
                <label htmlFor="task-title">Task name / title</label>
                <input
                  id="task-title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  maxLength={120}
                  required
                />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="task-df">Date from</label>
                  <input
                    id="task-df"
                    type="date"
                    value={newTask.dateFrom}
                    onChange={(e) => setNewTask({ ...newTask, dateFrom: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="task-dt">Date to</label>
                  <input
                    id="task-dt"
                    type="date"
                    value={newTask.dateTo}
                    onChange={(e) => setNewTask({ ...newTask, dateTo: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="task-emp-select">Employee</label>
                <select
                  id="task-emp-select"
                  className="mp-select"
                  value={taskAssigneePick === "manual" ? "manual" : taskAssigneePick}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setTaskAssigneePick("");
                      setNewTask((p) => ({ ...p, assignee: "" }));
                    } else if (v === "manual") {
                      setTaskAssigneePick("manual");
                    } else {
                      const emp = employeesSorted.find((x) => x.id === v);
                      setTaskAssigneePick(v);
                      setNewTask((p) => ({ ...p, assignee: emp?.name || "" }));
                    }
                  }}
                >
                  <option value="">Choose an employee…</option>
                  {employeesSorted.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                  <option value="manual">Other — type a name below</option>
                </select>
                {taskAssigneePick === "manual" ? (
                  <input
                    id="task-assignee-manual"
                    className="task-employee-manual-input"
                    type="text"
                    value={newTask.assignee}
                    onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}
                    placeholder="Enter assignee name"
                    maxLength={120}
                    aria-label="Assignee name (manual entry)"
                  />
                ) : null}
                <p className="modal-hint">Use the roster, or Other to type a custom name.</p>
              </div>
              {editingTaskId ? (
                <div className="modal-field">
                  <label htmlFor="task-status">Status</label>
                  <select
                    id="task-status"
                    className="mp-select"
                    value={newTask.status}
                    onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="modal-hint">New tasks are created as &quot;In Progress&quot;.</p>
              )}
              <div className="modal-field modal-field--task-note">
                <label htmlFor="task-notes">Notes</label>
                <textarea
                  id="task-notes"
                  rows={5}
                  placeholder="Details, links, or context…"
                  value={newTask.notes}
                  onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                  maxLength={2000}
                />
              </div>
              {taskModalError && <p className="form-error">{taskModalError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit">{editingTaskId ? "Save changes" : "Create task"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === "taskView" && viewingTask && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>Task details</h3>
            <div className="modal-form modal-form--compact task-view-readonly-form">
              <div className="modal-field">
                <label htmlFor="task-view-title">Task name / title</label>
                <input id="task-view-title" readOnly className="task-field-readonly" value={viewingTask.title} />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="task-view-df">Date from</label>
                  <input id="task-view-df" readOnly className="task-field-readonly" type="date" value={viewingTask.dateFrom || ""} />
                </div>
                <div className="modal-field">
                  <label htmlFor="task-view-dt">Date to</label>
                  <input id="task-view-dt" readOnly className="task-field-readonly" type="date" value={viewingTask.dateTo || ""} />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="task-view-assignee">Employee</label>
                <input
                  id="task-view-assignee"
                  readOnly
                  className="task-field-readonly"
                  value={viewingTask.assignee || ""}
                  placeholder="—"
                />
              </div>
              <div className="modal-field">
                <label htmlFor="task-view-stage">Stage</label>
                <input
                  id="task-view-stage"
                  readOnly
                  className="task-field-readonly"
                  value={TASK_STAGES[Number(viewingTask.currentStage ?? 0)] || "In Progress"}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="task-view-status">Status</label>
                <input
                  id="task-view-status"
                  readOnly
                  className="task-field-readonly"
                  value={viewingTask.status || "In Progress"}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="task-view-updated">Last updated</label>
                <input
                  id="task-view-updated"
                  readOnly
                  className="task-field-readonly"
                  value={viewingTask.updatedAt ? dayjs(viewingTask.updatedAt).format("MMM D, YYYY h:mm A") : "—"}
                />
              </div>
              <div className="modal-field modal-field--task-note">
                <label htmlFor="task-view-notes">Notes</label>
                <textarea
                  id="task-view-notes"
                  readOnly
                  className="task-field-readonly"
                  rows={5}
                  value={viewingTask.notes?.trim() ? viewingTask.notes : ""}
                  placeholder="No notes."
                />
              </div>
              {viewingTask.archived ? <p className="modal-hint">This task is archived.</p> : null}
              <div className="modal-actions modal-actions--task-view">
                {!viewingTask.archived && Number(viewingTask.currentStage ?? 0) < TASK_STAGES.length - 1 ? (
                  <button type="button" className="btn-crud" onClick={() => advanceTaskStage(viewingTask.id)}>
                    Advance to {TASK_STAGES[Number(viewingTask.currentStage ?? 0) + 1]}
                  </button>
                ) : null}
                <button type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalType === "obSlipView" && viewingObSlip && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>OB slip details</h3>
            <div className="modal-form modal-form--compact task-view-readonly-form">
              <div className="modal-field">
                <label htmlFor="ob-view-name">Name</label>
                <input id="ob-view-name" readOnly className="task-field-readonly" value={viewingObSlip.name || ""} />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ob-view-date">Date</label>
                  <input
                    id="ob-view-date"
                    readOnly
                    className="task-field-readonly"
                    type="date"
                    value={viewingObSlip.date || ""}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ob-view-dept">Department</label>
                  <input
                    id="ob-view-dept"
                    readOnly
                    className="task-field-readonly"
                    value={viewingObSlip.department || "COMELEC"}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="ob-view-pos">Position</label>
                <input id="ob-view-pos" readOnly className="task-field-readonly" value={viewingObSlip.position || ""} />
              </div>
              <div className="modal-field">
                <label htmlFor="ob-view-purpose">Purpose</label>
                <textarea
                  id="ob-view-purpose"
                  readOnly
                  className="task-field-readonly"
                  rows={3}
                  value={viewingObSlip.purpose || ""}
                  placeholder="—"
                />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ob-view-ti">Time in</label>
                  <input
                    id="ob-view-ti"
                    readOnly
                    className="task-field-readonly"
                    type="time"
                    value={viewingObSlip.timeIn || ""}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ob-view-to">Time out</label>
                  <input
                    id="ob-view-to"
                    readOnly
                    className="task-field-readonly"
                    type="time"
                    value={viewingObSlip.timeOut || ""}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="ob-view-emp">Linked employee (roster)</label>
                <input
                  id="ob-view-emp"
                  readOnly
                  className="task-field-readonly"
                  value={
                    viewingObSlip.employeeId
                      ? employeesSorted.find((e) => e.id === viewingObSlip.employeeId)?.name || "—"
                      : "—"
                  }
                  placeholder="—"
                />
              </div>
              {viewingObSlip.archived ? <p className="modal-hint">This slip is archived.</p> : null}
              <div className="modal-actions modal-actions--task-view">
                <button type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalType === "eventView" && viewingEvent && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>Event details</h3>
            <div className="modal-form modal-form--compact task-view-readonly-form">
              <div className="modal-field">
                <label htmlFor="ev-view-title">Event title</label>
                <input id="ev-view-title" readOnly className="task-field-readonly" value={viewingEvent.title || ""} />
              </div>
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="ev-view-date">Date</label>
                  <input
                    id="ev-view-date"
                    readOnly
                    className="task-field-readonly"
                    type="date"
                    value={viewingEvent.date || ""}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ev-view-time">Time</label>
                  <input
                    id="ev-view-time"
                    readOnly
                    className="task-field-readonly"
                    type="time"
                    value={viewingEvent.time || "09:00"}
                  />
                </div>
              </div>
              <div className="modal-field modal-field--task-note">
                <label htmlFor="ev-view-desc">Description</label>
                <textarea
                  id="ev-view-desc"
                  readOnly
                  className="task-field-readonly"
                  rows={4}
                  value={viewingEvent.description?.trim() ? viewingEvent.description : ""}
                  placeholder="No description."
                />
              </div>
              <div className="modal-field">
                <label htmlFor="ev-view-status">Status</label>
                <input
                  id="ev-view-status"
                  readOnly
                  className="task-field-readonly"
                  value={viewingEvent.archived ? "Archived" : "Scheduled"}
                />
              </div>
              {viewingEvent.archived ? <p className="modal-hint">This event is archived.</p> : null}
              <div className="modal-actions modal-actions--task-view">
                <button type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {taskPrintOpen && (
        <div className="modal-backdrop" onClick={() => setTaskPrintOpen(false)}>
          <div className="modal modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3>Print task list</h3>
            <p className="modal-hint">
              Only tasks whose date range overlaps your selected period are included. Filters apply together.
            </p>
            <div className="modal-form modal-form--compact">
              <div className="modal-field-row">
                <div className="modal-field">
                  <label htmlFor="print-t-from">From</label>
                  <input
                    id="print-t-from"
                    type="date"
                    value={printTaskRange.from}
                    onChange={(e) => setPrintTaskRange((p) => ({ ...p, from: e.target.value }))}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="print-t-to">To</label>
                  <input
                    id="print-t-to"
                    type="date"
                    value={printTaskRange.to}
                    onChange={(e) => setPrintTaskRange((p) => ({ ...p, to: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="print-t-emp">Employee</label>
                <select
                  id="print-t-emp"
                  className="mp-select"
                  value={printTaskRange.employeeId}
                  onChange={(e) => setPrintTaskRange((p) => ({ ...p, employeeId: e.target.value }))}
                >
                  <option value="all">All employees</option>
                  {employeesSorted.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label htmlFor="print-t-status">Status</label>
                <select
                  id="print-t-status"
                  className="mp-select"
                  value={printTaskRange.status}
                  onChange={(e) => setPrintTaskRange((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="all">All statuses</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label htmlFor="print-t-archive">Tasks</label>
                <select
                  id="print-t-archive"
                  className="mp-select"
                  value={printTaskRange.archiveScope}
                  onChange={(e) => setPrintTaskRange((p) => ({ ...p, archiveScope: e.target.value }))}
                >
                  <option value="active">Active only</option>
                  <option value="all">Active + archived</option>
                  <option value="archived">Archived only</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setTaskPrintOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="task-tracker-add"
                onClick={() => {
                  printTaskListSheet();
                  setTaskPrintOpen(false);
                }}
              >
                Print
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
                  className="mp-select"
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
                    maxLength={80}
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
                    maxLength={60}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="ob-slip-dept">Department</label>
                  <input
                    id="ob-slip-dept"
                    value={newSlip.department}
                    onChange={(e) => setNewSlip({ ...newSlip, department: e.target.value })}
                    maxLength={60}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="ob-slip-purpose">Purpose</label>
                <input
                  id="ob-slip-purpose"
                  value={newSlip.purpose}
                  onChange={(e) => setNewSlip({ ...newSlip, purpose: e.target.value })}
                  maxLength={140}
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
                  maxLength={80}
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
                  maxLength={180}
                />
              </div>
              {editingEventId ? (
                (() => {
                  const evLive = events.find((e) => e.id === editingEventId);
                  if (!evLive) return null;
                  return (
                    <div className="modal-event-manage">
                      {!evLive.archived ? (
                        <button
                          type="button"
                          className="btn-text modal-event-manage-btn"
                          onClick={async () => {
                            try {
                              await patchData(`/events/${editingEventId}`, { archived: true });
                              await loadAll();
                              closeModal();
                            } catch {
                              setBackendOffline(true);
                            }
                          }}
                        >
                          Archive event
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-text modal-event-manage-btn"
                          onClick={async () => {
                            try {
                              await patchData(`/events/${editingEventId}`, { archived: false });
                              await loadAll();
                              closeModal();
                            } catch {
                              setBackendOffline(true);
                            }
                          }}
                        >
                          Restore event
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-text modal-event-manage-btn modal-event-manage-btn--danger"
                        onClick={async () => {
                          if (!window.confirm("Delete this event permanently?")) return;
                          try {
                            await deleteData(`/events/${editingEventId}`);
                            closeModal();
                            await loadAll();
                          } catch {
                            setBackendOffline(true);
                          }
                        }}
                      >
                        Delete event
                      </button>
                    </div>
                  );
                })()
              ) : null}
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
                    profileImage: "",
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
                    maxLength={80}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="emp-position">Position</label>
                  <input
                    id="emp-position"
                    value={newEmployee.position}
                    onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                    maxLength={60}
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
                    maxLength={60}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="emp-type">Employment type</label>
                  <select
                    id="emp-type"
                    className="mp-select"
                    value={newEmployee.type}
                    onChange={(e) => setNewEmployee({ ...newEmployee, type: e.target.value })}
                  >
                    <option value="full-time">Full-Time</option>
                    <option value="part-time">Part-Time</option>
                  </select>
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="emp-photo">Profile photo (optional)</label>
                <input
                  id="emp-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  onChange={(e) => handleEmployeePhotoChange(e.target.files?.[0])}
                />
                {newEmployee.profileImage ? (
                  <div className="employee-photo-preview-wrap">
                    <img className="employee-photo-preview" src={newEmployee.profileImage} alt="Employee preview" />
                    <button
                      type="button"
                      className="btn-crud btn-crud--danger"
                      onClick={() => setNewEmployee((prev) => ({ ...prev, profileImage: "" }))}
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <p className="modal-hint">Accepted: PNG, JPG, WEBP, GIF. Max size: 1.6 MB.</p>
                )}
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
                    maxLength={90}
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
                    maxLength={20}
                    pattern="[0-9+()\\-\\s]{7,20}"
                    inputMode="tel"
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
                  maxLength={160}
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
