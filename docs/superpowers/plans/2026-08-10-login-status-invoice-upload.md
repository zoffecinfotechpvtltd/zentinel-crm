# Login CORS Fix, Backend Status Page, Invoice/Bill Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the production login CORS failure, add a public `/status` page that shows whether the backend is reachable with a manual force-refresh, and add a "Bill/Invoice" document type to the existing per-client file-upload feature.

**Architecture:** Three small, independent changes on top of the existing Express + React app. No new tables, no new dependencies. The status page is a single self-contained HTML string served directly by Express (same pattern as `desktop/mode-select.html` — no build step). The invoice upload change reuses the existing generic `attachments` system already mounted on the clients router.

**Tech Stack:** Node.js/TypeScript/Express (backend), React/TypeScript/Vite (frontend). No new packages needed for this plan.

## Global Constraints

- Follow existing code style exactly (no semicolon changes, same quote style, same patterns already in the touched files).
- No new npm dependencies for any task in this plan.
- Brand colors (from `frontend/src/theme.css`): Midnight `#0B1020`, Electric Blue `#2563FF`, Success `#22C55E`, Warning `#F59E0B`, Danger `#DC2626`, Light `#F1F5F9`, Slate `#64748B`.
- This is this project's *first* plan out of the larger 5-part design (`docs/superpowers/specs/2026-08-10-status-login-invoice-upload-testing-design.md`) — sections 1-3 only. The test-coverage sweep (section 4) and the feature rating table (section 5) are separate, larger plans written after this one lands.

---

### Task 1: Log rejected CORS origins server-side

**Files:**
- Modify: `backend/src/index.ts:53-59`

**Interfaces:**
- Consumes: `allowedOrigins` (already defined at `index.ts:52` as `string[]`).
- Produces: nothing new consumed by later tasks — this is a standalone logging change.

- [ ] **Step 1: Make the change**

Replace this block in `backend/src/index.ts`:

```ts
const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
```

with:

```ts
const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    console.warn(`[cors] rejected origin "${origin}" — not in APP_BASE_URL (${allowedOrigins.join(", ") || "none set"})`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Manual check**

Run: `cd backend && npm run dev`, then in another terminal:
```bash
curl -i -X OPTIONS http://localhost:4000/api/auth/login \
  -H "Origin: https://not-allowed.example.com" \
  -H "Access-Control-Request-Method: POST"
