const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { fork } = require("node:child_process");
const { runner: migrate } = require("node-pg-migrate");

// Packaged Windows GUI apps have no attached console — mirror everything to
// a log file too, so startup failures are diagnosable after the fact.
const logFile = path.join(app.getPath("userData"), "startup.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const logStream = fs.createWriteStream(logFile, { flags: "a" });
for (const level of ["log", "error", "warn"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    logStream.write(`[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`);
  };
}

const isDev = !app.isPackaged;

const backendDir = isDev
  ? path.join(__dirname, "..", "backend")
  : path.join(process.resourcesPath, "backend");
const frontendDir = isDev
  ? path.join(__dirname, "..", "frontend", "dist")
  : path.join(process.resourcesPath, "frontend");
const migrationsDir = path.join(backendDir, "migrations");
const backendEntry = path.join(backendDir, "dist", "index.js");

const PG_PORT = 54329;
const BACKEND_PORT = 4317;
const PG_USER = "zoffec";
const PG_PASSWORD = "zoffec_local_desktop";
const PG_DATABASE = "zoffec_sentinel";

let mainWindow = null;
let backendProcess = null;
let pg = null;

function waitForHealth(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else if (Date.now() - start > timeoutMs) {
            reject(new Error(`Backend did not become healthy in time (last status ${res.statusCode})`));
          } else {
            setTimeout(tick, 500);
          }
          res.resume();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error("Backend did not become healthy in time (connection refused)"));
          } else {
            setTimeout(tick, 500);
          }
        });
    };
    tick();
  });
}

async function startDatabase() {
  // embedded-postgres is ESM-only; Electron's main process is CommonJS, so
  // this is the one place a dynamic import is needed to bridge the two.
  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  const userDataDir = app.getPath("userData");
  const databaseDir = path.join(userDataDir, "pgdata");
  const isFirstRun = !fs.existsSync(databaseDir) || fs.readdirSync(databaseDir).length === 0;

  pg = new EmbeddedPostgres({
    databaseDir,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    persistent: true,
    onLog: (msg) => console.log("[postgres]", msg),
    onError: (msg) => console.error("[postgres]", msg),
  });

  if (isFirstRun) {
    console.log("First run — initializing embedded Postgres data directory...");
    await pg.initialise();
  }

  await pg.start();

  if (isFirstRun) {
    console.log(`Creating database "${PG_DATABASE}"...`);
    await pg.createDatabase(PG_DATABASE);
  }

  return `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DATABASE}`;
}

async function runMigrations(databaseUrl) {
  console.log("Running migrations...");
  await migrate({
    databaseUrl,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    migrationFileLanguage: "sql",
    log: (msg) => console.log("[migrate]", msg),
  });
  console.log("Migrations complete.");
}

function startBackend(databaseUrl) {
  return new Promise((resolve, reject) => {
    backendProcess = fork(backendEntry, [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        DESKTOP_MODE: "1",
        PORT: String(BACKEND_PORT),
        DATABASE_URL: databaseUrl,
        FRONTEND_DIST_PATH: frontendDir,
        SESSION_COOKIE_NAME: "zoffec_sid",
        SESSION_TTL_HOURS: "12",
        SESSION_REMEMBER_TTL_DAYS: "30",
        APP_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}`,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    backendProcess.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
    backendProcess.stderr.on("data", (d) => process.stderr.write(`[backend] ${d}`));
    backendProcess.on("error", reject);
    backendProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Backend process exited unexpectedly with code ${code}`);
      }
    });

    resolve();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Zoffec Sentinel",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const databaseUrl = await startDatabase();
    await runMigrations(databaseUrl);
    await startBackend(databaseUrl);
    await waitForHealth(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 30000);
    createWindow();
  } catch (err) {
    console.error("Startup failed:", err);
    dialog.showErrorBox("Zoffec Sentinel failed to start", String(err instanceof Error ? err.stack : err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null && BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function shutdown() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (pg) {
    try {
      await pg.stop();
    } catch (err) {
      console.error("Error stopping embedded Postgres:", err);
    }
  }
}

app.on("before-quit", (e) => {
  if (backendProcess || pg) {
    e.preventDefault();
    shutdown().finally(() => {
      backendProcess = null;
      pg = null;
      app.quit();
    });
  }
});
