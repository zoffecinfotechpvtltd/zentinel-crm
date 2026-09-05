// Self-contained diagnostic page — no build step, no auth (mirrors
// /api/health, which is already public), no external requests (fonts,
// scripts, or otherwise) — it has to load even when everything else,
// including a CDN, is unreachable. Exists so a non-technical person can
// check "is the backend up" without opening DevTools, and force a re-check
// when Render's free tier has put the service to sleep after idle (cold
// start takes roughly 30-50s). The page does make one request of its own, to
// /status.js (see STATUS_PAGE_SCRIPT below), plus its live reachability
// checks against /api/health.
//
// Visual concept: a vitals monitor. The API's reachability is a heartbeat —
// a live trace when it's up, a flatline the instant it isn't — so the
// state reads at a glance the way a hospital monitor does, before anyone
// reads a word of the label underneath it.

// Mirrors the classification logic embedded in STATUS_PAGE_SCRIPT below.
// STATUS_PAGE_SCRIPT is plain JS shipped to the browser — it can't import
// from this module — so this pure function exists purely so the
// online-vs-degraded decision has a unit-testable copy. If you change the
// classification logic in STATUS_PAGE_SCRIPT's `classifyHealthResponse`,
// update this one to match (and vice versa).
export function classifyHealthResponse(ok: boolean, body: { ok: boolean; db: string }): "online" | "degraded" {
  return ok && body.ok ? "online" : "degraded";
}

// One ECG cycle, drawn twice back to back (0-400, then 400-800) so the trace
// can scroll left by exactly one cycle-width and loop with no seam.
const ECG_CYCLE =
  "0,40 28,40 36,40 42,26 48,54 54,8 60,58 66,40 74,40 100,40 " +
  "128,40 136,40 142,26 148,54 154,8 160,58 166,40 174,40 200,40 " +
  "228,40 236,40 242,26 248,54 254,8 260,58 266,40 274,40 300,40 " +
  "328,40 336,40 342,26 348,54 354,8 360,58 366,40 374,40 400,40";
const ECG_POINTS = `${ECG_CYCLE} ${ECG_CYCLE.split(" ").map((pair) => {
  const [x, y] = pair.split(",");
  return `${Number(x) + 400},${y}`;
}).join(" ")}`;

