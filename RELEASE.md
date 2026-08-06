# Building & releasing Zoffec Sentinel (Windows desktop app)

Zoffec Sentinel ships as a single Windows installer — no cloud hosting, no
database to manage, no env vars to configure. It bundles its own PostgreSQL
(via `embedded-postgres`) and starts the whole app (database + backend +
frontend, all in one process on `127.0.0.1`, never reachable from the network)
when you launch it. First launch shows a Setup screen to create the admin
account — no default credentials ship with the app.

## Prerequisites

- Node.js 22+ and npm
- Windows (the installer target; the same approach would work for
  mac/Linux via electron-builder's other targets, but that's untested here)

## Build steps

From the repo root:

```bash
# 1. Build the backend (TypeScript -> dist/)
cd backend
npm install
npm run build

# 2. Build the frontend (Vite -> dist/)
cd ../frontend
npm install
npm run build

# 3. Build the installer (stages backend+frontend into desktop/resources/,
#    then runs electron-builder)
cd ../desktop
npm install
npm run dist
```

Output: `desktop/release/Zoffec Sentinel Setup <version>.exe` — this is the
one file to distribute. (`desktop/release/win-unpacked/` also contains the
unpacked app, useful for quick local testing without running the installer.)

## What's actually happening under the hood

- `desktop/main.js` is the Electron main process. On launch it:
  1. Initializes (first run only) and starts an embedded PostgreSQL instance,
     data stored in the OS's per-user app-data folder (so it survives
     updates/reinstalls as long as that folder isn't deleted).
  2. Runs all database migrations against it (`node-pg-migrate`, same
     migration files the backend always used).
  3. Forks the compiled backend (`backend/dist/index.js`) as a child process,
     using Electron's own bundled Node runtime (`ELECTRON_RUN_AS_NODE=1`) —
     no separate Node.js installation needed on the end user's machine.
  4. Waits for the backend's health check to pass, then opens a window
     pointed at it. The backend serves both the API and the built frontend
     from the same origin (`FRONTEND_DIST_PATH`), so there's no separate
     frontend server or CORS to think about.
  5. On quit, kills the backend process and stops the embedded Postgres
     cleanly.
- The backend binds to `127.0.0.1` only in this mode (`DESKTOP_MODE=1`) —
  it is never reachable from other devices on the same network.

## Testing a build before releasing

```bash
cd desktop/release/win-unpacked
./"Zoffec Sentinel.exe"
```

Confirms the packaged app boots without needing to run the full NSIS
installer each time. Delete `%APPDATA%\zoffec-sentinel-desktop` between test
runs to get a genuinely fresh first-run (Setup screen, empty database).

## Known gotchas hit while building this

- `embedded-postgres` is ESM-only; Electron's main process here is
  CommonJS — bridged with a single `await import("embedded-postgres")`
  inside `main.js` rather than converting the whole file to ESM (which hit
  unrelated ESM-loader issues specific to Electron's main process).
- **asar packing is disabled** (`"asar": false` in `desktop/package.json`).
  `embedded-postgres` needs to `chmod` its bundled `postgres.exe`/`initdb.exe`
  at runtime, and that failed when those binaries lived inside an asar
  archive even with `asarUnpack` configured — the package's internal path
  resolution didn't account for the unpacked location correctly under
  Electron specifically. Disabling asar entirely for this app sidesteps the
  whole class of asar-vs-unpacked-path bugs; there's no real downside for an
  internal tool this size.
- If `ELECTRON_RUN_AS_NODE` is already set in your shell environment before
  running `npm start` or the built exe, Electron boots as a plain Node
  process instead of a GUI app (`require("electron").app` comes back
  `undefined`). Unset it before testing: `env -u ELECTRON_RUN_AS_NODE ...`.

## Releasing

```bash
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 "desktop/release/Zoffec Sentinel Setup 1.0.0.exe" \
  --title "Zoffec Sentinel v1.0.0" \
  --notes "First release."
```

The installer is unsigned (no code-signing certificate) — Windows SmartScreen
will show an "unknown publisher" warning on first run. Users need to click
"More info" → "Run anyway". A code-signing certificate would remove this
warning if it becomes worth the cost later; not required for internal use.
