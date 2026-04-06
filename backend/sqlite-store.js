const fs = require("fs");
const Database = require("better-sqlite3");

/** @type {import('better-sqlite3').Database | null} */
let sqlDb = null;

function createTables() {
  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      type TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'COMELEC',
      birthday TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ob_slips (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'COMELEC',
      purpose TEXT NOT NULL,
      time_in TEXT NOT NULL,
      time_out TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      employee_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      batch_date TEXT NOT NULL,
      current_stage INTEGER NOT NULL,
      updates_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      task_id TEXT NOT NULL,
      batch_title TEXT NOT NULL DEFAULT '',
      batch_date TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  `);
}

/**
 * @param {string} dbPath
 */
function initSqlite(dbPath) {
  if (sqlDb) sqlDb.close();
  sqlDb = new Database(dbPath);
  sqlDb.pragma("journal_mode = WAL");
  createTables();
}

function isEmptyDatabase() {
  const row = sqlDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM employees) +
      (SELECT COUNT(*) FROM events) +
      (SELECT COUNT(*) FROM ob_slips) +
      (SELECT COUNT(*) FROM tasks) +
      (SELECT COUNT(*) FROM task_logs) +
      (SELECT COUNT(*) FROM users) +
      (SELECT COUNT(*) FROM sessions) AS total
  `).get();
  return !row || row.total === 0;
}

/**
 * @param {string} jsonPath
 */
function migrateFromJsonIfEmpty(jsonPath) {
  if (!isEmptyDatabase()) return false;
  if (!fs.existsSync(jsonPath)) return false;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch {
    return false;
  }
  const data = {
    employees: Array.isArray(raw.employees) ? raw.employees : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    obSlips: Array.isArray(raw.obSlips) ? raw.obSlips : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    taskLogs: Array.isArray(raw.taskLogs) ? raw.taskLogs : [],
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
  };
  saveState(data);
  return true;
}

/**
 * @returns {{
 *   employees: object[],
 *   events: object[],
 *   obSlips: object[],
 *   tasks: object[],
 *   taskLogs: object[],
 *   users: object[],
 *   sessions: object[],
 * }}
 */
function loadState() {
  const employees = sqlDb
    .prepare(
      `SELECT id, name, position, type, department, birthday, email, contact_no AS contactNo, address FROM employees ORDER BY rowid`
    )
    .all();

  const events = sqlDb
    .prepare(
      `SELECT id, title, date, time, description, archived FROM events ORDER BY rowid`
    )
    .all()
    .map((e) => ({ ...e, archived: Boolean(e.archived) }));

  const obSlips = sqlDb
    .prepare(
      `SELECT id, date, name, position, department, purpose,
        time_in AS timeIn, time_out AS timeOut, created_at AS createdAt,
        archived, employee_id AS employeeId FROM ob_slips ORDER BY rowid`
    )
    .all()
    .map((s) => ({ ...s, archived: Boolean(s.archived) }));

  const taskRows = sqlDb
    .prepare(`SELECT id, title, batch_date AS batchDate, current_stage AS currentStage, updates_json FROM tasks ORDER BY rowid`)
    .all();
  const tasks = taskRows.map((r) => ({
    id: r.id,
    title: r.title,
    batchDate: r.batchDate,
    currentStage: r.currentStage,
    updates: safeJsonParse(r.updates_json, []),
  }));

  const logRows = sqlDb
    .prepare(
      `SELECT id, at, action, task_id AS taskId, batch_title AS batchTitle, batch_date AS batchDate, details_json FROM task_logs ORDER BY rowid`
    )
    .all();
  const taskLogs = logRows.map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    taskId: r.taskId,
    batchTitle: r.batchTitle,
    batchDate: r.batchDate,
    details: safeJsonParse(r.details_json, {}),
  }));

  const users = sqlDb
    .prepare(
      `SELECT id, email, salt, password_hash AS passwordHash, name, created_at AS createdAt FROM users ORDER BY rowid`
    )
    .all();

  const sessions = sqlDb
    .prepare(`SELECT token, user_id AS userId, created_at AS createdAt FROM sessions ORDER BY rowid`)
    .all();

  return { employees, events, obSlips, tasks, taskLogs, users, sessions };
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * @param {object} data
 */
