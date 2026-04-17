const path = require("path");
const Module = require("module");
const { app, BrowserWindow, dialog } = require("electron");

let mainWindow = null;

function resolveBackendEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "server.js");
  }
  return path.join(app.getAppPath(), "backend", "server.js");
}

function resolveFrontendIndex() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "frontend", "dist", "index.html");
  }
  return path.join(app.getAppPath(), "frontend", "dist", "index.html");
}

function startBackend() {
  const userDataDir = app.getPath("userData");
  process.env.PORT = process.env.PORT || "4000";
  process.env.SQLITE_PATH = process.env.SQLITE_PATH || path.join(userDataDir, "comelec.db");
  process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(userDataDir, "uploads");
  process.env.NODE_PATH = [path.join(app.getAppPath(), "node_modules"), process.env.NODE_PATH || ""]
    .filter(Boolean)
    .join(path.delimiter);
  Module._initPaths();

  const backendEntry = resolveBackendEntry();
  // Run backend in-process for simple desktop packaging.
  require(backendEntry);
}

async function waitForBackendReady(timeoutMs = 20000) {
  const started = Date.now();
  const healthUrl = "http://127.0.0.1:4000/api/health";
  let lastError = "Unknown startup error.";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return true;
      lastError = `Health check returned HTTP ${res.status}.`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(lastError);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1365,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const entry = resolveFrontendIndex();
  mainWindow.loadFile(entry);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    startBackend();
  } catch (error) {
    dialog.showErrorBox(
      "Backend failed to start",
      `The local API could not be started.\n\n${error instanceof Error ? error.message : String(error)}`
    );
    app.quit();
    return;
  }
  waitForBackendReady()
    .then(() => {
      createMainWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Backend not reachable",
        `The local API did not become ready.\n\n${error instanceof Error ? error.message : String(error)}`
      );
      app.quit();
    });
});

app.on("window-all-closed", () => {
  app.quit();
});
