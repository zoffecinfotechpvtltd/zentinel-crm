// Self-contained diagnostic page — no build step, no auth (mirrors
// /api/health, which is already public). Exists so a non-technical person
// can check "is the backend up" without opening DevTools, and force a
// re-check when Render's free tier has put the service to sleep after idle
// (cold start takes roughly 30-50s). The page does make one request of its
// own, to /status.js (see STATUS_PAGE_SCRIPT below), plus its live
// reachability checks against /api/health.

// Mirrors the classification logic embedded in STATUS_PAGE_SCRIPT below.
// STATUS_PAGE_SCRIPT is plain JS shipped to the browser — it can't import
// from this module — so this pure function exists purely so the
// online-vs-degraded decision has a unit-testable copy. If you change the
// classification logic in STATUS_PAGE_SCRIPT's `classifyHealthResponse`,
// update this one to match (and vice versa).
export function classifyHealthResponse(ok: boolean, body: { ok: boolean; db: string }): "online" | "degraded" {
  return ok && body.ok ? "online" : "degraded";
}

export const STATUS_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zentinel — Backend Status</title>
<style>
  :root { color-scheme: dark; }
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
<script src="/status.js"></script>
</body>
</html>
`;

// Served from its own route (/status.js) rather than inlined as a <script>
// tag in STATUS_PAGE_HTML, because helmet's default CSP (script-src 'self')
// blocks inline scripts. Keep this as a separate export/route — inlining it
// back into the HTML will silently reintroduce that CSP bug.
export const STATUS_PAGE_SCRIPT = `
  var dot = document.getElementById("dot");
  var label = document.getElementById("label");
  var meta = document.getElementById("meta");
  var btn = document.getElementById("btn");
  var checking = false;

  function renderMeta(lines) {
    while (meta.firstChild) meta.removeChild(meta.firstChild);
    lines.forEach(function (line) {
      var row = document.createElement("div");
      if (line.label) {
        var strong = document.createElement("strong");
        strong.textContent = line.label + ":";
        row.appendChild(strong);
        row.appendChild(document.createTextNode(" " + line.value));
      } else {
        row.textContent = line.text;
      }
      meta.appendChild(row);
    });
  }

  function setState(state, text, metaLines) {
    dot.className = "dot " + state;
    label.textContent = text;
    if (metaLines) renderMeta(metaLines);
  }

  // Mirrors classifyHealthResponse in statusPage.ts (that copy is what's
  // unit-tested; keep the two in sync if this logic changes).
  function classifyHealthResponse(ok, body) {
    return (ok && body && body.ok) ? "online" : "degraded";
  }

  function checkOnce() {
    var start = performance.now();
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 15000);
    return fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(function (res) {
        var ms = Math.round(performance.now() - start);
        return res.json().then(function (body) { return { res: res, body: body, ms: ms }; });
      })
      .then(function (r) {
        clearTimeout(timeoutId);
        var state = classifyHealthResponse(r.res.ok, r.body);
        return { state: state, db: r.body.db, ms: r.ms };
      })
      .catch(function () {
        clearTimeout(timeoutId);
        return { state: "unreachable", db: null, ms: null };
      });
  }

  function runWithRetry() {
    return new Promise(function (resolve) {
      var maxAttempts = 3;
      function attempt(n) {
        setState("checking", n === 0 ? "Checking…" : "Waking up… (attempt " + (n + 1) + " of " + maxAttempts + ")", null);
        checkOnce().then(function (result) {
          var now = new Date().toLocaleTimeString();
          if (result.state === "online") {
            setState("online", "Online", [
              { label: "DB", value: result.db },
              { label: "Response time", value: result.ms + "ms" },
              { label: "Last checked", value: now }
            ]);
            resolve();
          } else if (result.state === "degraded") {
            // The server responded — retrying tells us nothing new. Stop
            // immediately instead of looping into a false "Offline".
            setState("degraded", "Degraded", [
              { label: "DB", value: result.db || "unreachable" },
              { label: "Response time", value: result.ms + "ms" },
              { label: "Last checked", value: now }
            ]);
            resolve();
          } else if (n + 1 >= maxAttempts) {
            setState("offline", "Offline", [
              { text: "Could not reach the backend after " + maxAttempts + " attempts." },
              { label: "Last checked", value: now }
            ]);
            resolve();
          } else {
            setTimeout(function () { attempt(n + 1); }, 5000);
          }
        });
      }
      attempt(0);
    });
  }

  function runChecked() {
    if (checking) return Promise.resolve();
    checking = true;
    btn.disabled = true;
    return runWithRetry().finally(function () {
      checking = false;
      btn.disabled = false;
    });
  }

  btn.addEventListener("click", runChecked);

  runChecked();
`;
