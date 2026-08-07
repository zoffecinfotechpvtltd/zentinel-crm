import "dotenv/config";
// Must load before any route files run — patches Express's router so that a
// rejected promise inside an `async (req, res) => {...}` handler reaches the
// error middleware below instead of hanging the request forever (Express 4
// doesn't do this on its own; that's an Express 5 feature).
import "express-async-errors";
import express from "express";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./db/pool";
import { startScheduler } from "./jobs/scheduler";
import setupRoutes from "./routes/setup";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import leadRoutes from "./routes/leads";
import serviceRoutes from "./routes/services";
import clientRoutes from "./routes/clients";
import projectRoutes from "./routes/projects";
import invoiceRoutes from "./routes/invoices";
import messageTemplateRoutes from "./routes/messageTemplates";
import notificationRoutes from "./routes/notifications";
import dashboardRoutes from "./routes/dashboard";
import reportRoutes from "./routes/reports";
import settingsRoutes from "./routes/settings";
import systemRoutes from "./routes/system";
import { getAppBaseUrl } from "./lib/appUrl";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: getAppBaseUrl(), credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Defense-in-depth on top of the per-account lockout in auth.ts: caps total
// login/reset attempts per IP so a distributed attempt across many accounts
// can't bypass the per-account limit.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/password-reset", authLimiter);
app.use("/api/setup", authLimiter);

app.use("/api/setup", setupRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/message-templates", messageTemplateRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/system", systemRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    console.error("Health check DB query failed:", err);
    res.status(503).json({ ok: false, db: "unreachable" });
  }
});

// Desktop build: the Electron app points this at the bundled frontend/dist so
// one process serves both API and UI — no separate frontend host needed.
// Unset in the cloud-hosting path (frontend deployed separately), where this
// block is simply skipped.
if (process.env.FRONTEND_DIST_PATH) {
  const frontendDist = process.env.FRONTEND_DIST_PATH;
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

const port = Number(process.env.PORT) || 4000;
const onListening = () => {
  console.log(`Zoffec Sentinel backend listening on :${port}`);
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
