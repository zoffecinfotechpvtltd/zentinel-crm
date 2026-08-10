import express from "express";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./db/pool";
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
import publicIntakeRoutes from "./routes/publicIntake";
import publicSignRoutes from "./routes/publicSign";
import { getAllowedOrigins } from "./lib/appUrl";
import { STATUS_PAGE_HTML, STATUS_PAGE_SCRIPT } from "./lib/statusPage";

export function createApp(): express.Application {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());

  // The public lead-intake endpoint is meant to be called from a company
  // marketing site — a different origin than the app itself and one this
  // server has no way to know in advance — so it gets permissive CORS and is
  // mounted (with its own rate limit) before the app's normal credentialed
  // CORS policy below, which is deliberately restricted to known app origins.
  const publicIntakeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
  app.use("/api/public", cors(), publicIntakeLimiter, publicIntakeRoutes);

  // APP_BASE_URL supports a comma-separated list (e.g. production domain +
  // a Vercel preview URL) — cors' origin callback checks the request's
  // Origin header against all of them instead of a single fixed string.
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
  // Same-origin only (the /sign/:token page is part of this app's own
  // frontend, not an external site) — unauthenticated by design, but no
  // special CORS treatment needed, unlike /api/public above.
  app.use("/api/sign", publicSignRoutes);

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ ok: true, db: "connected" });
    } catch (err) {
      console.error("Health check DB query failed:", err);
      res.status(503).json({ ok: false, db: "unreachable" });
    }
  });

  app.get("/status", (_req, res) => {
    res.type("html").send(STATUS_PAGE_HTML);
  });

  app.get("/status.js", (_req, res) => {
    res.type("application/javascript").send(STATUS_PAGE_SCRIPT);
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

  return app;
}
