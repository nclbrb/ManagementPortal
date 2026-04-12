const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { initSqlite, loadState, saveState, migrateFromJsonIfEmpty } = require("./sqlite-store");
const dayjs = require("dayjs");
const Holidays = require("date-holidays");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Philippines national calendar — `date-holidays` country code PH */
const phHolidays = new Holidays("PH");

function getPhilippinesHolidayRollup() {
  const y = dayjs().year();
  const out = [];
  for (let yr = y - 1; yr <= y + 2; yr++) {
    const rows = phHolidays.getHolidays(yr);
    if (!rows) continue;
    for (const row of rows) {
      const t = row.type || "public";
      if (t !== "public" && t !== "bank") continue;
      const raw = row.date instanceof Date ? row.date : new Date(row.date);
      if (Number.isNaN(raw.getTime())) continue;
      out.push({
        date: dayjs(raw).format("YYYY-MM-DD"),
        name: row.name || "Holiday",
        type: t,
      });
    }
  }
  const seen = new Set();
  return out.filter((h) => {
    const k = `${h.date}|${h.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function activeEvent(e) {
  return !e.archived;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 4000;
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, "comelec.db");
const LEGACY_JSON_PATH = path.join(__dirname, "data.json");
const uploadsDir = path.join(__dirname, "uploads");
const upload = multer({ dest: uploadsDir });

// Allow browser dev servers (Vite, preview, etc.) — reflect request Origin
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

const taskStages = [
  "Collected",
  "For Verification",
  "For Correction",
  "Organized by Precinct (Alphabetical)",
  "For Approval",
  "Final Filing",
];

const db = {
  data: {
    employees: [],
    events: [],
    obSlips: [],
    tasks: [],
    taskLogs: [],
    users: [],
    sessions: [],
  },
  async read() {
    const s = loadState();
    this.data.employees = s.employees;
    this.data.events = s.events;
    this.data.obSlips = s.obSlips;
    this.data.tasks = s.tasks;
    this.data.taskLogs = s.taskLogs;
    this.data.users = s.users;
    this.data.sessions = s.sessions;
  },
  async write() {
    saveState(this.data);
  },
};

function todayDate() {
  return dayjs().format("YYYY-MM-DD");
}

function pushTaskLog(action, task, details = {}) {
  db.data.taskLogs ||= [];
  db.data.taskLogs.push({
    id: uuid(),
    at: new Date().toISOString(),
    action,
    taskId: task?.id || "",
    batchTitle: task?.title || "",
    batchDate: task?.batchDate || "",
    details,
  });
  if (db.data.taskLogs.length > 300) {
    db.data.taskLogs = db.data.taskLogs.slice(-300);
  }
}

function csvEscape(val) {
  const str = String(val ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function guessCsvDelimiter(sample) {
  const first = String(sample).split(/\r?\n/)[0] || "";
  const commas = (first.match(/,/g) || []).length;
  const semis = (first.match(/;/g) || []).length;
  const tabs = (first.match(/\t/g) || []).length;
  if (tabs > 0 && tabs >= commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/** Minimal delimited parser (supports quoted fields). */
function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = String(text).replace(/^\uFEFF/, "");
  const delim = delimiter;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function normalizeCsvHeaderLabel(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[\s_]+/g, "");
}

const OB_HEADER_FIELD = {
  date: "date",
  name: "name",
  position: "position",
  department: "department",
  purpose: "purpose",
  timein: "timeIn",
  timeout: "timeOut",
  archived: "archived",
};

/** Positional rows: archived is last column, or column 8 when legacy files had EmployeeId before Archived. */
function positionalArchivedFromRow(row) {
  const c8 = String(row[8] ?? "").trim();
  if (/^(true|false|1|0|yes|no)$/i.test(c8)) return /^(true|1|yes)$/i.test(c8);
  const c7 = String(row[7] ?? "").trim();
  return /^(true|1|yes)$/i.test(c7);
}

function mapObHeaderRow(headerCells) {
  const col = {};
  for (let i = 0; i < headerCells.length; i++) {
    const field = OB_HEADER_FIELD[normalizeCsvHeaderLabel(headerCells[i])];
    if (field) col[field] = i;
  }
  return col;
}

function looksLikeObHeaderRow(cells) {
  const keys = new Set(cells.map((c) => normalizeCsvHeaderLabel(c)).filter(Boolean));
  return keys.has("date") && keys.has("name");
}

function obCell(row, colMap, field, fallbackIndex) {
  const i = colMap[field];
  if (i != null && i >= 0 && i < row.length) return String(row[i] ?? "").trim();
  if (fallbackIndex != null && fallbackIndex >= 0 && fallbackIndex < row.length) return String(row[fallbackIndex] ?? "").trim();
  return "";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hashBuf = crypto.scryptSync(String(password), salt, 64);
  return { salt, hash: hashBuf.toString("hex") };
}

function verifyPassword(password, salt, hashHex) {
  try {
    const hashBuf = Buffer.from(hashHex, "hex");
    const verifyBuf = crypto.scryptSync(String(password), salt, 64);
    if (hashBuf.length !== verifyBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, verifyBuf);
  } catch {
    return false;
  }
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(\S+)/i);
    if (!m) return res.status(401).json({ error: "Sign in required." });
    await db.read();
    db.data.sessions ||= [];
    const token = m[1].trim();
    const sess = db.data.sessions.find((s) => s.token === token);
    if (!sess) return res.status(401).json({ error: "Session expired." });
    const user = db.data.users.find((u) => u.id === sess.userId);
    if (!user) return res.status(401).json({ error: "User not found." });
    req.authUser = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}

async function bootstrap() {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  initSqlite(SQLITE_PATH);
  migrateFromJsonIfEmpty(LEGACY_JSON_PATH);
  await db.read();
  db.data ||= { employees: [], events: [], obSlips: [], tasks: [], taskLogs: [], users: [], sessions: [] };
  db.data.taskLogs ||= [];
  db.data.users ||= [];
  db.data.sessions ||= [];

  for (const ev of db.data.events) {
    if (ev.archived === undefined) ev.archived = false;
  }
  for (const emp of db.data.employees) {
    if (emp.birthday === undefined) emp.birthday = "";
    if (emp.email === undefined) emp.email = "";
    if (emp.contactNo === undefined) emp.contactNo = "";
    if (emp.address === undefined) emp.address = "";
    if (emp.profileImage === undefined) emp.profileImage = "";
  }
  for (const slip of db.data.obSlips) {
    if (slip.archived === undefined) slip.archived = false;
    if (slip.employeeId === undefined) slip.employeeId = "";
  }
  // Keep employee list empty on first run; do not inject sample names.
  // No seed tasks — empty `tasks` stays empty until users create batches.

  await db.write();
}

function emitRealtime() {
  io.emit("realtime:update", {
    dashboard: getDashboardData(),
    tasks: db.data.tasks,
    employees: db.data.employees,
    events: db.data.events,
    obSlips: db.data.obSlips,
    holidays: getPhilippinesHolidayRollup(),
    holidaysGeneratedAt: new Date().toISOString(),
  });
}

function getDashboardData() {
  const today = todayDate();
  const now = dayjs();

  const taskTotals = db.data.tasks.reduce(
    (acc, task) => {
      acc.total += 1;
      if (task.currentStage === taskStages.length - 1) acc.completed += 1;
      else acc.inProgress += 1;
      return acc;
    },
    { total: 0, inProgress: 0, completed: 0 }
  );

  const byStage = taskStages.map((label, stageIndex) => ({
    stageIndex,
    label,
    count: db.data.tasks.filter((t) => t.currentStage === stageIndex).length,
  }));

  const totalTasks = taskTotals.total || 1;
  const tasksByStage = byStage.map((row) => ({
    ...row,
    pct: Math.round((row.count / totalTasks) * 1000) / 10,
  }));

  let avgPipelinePct = 0;
  if (db.data.tasks.length > 0) {
    const sum = db.data.tasks.reduce((s, t) => s + (t.currentStage + 1) / taskStages.length, 0);
    avgPipelinePct = Math.round((sum / db.data.tasks.length) * 1000) / 10;
  }

  const completionRate =
    taskTotals.total > 0 ? Math.round((taskTotals.completed / taskTotals.total) * 1000) / 10 : 0;

  const inCorrection = db.data.tasks.filter((t) => t.currentStage === 2).length;

  const employeesByType = db.data.employees.reduce(
    (acc, e) => {
      if (e.type === "part-time") acc.partTime += 1;
      else acc.fullTime += 1;
      return acc;
    },
    { fullTime: 0, partTime: 0 }
  );

  const weekStart = now.subtract(6, "day").format("YYYY-MM-DD");
  const obActive = (s) => !s.archived;
  const weekOBSlips = db.data.obSlips.filter((s) => obActive(s) && s.date >= weekStart && s.date <= today).length;
  const holidayRows = getPhilippinesHolidayRollup();
  const weekHolidayCount = holidayRows.filter((h) => h.date >= weekStart && h.date <= today).length;
  const weekEventCount = db.data.events.filter((e) => activeEvent(e) && e.date >= weekStart && e.date <= today).length;
  const weekEvents = weekEventCount + weekHolidayCount;

  const upcomingEvents = db.data.events
    .filter((e) => activeEvent(e) && e.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 6)
    .map((e) => {
      const d = dayjs(e.date);
      return {
        id: e.id,
        title: e.title,
        date: e.date,
        time: e.time || "",
        description: e.description || "",
        isToday: e.date === today,
        dayLabel: d.format("ddd"),
        dateLabel: d.format("MMM D"),
      };
    });

  const activityFeed = [];
  for (const task of db.data.tasks) {
    for (const u of task.updates || []) {
      activityFeed.push({
        id: `${task.id}-${u.at}`,
        batchTitle: task.title,
        stageLabel: taskStages[u.stage] || `Stage ${u.stage}`,
        stageIndex: u.stage,
        at: u.at,
        note: (u.note || "").slice(0, 160),
        assignedStaff: u.assignedStaff || "",
      });
    }
  }
  activityFeed.sort((a, b) => new Date(b.at) - new Date(a.at));
  const recentActivity = activityFeed.slice(0, 14);

  const insights = [];
  if (inCorrection > 0) {
    insights.push({
      type: "warning",
      text: `${inCorrection} batch${inCorrection > 1 ? "es" : ""} in Correction — review before advancing.`,
    });
  }
  if (taskTotals.inProgress > 0 && completionRate >= 50) {
    insights.push({
      type: "positive",
      text: `${completionRate}% of batches reached Final Filing. Keep the pipeline moving.`,
    });
  }
  const todayHolidayCount = holidayRows.filter((h) => h.date === today).length;
  const todayActiveEvents = db.data.events.filter((e) => activeEvent(e) && e.date === today).length;
  const todayEventsCombined = todayActiveEvents + todayHolidayCount;
  if (todayActiveEvents > 0) {
    insights.push({
      type: "info",
      text: `You have ${todayActiveEvents} calendar event(s) today.`,
    });
  }

  return {
    employees: db.data.employees.length,
    employeesByType,
    todayEvents: todayEventsCombined,
    todayOBSlips: db.data.obSlips.filter((s) => obActive(s) && s.date === today).length,
    weekOBSlips,
    weekEvents,
    todayHolidays: todayHolidayCount,
    weekHolidays: weekHolidayCount,
    tasks: taskTotals,
    tasksByStage,
    completionRate,
    avgPipelinePct,
    inCorrection,
    upcomingEvents,
    recentActivity,
    insights,
    recentTasks: db.data.tasks.slice(-5).reverse(),
    generatedAt: new Date().toISOString(),
  };
}

const publicApiPaths = new Set(["/api/health", "/api/auth/signup", "/api/auth/login"]);

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  if (req.method === "OPTIONS") return next();
  if (publicApiPaths.has(req.path)) return next();
  return requireAuth(req, res, next);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "comelec-api", port: PORT });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const em = String(email || "").trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return res.status(400).json({ error: "Valid email is required." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    await db.read();
    db.data.users ||= [];
    if (db.data.users.some((u) => String(u.email).toLowerCase() === em)) {
      return res.status(400).json({ error: "That email is already registered." });
    }
    const { salt, hash } = hashPassword(password);
    const user = {
      id: uuid(),
      email: em,
      salt,
      passwordHash: hash,
      name: String(name || "").trim() || em.split("@")[0],
      createdAt: new Date().toISOString(),
    };
    db.data.users.push(user);
    const token = newSessionToken();
    db.data.sessions ||= [];
    db.data.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    if (db.data.sessions.length > 400) db.data.sessions = db.data.sessions.slice(-400);
    await db.write();
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const em = String(email || "").trim().toLowerCase();
    await db.read();
    const user = db.data.users.find((u) => String(u.email).toLowerCase() === em);
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = newSessionToken();
    db.data.sessions ||= [];
    db.data.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    if (db.data.sessions.length > 400) db.data.sessions = db.data.sessions.slice(-400);
    await db.write();
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not sign in." });
  }
});

app.get("/api/auth/me", (req, res) => {
  res.json(req.authUser);
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const m = (req.headers.authorization || "").match(/^Bearer\s+(\S+)/i);
    if (!m) return res.status(400).json({ error: "No session token." });
    const token = m[1].trim();
    await db.read();
    db.data.sessions = (db.data.sessions || []).filter((s) => s.token !== token);
    await db.write();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not sign out." });
  }
});

app.get("/api/dashboard", async (_req, res) => {
  await db.read();
  res.json(getDashboardData());
});

app.get("/api/holidays", async (_req, res) => {
  res.json({
    country: "PH",
    holidays: getPhilippinesHolidayRollup(),
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/employees", async (req, res) => {
  await db.read();
  const { type } = req.query;
  const list = type ? db.data.employees.filter((e) => e.type === type) : db.data.employees;
  res.json(list);
});

app.post("/api/employees", async (req, res) => {
  await db.read();
  const { name, position, type, department = "COMELEC", birthday, email, contactNo, address, profileImage } = req.body;
  const normalizedProfileImage = profileImage != null ? String(profileImage).trim() : "";
  if (normalizedProfileImage && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalizedProfileImage)) {
    return res.status(400).json({ error: "Profile image must be a valid image data URL." });
  }
  if (normalizedProfileImage.length > 2_200_000) {
    return res.status(400).json({ error: "Profile image is too large. Please use a smaller file." });
  }
  const employee = {
    id: uuid(),
    name: String(name || "").trim(),
    position: String(position || "").trim(),
    type,
    department: String(department || "").trim() || "COMELEC",
    birthday: birthday != null && String(birthday).trim() ? String(birthday).trim() : "",
    email: email != null ? String(email).trim() : "",
    contactNo: contactNo != null ? String(contactNo).trim() : "",
    address: address != null ? String(address).trim() : "",
    profileImage: normalizedProfileImage,
  };
  db.data.employees.push(employee);
  await db.write();
  emitRealtime();
  res.status(201).json(employee);
});

app.patch("/api/employees/:id", async (req, res) => {
  await db.read();
  const emp = db.data.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: "Employee not found." });
  const { name, position, type, department, birthday, email, contactNo, address, profileImage } = req.body;
  if (name !== undefined) emp.name = String(name).trim();
  if (position !== undefined) emp.position = String(position).trim();
  if (type !== undefined) {
    if (type !== "full-time" && type !== "part-time") {
      return res.status(400).json({ error: "type must be full-time or part-time." });
    }
    emp.type = type;
  }
  if (department !== undefined) emp.department = String(department).trim() || "COMELEC";
  if (birthday !== undefined) {
    const b = String(birthday).trim();
    if (b && !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
      return res.status(400).json({ error: "Birthday must be YYYY-MM-DD or empty." });
    }
    emp.birthday = b;
  }
  if (email !== undefined) emp.email = String(email).trim();
  if (contactNo !== undefined) emp.contactNo = String(contactNo).trim();
  if (address !== undefined) emp.address = String(address).trim();
  if (profileImage !== undefined) {
    const normalizedProfileImage = profileImage != null ? String(profileImage).trim() : "";
    if (normalizedProfileImage && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalizedProfileImage)) {
      return res.status(400).json({ error: "Profile image must be a valid image data URL." });
    }
    if (normalizedProfileImage.length > 2_200_000) {
      return res.status(400).json({ error: "Profile image is too large. Please use a smaller file." });
    }
    emp.profileImage = normalizedProfileImage;
  }
  await db.write();
  emitRealtime();
  res.json(emp);
});

app.delete("/api/employees/:id", async (req, res) => {
  await db.read();
  const idx = db.data.employees.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Employee not found." });
  db.data.employees.splice(idx, 1);
  await db.write();
  emitRealtime();
  res.status(204).end();
});

app.get("/api/events", async (_req, res) => {
  await db.read();
  res.json(db.data.events);
});

app.post("/api/events", async (req, res) => {
  await db.read();
  const { title, date, time, description = "" } = req.body;
  const event = { id: uuid(), title, date, time, description };
  db.data.events.push(event);
  await db.write();
  emitRealtime();
  res.status(201).json(event);
});

app.patch("/api/events/:id", async (req, res) => {
  await db.read();
  const ev = db.data.events.find((e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: "Event not found." });
  const { title, date, time, description, archived } = req.body;
  if (title !== undefined) ev.title = String(title).trim();
  if (date !== undefined) ev.date = String(date).trim();
  if (time !== undefined) ev.time = String(time).trim();
  if (description !== undefined) ev.description = String(description);
  if (archived !== undefined) ev.archived = Boolean(archived);
  await db.write();
  emitRealtime();
  res.json(ev);
});

app.delete("/api/events/:id", async (req, res) => {
  await db.read();
  const idx = db.data.events.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Event not found." });
  db.data.events.splice(idx, 1);
  await db.write();
  emitRealtime();
  res.status(204).end();
});

app.get("/api/ob-slips", async (_req, res) => {
  await db.read();
  res.json(db.data.obSlips);
});

app.post("/api/ob-slips", async (req, res) => {
  await db.read();
  const {
    date = todayDate(),
    name,
    position,
    department = "COMELEC",
    purpose,
    timeIn,
    timeOut,
  } = req.body;

  const slip = { id: uuid(), date, name, position, department, purpose, timeIn, timeOut, createdAt: new Date().toISOString() };
  db.data.obSlips.push(slip);
  await db.write();
  emitRealtime();
  res.status(201).json(slip);
});

app.patch("/api/ob-slips/:id", async (req, res) => {
  await db.read();
  const slip = db.data.obSlips.find((s) => s.id === req.params.id);
  if (!slip) return res.status(404).json({ error: "OB slip not found." });
  const { date, name, position, department, purpose, timeIn, timeOut, archived, employeeId } = req.body;
  if (date !== undefined) slip.date = String(date).trim();
  if (name !== undefined) slip.name = String(name).trim();
  if (position !== undefined) slip.position = String(position).trim();
  if (department !== undefined) slip.department = String(department).trim() || "COMELEC";
  if (purpose !== undefined) slip.purpose = String(purpose).trim();
  if (timeIn !== undefined) slip.timeIn = String(timeIn).trim();
  if (timeOut !== undefined) slip.timeOut = String(timeOut).trim();
  if (archived !== undefined) slip.archived = Boolean(archived);
  if (employeeId !== undefined) slip.employeeId = String(employeeId || "").trim();
  await db.write();
  emitRealtime();
  res.json(slip);
});

app.delete("/api/ob-slips/:id", async (req, res) => {
  await db.read();
  const idx = db.data.obSlips.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "OB slip not found." });
  db.data.obSlips.splice(idx, 1);
  await db.write();
  emitRealtime();
  res.status(204).end();
});

app.get("/api/ob-slips/export-excel", async (req, res) => {
  await db.read();
  let slips = db.data.obSlips;
  const rawIds = req.query.ids;
  if (rawIds != null && String(rawIds).trim()) {
    const idSet = new Set(
      String(rawIds)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    );
    slips = db.data.obSlips.filter((s) => idSet.has(s.id));
    if (slips.length === 0) {
      return res.status(400).json({ error: "No slips match the selected IDs." });
    }
  }
  const headers = ["Date", "Name", "Position", "Department", "Purpose", "Time In", "Time Out", "Archived"];
  const lines = [
    headers.join(","),
    ...slips.map((s) =>
      [s.date, s.name, s.position, s.department, s.purpose, s.timeIn, s.timeOut, s.archived ? "true" : "false"].map(csvEscape).join(",")
    ),
  ];
  const bom = "\uFEFF";
  const body = bom + lines.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="ob-slips.csv"');
  res.send(body);
});

app.post("/api/ob-slips/import-excel", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const ext = path.extname(req.file.originalname || "").toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
    return res.status(400).json({
      error:
        "Import a delimited text file (.csv). In Excel: File → Save As → CSV (UTF-8). Comma, semicolon, or tab separators are accepted, and column order can match Export or use the header row (Date, Name, …).",
    });
  }
  await db.read();
  let text;
  try {
    text = fs.readFileSync(req.file.path, "utf8");
  } finally {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
  }
  const delim = guessCsvDelimiter(text);
  const rows = parseDelimited(text, delim);
  if (rows.length === 0) return res.status(400).json({ error: "File is empty." });

  let startIdx = 0;
  let colMap = {};
  if (rows.length && looksLikeObHeaderRow(rows[0])) {
    colMap = mapObHeaderRow(rows[0]);
    startIdx = 1;
  } else if (rows.length && /^date$/i.test(String(rows[0][0] ?? "").trim())) {
    startIdx = 1;
  }

  const dataRows = rows.slice(startIdx);

  const added = [];
  for (const row of dataRows) {
    if (!row || row.every((c) => !String(c ?? "").trim())) continue;
    const archived =
      colMap.archived != null
        ? /^(true|1|yes)$/i.test(obCell(row, colMap, "archived", null))
        : positionalArchivedFromRow(row);
    const slip = {
      id: uuid(),
      date: obCell(row, colMap, "date", 0) || todayDate(),
      name: obCell(row, colMap, "name", 1) || "Imported",
      position: obCell(row, colMap, "position", 2) || "N/A",
      department: obCell(row, colMap, "department", 3) || "COMELEC",
      purpose: obCell(row, colMap, "purpose", 4) || "Imported",
      timeIn: obCell(row, colMap, "timeIn", 5) || "08:00",
      timeOut: obCell(row, colMap, "timeOut", 6) || "17:00",
      createdAt: new Date().toISOString(),
      employeeId: "",
      archived,
    };
    db.data.obSlips.push(slip);
    added.push(slip);
  }

  if (added.length === 0) {
    return res.status(400).json({ error: "No data rows found. Use the same columns as Export Excel (Date, Name, …)." });
  }
  await db.write();
  emitRealtime();
  res.status(201).json({ imported: added.length, items: added });
});

app.get("/api/tasks", async (_req, res) => {
  await db.read();
  res.json({ stages: taskStages, items: db.data.tasks, logs: db.data.taskLogs || [] });
});

app.post("/api/tasks", async (req, res) => {
  await db.read();
  const { title, assignedStaff = "Unassigned", note = "", batchDate = todayDate() } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Batch name is required." });
  }
  const titleNorm = String(title).trim().toLowerCase();
  const titleTaken = db.data.tasks.some((t) => String(t.title || "").trim().toLowerCase() === titleNorm);
  if (titleTaken) {
    return res.status(400).json({ error: "A batch with this title already exists. Use a unique name." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(batchDate))) {
    return res.status(400).json({ error: "Batch date must be in YYYY-MM-DD format." });
  }
  const hasExistingDate = db.data.tasks.some((t) => t.batchDate === String(batchDate));
  if (hasExistingDate) {
    return res.status(400).json({ error: "This batch date is already used. Choose a different date." });
  }
  const task = {
    id: uuid(),
    title: String(title).trim(),
    batchDate,
    currentStage: 0,
    updates: [
      { stage: 0, status: "done", assignedStaff, note, at: new Date().toISOString() },
    ],
  };
  db.data.tasks.push(task);
  pushTaskLog("batch-created", task, { stage: 0 });
  await db.write();
  emitRealtime();
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", async (req, res) => {
  await db.read();
  const task = db.data.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  const { title, batchDate } = req.body;
  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) return res.status(400).json({ error: "Title cannot be empty." });
    const tNorm = t.toLowerCase();
    const taken = db.data.tasks.some((x) => x.id !== task.id && String(x.title || "").trim().toLowerCase() === tNorm);
    if (taken) {
      return res.status(400).json({ error: "A batch with this title already exists. Use a unique name." });
    }
    task.title = t;
  }
  if (batchDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(batchDate))) {
      return res.status(400).json({ error: "Batch date must be YYYY-MM-DD." });
    }
    const hasExistingDate = db.data.tasks.some((t) => t.id !== task.id && t.batchDate === String(batchDate));
    if (hasExistingDate) {
      return res.status(400).json({ error: "This batch date is already used. Choose a different date." });
    }
    task.batchDate = batchDate;
  }
  pushTaskLog("batch-updated", task, { title: task.title, batchDate: task.batchDate });
  await db.write();
  emitRealtime();
  res.json(task);
});

app.delete("/api/tasks/:id", async (req, res) => {
  await db.read();
  const idx = db.data.tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found." });
  const removed = db.data.tasks[idx];
  db.data.tasks.splice(idx, 1);
  pushTaskLog("batch-deleted", removed, {});
  await db.write();
  emitRealtime();
  res.status(204).end();
});

app.patch("/api/tasks/:id/stage", async (req, res) => {
  await db.read();
  const { id } = req.params;
  const { stage, assignedStaff = "Assigned Staff", note = "" } = req.body;
  const task = db.data.tasks.find((t) => t.id === id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  const nextStage = Number(stage);
  if (!Number.isInteger(nextStage) || nextStage < 0 || nextStage >= taskStages.length) {
    return res.status(400).json({ error: "Invalid stage." });
  }

  // Limitation: prevent skipping stages and only allow valid correction loop.
  const isForwardStep = nextStage === task.currentStage + 1;
  const isCorrectionLoop = task.currentStage === 2 && nextStage === 1;
  if (!isForwardStep && !isCorrectionLoop) {
    return res.status(400).json({
      error: "Invalid transition. Only next stage is allowed (or Correction back to Verification).",
    });
  }

  const requiredStaffStages = new Set([1, 2, 3, 4]);
  if (requiredStaffStages.has(nextStage) && !String(assignedStaff).trim()) {
    return res.status(400).json({ error: "Assigned staff is required for this stage." });
  }

  task.currentStage = nextStage;
  task.updates.push({
    stage: nextStage,
    status: nextStage === taskStages.length - 1 ? "done" : "in-progress",
    assignedStaff: String(assignedStaff || "").trim() || "Assigned Staff",
    note: String(note || "").trim(),
    at: new Date().toISOString(),
  });
  pushTaskLog("stage-updated", task, {
    stage: nextStage,
    stageLabel: taskStages[nextStage],
    assignedStaff: String(assignedStaff || "").trim() || "Assigned Staff",
    note: String(note || "").trim(),
  });

  await db.write();
  emitRealtime();
  res.json(task);
});

io.on("connection", () => {
  emitRealtime();
});

bootstrap().then(() => {
  httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n[!] Port ${PORT} is already in use.`);
      console.error("    Another backend may still be running. Fix:");
      console.error(`    1) Close the other terminal, or`);
      console.error(`    2) Windows: netstat -ano | findstr :${PORT}`);
      console.error(`       then: taskkill /PID <number> /F`);
      console.error(`    3) Or use another port: set PORT=4001 && npm run dev\n`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
  });
});
