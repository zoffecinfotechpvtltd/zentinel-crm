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
<script src="/status.js"></script>
</body>
</html>
`;

export const STATUS_PAGE_SCRIPT = `
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
`;
