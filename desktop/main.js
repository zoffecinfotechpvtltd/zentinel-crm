const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
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

// Server mode: this machine hosts the embedded Postgres + backend and other
// office machines connect to it over LAN. Client mode: this machine is just
// a window pointed at someone else's server — no local DB, no local backend.
// Chosen once on first launch (mode-select.html) and remembered here.
const modeConfigPath = path.join(app.getPath("userData"), "app-mode.json");

function readModeConfig() {
  try {
    return JSON.parse(fs.readFileSync(modeConfigPath, "utf8"));
  } catch {
    return null;
  }
}
function writeModeConfig(config) {
  fs.writeFileSync(modeConfigPath, JSON.stringify(config, null, 2));
}

let mainWindow = null;
let pickerWindow = null;
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

function startBackend(databaseUrl, bindMode) {
  return new Promise((resolve, reject) => {
    backendProcess = fork(backendEntry, [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        DESKTOP_MODE: "1",
        DESKTOP_BIND: bindMode, // "loopback" or "lan"
        PORT: String(BACKEND_PORT),
        DATABASE_URL: databaseUrl,
        FRONTEND_DIST_PATH: frontendDir,
        UPLOADS_DIR: path.join(app.getPath("userData"), "uploads"),
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

function getLanAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

// Binding to 0.0.0.0 doesn't guarantee anything can actually reach it —
// Windows Firewall commonly blocks inbound connections to a new app's port
// until the user clicks through the "Allow access" prompt. Actually connect
// to this machine's own LAN IP (not loopback) right after boot, the same
// way another PC on the network would, so a silent firewall block gets
// caught and surfaced now instead of "it doesn't work" reports later.
async function checkLanReachability(port) {
  const addresses = getLanAddresses();
  if (addresses.length === 0) {
    return { addresses: [], anyReachable: false, checked: false };
  }
  const results = await Promise.all(
    addresses.map(
      (addr) =>
        new Promise((resolve) => {
          const req = http.get({ host: addr, port, path: "/api/health", timeout: 3000 }, (res) => {
            resolve(res.statusCode === 200);
            res.resume();
          });
          req.on("error", () => resolve(false));
          req.on("timeout", () => {
            req.destroy();
            resolve(false);
          });
        })
    )
  );
  return { addresses, anyReachable: results.some(Boolean), checked: true };
}

function buildAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Switch server / connect elsewhere...",
          click: () => {
            if (fs.existsSync(modeConfigPath)) fs.unlinkSync(modeConfigPath);
            app.relaunch();
            app.exit(0);
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Zoffec Sentinel",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startServerMode() {
  const databaseUrl = await startDatabase();
  await runMigrations(databaseUrl);
  await startBackend(databaseUrl, "lan");
  await waitForHealth(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 30000);
  buildAppMenu();

  const reachability = await checkLanReachability(BACKEND_PORT);
  if (reachability.checked && !reachability.anyReachable) {
    console.warn("[lan-check] Server is up locally but not reachable from its own LAN address(es):", reachability.addresses);
    dialog.showMessageBox({
      type: "warning",
      title: "Other PCs may not be able to connect",
      message: "Zoffec Sentinel is running, but this PC couldn't reach itself over the network address other computers would use.",
      detail:
        "This usually means Windows Firewall is blocking the connection. When Windows shows an \"allow this app\" prompt, allow it for Private networks. You can check Settings → Network in the app once it's open to see the exact address to test.",
    });
  } else if (reachability.checked) {
    console.log("[lan-check] Confirmed reachable on:", reachability.addresses);
  } else {
    console.log("[lan-check] No LAN interface found — this PC may not be connected to the office network.");
  }

  createWindow(`http://127.0.0.1:${BACKEND_PORT}`);
}

async function startClientMode(serverUrl) {
  try {
    await waitForHealth(`${serverUrl.replace(/\/$/, "")}/api/health`, 15000);
  } catch (err) {
    dialog.showErrorBox(
      "Can't reach that server",
      `Couldn't connect to ${serverUrl}.\n\nCheck that:\n- The other PC's Zoffec Sentinel (Server mode) is running\n- Both PCs are on the same network\n- The address and port are correct\n\n${String(err instanceof Error ? err.message : err)}`
    );
    app.quit();
    return;
  }
  buildAppMenu();
  createWindow(serverUrl);
}

function showModePicker() {
  return new Promise((resolve) => {
    pickerWindow = new BrowserWindow({
      width: 520,
      height: 480,
      title: "Zoffec Sentinel — Setup",
      resizable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "mode-select-preload.js"),
      },
    });
    pickerWindow.setMenuBarVisibility(false);
    pickerWindow.loadFile(path.join(__dirname, "mode-select.html"));

    const onChooseServer = () => {
      writeModeConfig({ mode: "server" });
      cleanup();
      resolve({ mode: "server" });
    };
    const onChooseClient = (_event, url) => {
      writeModeConfig({ mode: "client", serverUrl: url });
      cleanup();
      resolve({ mode: "client", serverUrl: url });
    };
    function cleanup() {
      ipcMain.removeListener("setup:choose-server", onChooseServer);
      ipcMain.removeListener("setup:choose-client", onChooseClient);
      if (pickerWindow) {
        pickerWindow.close();
        pickerWindow = null;
      }
    }

    ipcMain.on("setup:choose-server", onChooseServer);
    ipcMain.on("setup:choose-client", onChooseClient);
  });
}

app.whenReady().then(async () => {
  try {
    let config = readModeConfig();
    if (!config) {
      config = await showModePicker();
    }

    if (config.mode === "client") {
      await startClientMode(config.serverUrl);
    } else {
      await startServerMode();
    }
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
    const config = readModeConfig();
    if (config?.mode === "client") createWindow(config.serverUrl);
    else if (config?.mode === "server") createWindow(`http://127.0.0.1:${BACKEND_PORT}`);
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