```
Expected: backend terminal prints `[cors] rejected origin "https://not-allowed.example.com" — not in APP_BASE_URL (http://localhost:5173)` (or whatever `APP_BASE_URL` is set to locally).

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "fix: log rejected CORS origins for easier production debugging"
```

---

### Task 2: Set the production `APP_BASE_URL` on Render (infra, not code)

This task has no files to change — it's a dashboard action, done manually. Included here so it's tracked alongside the code fix it depends on: the Task 1 log line is what confirms this was the actual problem, and this step is what actually fixes login.

**Interfaces:** none — this task's "output" is an env var change on a service outside this repo.

- [ ] **Step 1: Update the env var**

In the Render dashboard, open the `zoffec-sentinel-api` service → Environment → find `APP_BASE_URL`. Set it to:

```
https://zentinel.ztplsolutions.com
```

If any other origin needs to call this API (e.g. a Vercel preview URL), comma-separate it: `https://zentinel.ztplsolutions.com,https://<preview>.vercel.app`. No trailing slashes (the app already strips them via `getAllowedOrigins()`, but cleaner to not rely on that).

- [ ] **Step 2: Redeploy**

Render restarts the service automatically on an env var change (or manually trigger "Deploy latest commit" if it doesn't). Wait for the deploy to show "Live."

- [ ] **Step 3: Verify from the real frontend**

Open `https://zentinel.ztplsolutions.com/login` in a browser, open DevTools → Network tab, attempt a login. Expected: the `OPTIONS`/`POST` to `.../api/auth/login` no longer shows a CORS error in the console, and the request either succeeds (redirect to dashboard) or fails with a real `401 Invalid email or password` — not the generic "Something went wrong" from before.

- [ ] **Step 4: Check the Render logs**

In the Render dashboard's Logs tab, confirm there is no `[cors] rejected origin ...` line for `https://zentinel.ztplsolutions.com` after the redeploy (there may be older ones from before the fix — that's expected history, not a new problem).

No commit for this task (no repo changes).

---

### Task 3: Note the production CORS requirement in the README

**Files:**
- Modify: `README.md` (the `.env` fields table, around line 122)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Make the change**

In `README.md`, find this row in the `.env` fields table:

```
| `APP_BASE_URL` | used to build password-reset links | matches the frontend dev URL (`http://localhost:5173`) by default |
```

Replace with:

```
| `APP_BASE_URL` | used to build password-reset links, and the whitelist for CORS | matches the frontend dev URL (`http://localhost:5173`) by default — **in production this must also include your deployed frontend's exact origin(s), comma-separated, or login will fail with a CORS error** |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: clarify APP_BASE_URL doubles as the production CORS whitelist"
```

---

### Task 4: Backend status page — HTML content

**Files:**
- Create: `backend/src/lib/statusPage.ts`

**Interfaces:**
- Produces: `export const STATUS_PAGE_HTML: string` — consumed by Task 5.

- [ ] **Step 1: Write the file**

```ts
// Self-contained diagnostic page — no build step, no external requests, no
// auth (mirrors /api/health, which is already public). Exists so a
// non-technical person can check "is the backend up" without opening
// DevTools, and force a re-check when Render's free tier has put the
// service to sleep after idle (cold start takes roughly 30-50s).
export const STATUS_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zentinel — Backend Status</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0b1020;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f1f5f9;
  }
  .card {
    width: min(420px, 92vw);
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 12px;
    padding: 28px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: #f1f5f9; }
  .sub { font-size: 12.5px; color: #64748b; margin: 0 0 22px; }
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; transition: background-color 0.2s; }
  .dot.checking { background: #f59e0b; animation: pulse 1s ease-in-out infinite; }
  .dot.online { background: #22c55e; }
  .dot.degraded { background: #f59e0b; }
  .dot.offline { background: #dc2626; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .label { font-size: 15px; font-weight: 600; }
  .meta { font-size: 12.5px; color: #64748b; line-height: 1.6; margin-bottom: 20px; }
  .meta strong { color: #cbd5e1; font-weight: 500; }
  button {
    width: 100%;
    padding: 11px 16px;
    background: #2563ff;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: wait; }
  button:not(:disabled):hover { background: #1c4fd6; }
</style>
</head>
<body>
  <div class="card">
    <h1>Zentinel Backend</h1>
    <p class="sub">Live reachability check against this API's own /api/health endpoint.</p>
    <div class="row">
      <div class="dot checking" id="dot"></div>
      <div class="label" id="label">Checking…</div>
    </div>
    <div class="meta" id="meta">—</div>
    <button id="btn" type="button">Force Refresh</button>
  </div>
<script>
  var dot = document.getElementById("dot");
  var label = document.getElementById("label");
  var meta = document.getElementById("meta");
  var btn = document.getElementById("btn");

  function setState(state, text, metaHtml) {
    dot.className = "dot " + state;
    label.textContent = text;
    meta.innerHTML = metaHtml;
  }

  function checkOnce() {
    var start = performance.now();
    return fetch("/api/health", { cache: "no-store" })
      .then(function (res) {
        var ms = Math.round(performance.now() - start);
        return res.json().then(function (body) { return { res: res, body: body, ms: ms }; });
      })
      .then(function (r) {
        var now = new Date().toLocaleTimeString();
        if (r.res.ok && r.body.ok) {
          setState("online", "Online", "<strong>DB:</strong> " + r.body.db + "<br><strong>Response time:</strong> " + r.ms + "ms<br><strong>Last checked:</strong> " + now);
          return true;
        }
        setState("degraded", "Degraded", "<strong>DB:</strong> " + (r.body.db || "unreachable") + "<br><strong>Response time:</strong> " + r.ms + "ms<br><strong>Last checked:</strong> " + now);
        return false;
      })
      .catch(function () {
        return false;
      });
  }

  btn.addEventListener("click", function () {
    btn.disabled = true;
    runWithRetry().finally(function () { btn.disabled = false; });
  });

  function runWithRetry() {
    return new Promise(function (resolve) {
      var maxAttempts = 3;
      function attempt(n) {
        setState("checking", n === 0 ? "Checking…" : "Waking up… (attempt " + (n + 1) + " of " + maxAttempts + ")", meta.innerHTML);
        checkOnce().then(function (ok) {
          if (ok || n + 1 >= maxAttempts) {
            if (!ok) {
              var now = new Date().toLocaleTimeString();
              setState("offline", "Offline", "Could not reach the backend after " + maxAttempts + " attempts.<br><strong>Last checked:</strong> " + now);
            }
            resolve();
          } else {
            setTimeout(function () { attempt(n + 1); }, 5000);
          }
        });
      }
      attempt(0);
    });
  }

  runWithRetry();
</script>
</body>
</html>
`;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/statusPage.ts
git commit -m "feat: add self-contained backend status page markup"
```

---

### Task 5: Wire `GET /status` into the Express app

**Files:**
- Modify: `backend/src/index.ts` — add an import near the top and a route registration before the `FRONTEND_DIST_PATH` block.

**Interfaces:**
- Consumes: `STATUS_PAGE_HTML` from `backend/src/lib/statusPage.ts` (Task 4).

- [ ] **Step 1: Add the import**

Near the other local imports at the top of `backend/src/index.ts` (after `import { getAllowedOrigins } from "./lib/appUrl";`), add:

```ts
import { STATUS_PAGE_HTML } from "./lib/statusPage";
```

- [ ] **Step 2: Register the route**

`/status` must be registered **before** the `FRONTEND_DIST_PATH` catch-all block (`app.get(/^(?!\/api).*/, ...)`), otherwise the desktop build's SPA fallback swallows it first — Express matches routes in registration order. Insert right after the existing `/api/health` route (`index.ts:88-96`), before the `if (process.env.FRONTEND_DIST_PATH)` block:

```ts
app.get("/status", (_req, res) => {
  res.type("html").send(STATUS_PAGE_HTML);
});
```

- [ ] **Step 3: Verify it compiles**

Run: `cd backend && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: serve backend status page at GET /status"
```

---

### Task 6: Manually verify the status page

No files changed in this task — it's a verification pass over Tasks 4-5's output before moving on.

- [ ] **Step 1: Start the backend**

Run: `cd backend && npm run dev`

- [ ] **Step 2: Load the page**

Open `http://localhost:4000/status` in a browser. Expected: page loads with the "Zentinel Backend" card, dot goes from amber "Checking…" to green "Online" within ~1s, showing `DB: connected`, a response time in ms, and a last-checked timestamp.

- [ ] **Step 3: Test the degraded/offline path**

Stop the local Postgres (`docker compose stop` if using the bundled one, or otherwise disconnect the DB) while the backend keeps running, then click "Force Refresh." Expected: dot turns amber "Degraded" (backend up, DB down) reflecting the `/api/health` 503 response. Restart Postgres, click "Force Refresh" again, expected: back to green "Online."

- [ ] **Step 4: Test full offline**

Stop the backend entirely (`Ctrl+C`), reload `http://localhost:4000/status` in the browser (this will fail to load the page itself since the server is down — confirms there's nothing left running to serve the page, which is the expected "fully offline" case for this manual check). Restart the backend (`npm run dev`) and confirm the page loads again.

- [ ] **Step 5: Confirm the desktop-build SPA route isn't broken**

Run: `curl -s http://localhost:4000/status | head -c 200` — expected: HTML starting with `<!doctype html>` and containing `Zentinel Backend`, not the frontend's `index.html` (this confirms `/status` is matched before the `FRONTEND_DIST_PATH` catch-all in desktop-mode builds; safe to check even without `FRONTEND_DIST_PATH` set locally, since the route ordering is what's being verified).

No commit for this task (verification only).

---

### Task 7: Add "Bill/Invoice" as a document type on client file uploads

**Files:**
- Modify: `frontend/src/components/NotesAndFiles.tsx:18` (the `DOCUMENT_TYPES` array)
- Modify: `frontend/src/components/NotesAndFiles.tsx:131-134` (the file `<input>`)

**Interfaces:**
- No new props, no new exports — `NotesAndFiles` keeps its existing `{ entityType, entityId }` signature. Already rendered against clients at `frontend/src/pages/Clients.tsx:263`.

- [ ] **Step 1: Add the document type**

Change:

```tsx
const DOCUMENT_TYPES = ["Engagement Letter", "PO", "Proposal", "Other"];
```

to:

```tsx
const DOCUMENT_TYPES = ["Engagement Letter", "PO", "Proposal", "Bill/Invoice", "Other"];
```

- [ ] **Step 2: Filter the file picker for bills specifically**

Change this block:

```tsx
            <label className="btn btn-ghost btn-sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
              <IconPlus size={12} /> {uploading ? "Uploading…" : "Attach"}
              <input type="file" style={{ display: "none" }} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
            </label>
```

to:

```tsx
            <label className="btn btn-ghost btn-sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
              <IconPlus size={12} /> {uploading ? "Uploading…" : "Attach"}
              <input
                type="file"
                style={{ display: "none" }}
                disabled={uploading}
                accept={docType === "Bill/Invoice" ? ".pdf,image/*" : undefined}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
              />
            </label>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NotesAndFiles.tsx
git commit -m "feat: add Bill/Invoice document type to client file uploads"
```

---

### Task 8: Manually verify the invoice/bill upload flow end to end

No files changed in this task — verification pass over Task 7's output.

- [ ] **Step 1: Start both servers**

Run: `cd backend && npm run dev` in one terminal, `cd frontend && npm run dev` in another.

- [ ] **Step 2: Open a client and upload a bill**

Log in, go to Clients, open any existing client (or create one). In the Files card, select "Bill/Invoice" from the document-type dropdown, click Attach, and pick a PDF or image file. Expected: the file picker only shows PDFs/images (from the `accept` filter), upload succeeds, the file appears in the list tagged with a "Bill/Invoice" badge.

- [ ] **Step 3: Confirm it's linked to that specific client only**

Open a *different* client's detail modal. Expected: the bill uploaded in Step 2 does not appear here — confirms `entity_id` scoping is working as expected (this is existing behavior from the generic attachments system, not new code, but worth confirming nothing regressed).

- [ ] **Step 4: Download and delete**

Click the uploaded file's name — expected: it downloads with the original filename. As the uploader (or as an admin), delete it — expected: it disappears from the list and a second click on the old download link now 404s.

- [ ] **Step 5: Confirm other document types still work unfiltered**

Repeat Step 2 but select "Engagement Letter" instead of "Bill/Invoice" before clicking Attach. Expected: the file picker shows all file types again (no `accept` filter), confirming the filter is scoped only to the Bill/Invoice flow and didn't regress the existing onboarding-docs use case.

No commit for this task (verification only).

## Self-Review Notes

- **Spec coverage:** Section 1 (login fix) → Tasks 1-3. Section 2 (status page) → Tasks 4-6. Section 3 (invoice upload) → Tasks 7-8. Sections 4 (test sweep) and 5 (rating table) are intentionally out of scope for this plan — see the design doc's note that they're separate, larger efforts to be planned once this lands.
- **Placeholder scan:** no TBD/TODO, no "similar to Task N" — Task 7's two edits are shown as full before/after code rather than referenced.
- **Type consistency:** `STATUS_PAGE_HTML` name matches between its `export const` in Task 4 and its `import` in Task 5. `NotesAndFiles`'s existing `docType` state variable (already defined at `NotesAndFiles.tsx:37`, unchanged) is what Task 7 Step 2 reads — no new state introduced.
