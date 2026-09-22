import "dotenv/config";
// Must load before any route files run — patches Express's router so that a
// rejected promise inside an `async (req, res) => {...}` handler reaches the
// error middleware below instead of hanging the request forever (Express 4
// doesn't do this on its own; that's an Express 5 feature).
import "express-async-errors";
import { createApp } from "./app";
import { startScheduler } from "./jobs/scheduler";

const app = createApp();

// Two runtimes read this same file:
// - A traditional long-running process (local dev, Render, a container) —
//   needs app.listen() to actually bind a port, and it's the right place to
//   run the node-cron scheduler, since the process stays alive between runs.
// - Vercel's serverless/Fluid Compute Node runtime — freezes/thaws this
//   module between invocations, so a live app.listen() + free-running cron
//   timers registered at module scope don't behave like a normal server and
//   crashed every invocation (FUNCTION_INVOCATION_FAILED). Vercel's own
//   Express docs support a plain `export default app` with no .listen() call
//   for exactly this reason - it drives the app directly per-request.
// VERCEL is set automatically in that environment; nothing else sets it.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`Zentinel backend listening on :${port}`);
    startScheduler();
  });
}

export default app;
