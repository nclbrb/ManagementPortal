export const tabs = ["Dashboard", "Task Tracker", "OB Slip", "Event", "Employees"];

export const COMELEC_NAV_KEY = "comelec_nav_v1";

export function readStoredNav() {
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

export function normalizeNav(o) {
  if (!o || typeof o !== "object") return null;
  const legacyTab = o.tab === "Calendar" ? "Event" : o.tab;
  const tab = tabs.includes(legacyTab) ? legacyTab : "Dashboard";
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

export const initialAppNav = typeof window !== "undefined" ? normalizeNav(readStoredNav()) : null;