function saveState(data) {
  const insEmp = sqlDb.prepare(
    `INSERT INTO employees (id, name, position, type, department, birthday, email, contact_no, address)
     VALUES (@id, @name, @position, @type, @department, @birthday, @email, @contactNo, @address)`
  );
  const insEv = sqlDb.prepare(
    `INSERT INTO events (id, title, date, time, description, archived)
     VALUES (@id, @title, @date, @time, @description, @archived)`
  );
  const insSlip = sqlDb.prepare(
    `INSERT INTO ob_slips (id, date, name, position, department, purpose, time_in, time_out, created_at, archived, employee_id)
     VALUES (@id, @date, @name, @position, @department, @purpose, @timeIn, @timeOut, @createdAt, @archived, @employeeId)`
  );
  const insTask = sqlDb.prepare(
    `INSERT INTO tasks (id, title, batch_date, current_stage, updates_json)
     VALUES (@id, @title, @batchDate, @currentStage, @updatesJson)`
  );
  const insLog = sqlDb.prepare(
    `INSERT INTO task_logs (id, at, action, task_id, batch_title, batch_date, details_json)
     VALUES (@id, @at, @action, @taskId, @batchTitle, @batchDate, @detailsJson)`
  );
  const insUser = sqlDb.prepare(
    `INSERT INTO users (id, email, salt, password_hash, name, created_at)
     VALUES (@id, @email, @salt, @passwordHash, @name, @createdAt)`
  );
  const insSess = sqlDb.prepare(
    `INSERT INTO sessions (token, user_id, created_at) VALUES (@token, @userId, @createdAt)`
  );

  const run = sqlDb.transaction(() => {
    sqlDb.prepare("DELETE FROM sessions").run();
    sqlDb.prepare("DELETE FROM users").run();
    sqlDb.prepare("DELETE FROM task_logs").run();
    sqlDb.prepare("DELETE FROM tasks").run();
    sqlDb.prepare("DELETE FROM ob_slips").run();
    sqlDb.prepare("DELETE FROM events").run();
    sqlDb.prepare("DELETE FROM employees").run();

    for (const e of data.employees || []) {
      insEmp.run({
        id: e.id,
        name: e.name ?? "",
        position: e.position ?? "",
        type: e.type ?? "",
        department: e.department ?? "COMELEC",
        birthday: e.birthday ?? "",
        email: e.email ?? "",
        contactNo: e.contactNo ?? "",
        address: e.address ?? "",
      });
    }
    for (const ev of data.events || []) {
      insEv.run({
        id: ev.id,
        title: ev.title ?? "",
        date: ev.date ?? "",
        time: ev.time ?? "",
        description: ev.description ?? "",
        archived: ev.archived ? 1 : 0,
      });
    }
    for (const s of data.obSlips || []) {
      insSlip.run({
        id: s.id,
        date: s.date ?? "",
        name: s.name ?? "",
        position: s.position ?? "",
        department: s.department ?? "COMELEC",
        purpose: s.purpose ?? "",
        timeIn: s.timeIn ?? "",
        timeOut: s.timeOut ?? "",
        createdAt: s.createdAt ?? new Date().toISOString(),
        archived: s.archived ? 1 : 0,
        employeeId: s.employeeId ?? "",
      });
    }
    for (const t of data.tasks || []) {
      insTask.run({
        id: t.id,
        title: t.title ?? "",
        batchDate: t.batchDate ?? "",
        currentStage: t.currentStage ?? 0,
        updatesJson: JSON.stringify(t.updates || []),
      });
    }
    for (const log of data.taskLogs || []) {
      insLog.run({
        id: log.id,
        at: log.at ?? "",
        action: log.action ?? "",
        taskId: log.taskId ?? "",
        batchTitle: log.batchTitle ?? "",
        batchDate: log.batchDate ?? "",
        detailsJson: JSON.stringify(log.details != null ? log.details : {}),
      });
    }
    for (const u of data.users || []) {
      insUser.run({
        id: u.id,
        email: u.email ?? "",
        salt: u.salt ?? "",
        passwordHash: u.passwordHash ?? "",
        name: u.name ?? "",
        createdAt: u.createdAt ?? new Date().toISOString(),
      });
    }
    for (const sess of data.sessions || []) {
      insSess.run({
        token: sess.token,
        userId: sess.userId ?? "",
        createdAt: sess.createdAt ?? new Date().toISOString(),
      });
    }
  });

  run();
}

function closeSqlite() {
  if (sqlDb) {
    sqlDb.close();
    sqlDb = null;
  }
}

module.exports = {
  initSqlite,
  loadState,
  saveState,
  migrateFromJsonIfEmpty,
  closeSqlite,
};
