const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const dayjs = require("dayjs");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, "data.json");
const uploadsDir = path.join(__dirname, "uploads");
const upload = multer({ dest: uploadsDir });

// Allow browser dev servers (Vite, preview, etc.) — reflect request Origin
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

/** Quick check that frontend can reach the backend */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "comelec-api", port: PORT });
});

const taskStages = [
  "Collected",
  "For Verification",
  "For Correction",
  "Organized by Precinct (Alphabetical)",
  "For Approval",
  "Final Filing",
];

const adapter = new JSONFile(DB_PATH);
const db = new Low(adapter, {
  employees: [],
  events: [],
  obSlips: [],
  tasks: [],
  taskLogs: [],
});

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

/** Minimal RFC-style CSV parser (supports quoted fields). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = String(text).replace(/^\uFEFF/, "");
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
    if (c === ",") {
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

async function bootstrap() {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  await db.read();
  db.data ||= { employees: [], events: [], obSlips: [], tasks: [], taskLogs: [] };
  db.data.taskLogs ||= [];

  // Keep employee list empty on first run; do not inject sample names.

  if (db.data.tasks.length === 0) {
    db.data.tasks.push({
      id: uuid(),
      title: "Batch A-001",
      batchDate: todayDate(),
      currentStage: 0,
      updates: [{ stage: 0, status: "done", assignedStaff: "Courier Team", note: "Initial collection done.", at: new Date().toISOString() }],
    });
  }

  await db.write();
}

function emitRealtime() {
  io.emit("realtime:update", {
    dashboard: getDashboardData(),
    tasks: db.data.tasks,
    employees: db.data.employees,
    events: db.data.events,
    obSlips: db.data.obSlips,
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
  const weekOBSlips = db.data.obSlips.filter((s) => s.date >= weekStart && s.date <= today).length;
  const weekEvents = db.data.events.filter((e) => e.date >= weekStart && e.date <= today).length;

  const upcomingEvents = db.data.events
    .filter((e) => e.date >= today)
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
  if (db.data.events.filter((e) => e.date === today).length > 0) {
    insights.push({
      type: "info",
      text: `You have ${db.data.events.filter((e) => e.date === today).length} calendar event(s) today.`,
    });
  }

  return {
    employees: db.data.employees.length,
    employeesByType,
    todayEvents: db.data.events.filter((e) => e.date === today).length,
    todayOBSlips: db.data.obSlips.filter((s) => s.date === today).length,
    weekOBSlips,
    weekEvents,
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

app.get("/api/dashboard", async (_req, res) => {
  await db.read();
  res.json(getDashboardData());
});

app.get("/api/employees", async (req, res) => {
  await db.read();
  const { type } = req.query;
  const list = type ? db.data.employees.filter((e) => e.type === type) : db.data.employees;
  res.json(list);
});

app.post("/api/employees", async (req, res) => {
  await db.read();
  const { name, position, type, department = "COMELEC" } = req.body;
  const employee = { id: uuid(), name, position, type, department };
  db.data.employees.push(employee);
  await db.write();
  emitRealtime();
  res.status(201).json(employee);
});

app.patch("/api/employees/:id", async (req, res) => {
  await db.read();
  const emp = db.data.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: "Employee not found." });
  const { name, position, type, department } = req.body;
  if (name !== undefined) emp.name = String(name).trim();
  if (position !== undefined) emp.position = String(position).trim();
  if (type !== undefined) {
    if (type !== "full-time" && type !== "part-time") {
      return res.status(400).json({ error: "type must be full-time or part-time." });
    }
    emp.type = type;
  }
  if (department !== undefined) emp.department = String(department).trim() || "COMELEC";
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
  const { title, date, time, description } = req.body;
  if (title !== undefined) ev.title = String(title).trim();
  if (date !== undefined) ev.date = String(date).trim();
  if (time !== undefined) ev.time = String(time).trim();
  if (description !== undefined) ev.description = String(description);
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
  const { date, name, position, department, purpose, timeIn, timeOut } = req.body;
  if (date !== undefined) slip.date = String(date).trim();
  if (name !== undefined) slip.name = String(name).trim();
  if (position !== undefined) slip.position = String(position).trim();
  if (department !== undefined) slip.department = String(department).trim() || "COMELEC";
  if (purpose !== undefined) slip.purpose = String(purpose).trim();
  if (timeIn !== undefined) slip.timeIn = String(timeIn).trim();
  if (timeOut !== undefined) slip.timeOut = String(timeOut).trim();
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

app.get("/api/ob-slips/export-excel", async (_req, res) => {
  await db.read();
  const headers = ["Date", "Name", "Position", "Department", "Purpose", "Time In", "Time Out"];
  const lines = [
    headers.join(","),
    ...db.data.obSlips.map((s) =>
      [s.date, s.name, s.position, s.department, s.purpose, s.timeIn, s.timeOut].map(csvEscape).join(",")
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
      error: "Import a .csv file. In Excel: File → Save As → CSV, or use Export Excel from this app and edit that file.",
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
  const rows = parseCsv(text);
  if (rows.length === 0) return res.status(400).json({ error: "File is empty." });

  let startIdx = 0;
  if (rows.length && /^date$/i.test(String(rows[0][0] ?? "").trim())) startIdx = 1;

  const dataRows = rows.slice(startIdx);

  const added = [];
  for (const row of dataRows) {
    if (!row || row.every((c) => !String(c ?? "").trim())) continue;
    const slip = {
      id: uuid(),
      date: String(row[0] ?? "").trim() || todayDate(),
      name: String(row[1] ?? "").trim() || "Imported",
      position: String(row[2] ?? "").trim() || "N/A",
      department: String(row[3] ?? "").trim() || "COMELEC",
      purpose: String(row[4] ?? "").trim() || "Imported",
      timeIn: String(row[5] ?? "").trim() || "08:00",
      timeOut: String(row[6] ?? "").trim() || "17:00",
      createdAt: new Date().toISOString(),
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
