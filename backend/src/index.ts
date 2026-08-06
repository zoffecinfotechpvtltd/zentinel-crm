import "dotenv/config";
// Must load before any route files run — patches Express's router so that a
// rejected promise inside an `async (req, res) => {...}` handler reaches the
// error middleware below instead of hanging the request forever (Express 4
// doesn't do this on its own; that's an Express 5 feature).
import "express-async-errors";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./db/pool";
import { startScheduler } from "./jobs/scheduler";
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

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.APP_BASE_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Defense-in-depth on top of the per-account lockout in auth.ts: caps total
// login/reset attempts per IP so a distributed attempt across many accounts
// can't bypass the per-account limit.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/password-reset", authLimiter);

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

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    console.error("Health check DB query failed:", err);
    res.status(503).json({ ok: false, db: "unreachable" });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`zoffec-cms backend listening on :${port}`);
  startScheduler();
});