export const STATUS_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zentinel — System Status</title>
<link id="favicon" rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%2364748b'/%3E%3C/svg%3E">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(120% 100% at 50% 0%, #131a2e 0%, #0a0e1a 60%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f1f5f9;
    padding: 24px;
  }
  .wrap { width: min(420px, 100%); }
  .brand { display: flex; align-items: center; gap: 9px; margin-bottom: 22px; }
  .mark {
    width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
    background: linear-gradient(135deg, #2563ff, #22c55e);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 13px; color: #fff;
  }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; color: #64748b; text-transform: uppercase; }

  .monitor {
    position: relative;
    background: #0d1424;
    border: 1px solid #1f2937;
    border-radius: 14px;
    padding: 18px 0;
    margin-bottom: 18px;
    overflow: hidden;
    box-shadow: inset 0 0 40px rgba(0,0,0,0.4);
  }
  .monitor::before {
    content: "";
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
  }
  .ecg { display: block; width: 200%; height: 64px; }
  .ecg-line {
    fill: none;
    stroke-width: 2.25;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .ecg-trace { stroke: #22c55e; filter: drop-shadow(0 0 5px rgba(34,197,94,0.55)); animation: scroll 2.6s linear infinite; }
  .ecg-flat { stroke: #dc2626; opacity: 0; transition: opacity 0.25s; }
  @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-400px); } }

  body[data-state="checking"] .ecg-trace { stroke: #f59e0b; filter: drop-shadow(0 0 5px rgba(245,158,11,0.5)); animation-duration: 1.8s; }
  body[data-state="degraded"] .ecg-trace { stroke: #f59e0b; filter: drop-shadow(0 0 5px rgba(245,158,11,0.5)); animation-duration: 4.2s; }
  body[data-state="offline"] .ecg-trace { opacity: 0; }
  body[data-state="offline"] .ecg-flat { opacity: 1; }

  .status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: #64748b; transition: background-color 0.2s; }
  body[data-state="checking"] .dot { background: #f59e0b; animation: pulse 1s ease-in-out infinite; }
  body[data-state="online"] .dot { background: #22c55e; }
  body[data-state="degraded"] .dot { background: #f59e0b; }
  body[data-state="offline"] .dot { background: #dc2626; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  .status-word { font-size: 20px; font-weight: 750; letter-spacing: -0.01em; }
  .scope { font-size: 12px; color: #475569; margin: 3px 0 18px; }
  .scope code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #64748b; }

  .vitals {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.9;
    color: #64748b;
    background: #0d1424;
    border: 1px solid #1f2937;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 18px;
  }
  .vitals div { display: flex; justify-content: space-between; gap: 12px; }
  .vitals strong { color: #cbd5e1; font-weight: 500; }

  button {
    width: 100%;
    padding: 12px 16px;
    background: #2563ff;
    color: #fff;
    border: none;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 650;
    cursor: pointer;
    letter-spacing: 0.01em;
  }
  button:disabled { opacity: 0.55; cursor: wait; }
  button:not(:disabled):hover { background: #1c4fd6; }
  button:not(:disabled):active { transform: translateY(1px); }

  @media (prefers-reduced-motion: reduce) {
    .ecg-trace, .dot { animation: none !important; }
  }
</style>
</head>
<body data-state="checking">
  <div class="wrap">
    <div class="brand"><div class="mark">Z</div><div class="eyebrow">System Status</div></div>

    <div class="monitor">
      <svg class="ecg" viewBox="0 0 400 80" preserveAspectRatio="none">
        <polyline class="ecg-line ecg-trace" points="${ECG_POINTS}" />
        <polyline class="ecg-line ecg-flat" points="0,40 800,40" />
      </svg>
    </div>

    <div class="status-row">
      <div class="dot" id="dot"></div>
      <div class="status-word" id="label">Checking…</div>
    </div>
    <p class="scope">Live reachability check against this API's own <code>/api/health</code>.</p>

    <div class="vitals" id="meta">—</div>
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
  var favicon = document.getElementById("favicon");
  var checking = false;

  var FAVICON_COLOR = { checking: "%23f59e0b", online: "%2322c55e", degraded: "%23f59e0b", offline: "%23dc2626" };
  function setFavicon(state) {
    var color = FAVICON_COLOR[state] || "%2364748b";
    favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='" + color + "'/%3E%3C/svg%3E";
  }

  function renderMeta(lines) {
    while (meta.firstChild) meta.removeChild(meta.firstChild);
    lines.forEach(function (line) {
      var row = document.createElement("div");
      if (line.label) {
        var strong = document.createElement("strong");
        strong.textContent = line.label;
        row.appendChild(strong);
        row.appendChild(document.createTextNode(line.value));
      } else {
        row.textContent = line.text;
      }
      meta.appendChild(row);
    });
  }

  function setState(state, text, metaLines) {
    document.body.dataset.state = state;
    dot.className = "dot";
    label.textContent = text;
    setFavicon(state);
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
        setState("checking", n === 0 ? "Checking…" : "Waking up…", n === 0 ? null : [
          { text: "Attempt " + (n + 1) + " of " + maxAttempts + " — Render free-tier instances can take 30-50s to wake." }
        ]);
        checkOnce().then(function (result) {
          var now = new Date().toLocaleTimeString();
          if (result.state === "online") {
            setState("online", "Online", [
              { label: "Database", value: result.db },
              { label: "Response time", value: result.ms + "ms" },
              { label: "Last checked", value: now }
            ]);
            resolve();
          } else if (result.state === "degraded") {
            // The server responded — retrying tells us nothing new. Stop
            // immediately instead of looping into a false "Offline".
            setState("degraded", "Degraded", [
              { label: "Database", value: result.db || "unreachable" },
              { label: "Response time", value: result.ms + "ms" },
              { label: "Last checked", value: now }
            ]);
            resolve();
          } else if (n + 1 >= maxAttempts) {
            setState("offline", "Offline", [
              { text: "Couldn't reach the backend after " + maxAttempts + " attempts." },
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
