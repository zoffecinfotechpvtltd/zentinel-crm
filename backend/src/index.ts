import "dotenv/config";
// Must load before any route files run — patches Express's router so that a
// rejected promise inside an `async (req, res) => {...}` handler reaches the
// error middleware below instead of hanging the request forever (Express 4
// doesn't do this on its own; that's an Express 5 feature).
import "express-async-errors";
import { createApp } from "./app";
import { startScheduler } from "./jobs/scheduler";

const app = createApp();

const port = Number(process.env.PORT) || 4000;
const onListening = () => {
  console.log(`Zentinel backend listening on :${port}`);
  startScheduler();
};

// Desktop build defaults to loopback-only — this machine's backend isn't
// reachable from other devices on the network unless the user explicitly
// chose "Server mode" in the Electron launcher, which sets DESKTOP_BIND=lan
// so the office's other machines can reach it. Cloud hosts (Render/Fly) need
// 0.0.0.0 too, but get there by simply not setting DESKTOP_MODE at all.
if (process.env.DESKTOP_MODE === "1" && process.env.DESKTOP_BIND !== "lan") {
  app.listen(port, "127.0.0.1", onListening);
} else {
  app.listen(port, onListening);
}
