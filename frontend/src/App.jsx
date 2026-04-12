import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import dayjs from "dayjs";
import { SOCKET_URL, apiUrl, AUTH_STORAGE_KEY, getAuthHeaders } from "./apiConfig.js";
import comelecLogo from "./assets/comelec.png";
import { jsonFetch } from "./lib/jsonFetch.js";
import { COMELEC_NAV_KEY, initialAppNav, normalizeNav, tabs } from "./lib/navStore.js";
import { staffInitials } from "./lib/strings.js";
import { buildObSlipPrintHtml } from "./obSlip/printObSlipHtml.js";
import { tabIcons } from "./icons/tabIcons.jsx";
import { AuthGate } from "./components/AuthGate.jsx";
import { DashboardSection } from "./components/DashboardSection.jsx";
import { EventSection } from "./components/EventSection.jsx";

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
        onClick={() => setNavOpen((o) => !o)}
      >
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
      </button>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}

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
            taskLogs={tasksData.logs || []}
            userDisplayName={userDisplayName}
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
                  <div className="task-tracker-toolbar cal-app-toolbar">
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
                <div className="ob-slip-info-hero">
                  <div className="ob-slip-info-hero-text">
                    <p className="ob-slip-info-eyebrow">Official Business Slip</p>
                    <h3 className="ob-slip-info-name">{selectedObSlip.name}</h3>
                    <p className="ob-slip-info-sub">{selectedObSlip.position}</p>
                    <div className="ob-slip-info-chips">
                      <span className="ob-slip-info-chip">{selectedObSlip.department || "COMELEC"}</span>
                      <span className="ob-slip-info-chip ob-slip-info-chip--date">{selectedObSlip.date}</span>
                      <span
                        className={`status-pill${selectedObSlip.archived ? " status-pill--muted" : ""}`}
                        title={selectedObSlip.archived ? "Archived slip" : "Active slip"}
                      >
                        {selectedObSlip.archived ? "Archived" : "Active"}
                      </span>
                    </div>
                  </div>
                  <div className="panel-head-actions ob-slip-info-hero-actions">
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

                <div className="ob-slip-info-layout">
                  <section className="ob-slip-info-card">
                    <h4 className="ob-slip-info-card-title">Schedule</h4>
                    <dl className="ob-slip-info-dl">
                      <div>
                        <dt>Time in</dt>
                        <dd>{selectedObSlip.timeIn}</dd>
                      </div>
                      <div>
                        <dt>Time out</dt>
                        <dd>{selectedObSlip.timeOut}</dd>
                      </div>
                      {selectedObSlip.createdAt ? (
                        <div className="ob-slip-info-dl-span">
                          <dt>Recorded in system</dt>
                          <dd>{dayjs(selectedObSlip.createdAt).format("MMM D, YYYY h:mm A")}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>
                  <section className="ob-slip-info-card">
                    <h4 className="ob-slip-info-card-title">Record</h4>
                    <dl className="ob-slip-info-dl">
                      <div className="ob-slip-info-dl-span">
                        <dt>Employee / staff ID</dt>
                        <dd>{selectedObSlip.employeeId?.trim() || "—"}</dd>
                      </div>
                      <div className="ob-slip-info-dl-span">
                        <dt>Slip ID</dt>
                        <dd className="ob-slip-info-mono">{selectedObSlip.id}</dd>
                      </div>
                    </dl>
                  </section>
                  <section className="ob-slip-info-card ob-slip-info-card--purpose">
                    <h4 className="ob-slip-info-card-title">Purpose of travel / business</h4>
                    <p className="ob-slip-info-purpose">{selectedObSlip.purpose}</p>
                  </section>
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
                    maxLength={80}
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
                      maxLength={240}
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
