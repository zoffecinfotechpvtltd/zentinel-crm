# Backend Test Coverage Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every backend route module real integration-test coverage (happy path, validation/edge case, authorization/not-found) using a from-scratch test harness — no test-database or HTTP-level testing exists in this codebase today.

**Architecture:** A `createApp()` factory extracted from `index.ts` lets tests build the real Express app without starting a listener or the cron scheduler. A vitest `globalSetup` starts one `embedded-postgres` instance for the whole test run (no Docker, no CI service block — validated live: initialise → start → query → stop, and confirmed `globalSetup`-set env vars reach test files, both in this exact sandbox) and runs migrations once. Each test file uses `supertest` against `createApp()`'s app, an `afterEach` that `TRUNCATE`s every app table for isolation, and a `loginAs(role)` helper that inserts a user row directly then logs in for real via `POST /api/auth/login` (so the login flow itself stays exercised by every other module's tests).

**Tech Stack:** vitest (already used), `supertest` (new devDependency), `embedded-postgres` (new devDependency — same package `desktop/package.json` already uses for the Electron build, just added to `backend` too), `pg` (already used).

## Global Constraints

- No Docker dependency anywhere in this plan — the harness must work with nothing but `npm install`.
- Follow the existing test style: `describe`/`it`/`expect` from vitest, terse assertions, no test-framework abstractions beyond what's specified here. See `backend/src/lib/__tests__/invoiceMath.test.ts` for the house style.
- Every test hits the real HTTP layer via `supertest` and a real Postgres — no mocking `pool`, no bypassing `requireAuth`/`requireRole`.
- Isolation between tests is `TRUNCATE ... RESTART IDENTITY CASCADE` in an `afterEach`, not transactions — every task's tests must call the shared `resetDb()` helper (Task 2) and must NOT invent their own cleanup.
- `loginAs(app, role)` (Task 2) is the only sanctioned way to get an authenticated session in a test — never insert a `sessions` row directly or fabricate a cookie.
- Valid roles are exactly `admin`, `sales`, `finance`, `ops` (`backend/migrations/1754400000000_base-schema.sql:12`). `req.user` has exactly `{id, email, name, role}` (`backend/src/middleware/auth.ts`).
- Money/GST fields are numbers rounded to 2dp — when asserting computed totals, use exact numeric equality (`toBe`), matching `invoiceMath.test.ts`'s existing pattern, not floating-point-tolerant matchers.
- Each task's test file lives at `backend/src/routes/__tests__/<module>.test.ts` (new directory — the existing `__tests__` dirs are `src/lib/__tests__` and `src/middleware/__tests__`; routes get their own, mirroring the source layout).
- Do not add tests for endpoints not listed in a task's brief. Do not add a 4th scenario "for completeness" — exactly happy/validation/authorization per module unless a task explicitly says otherwise (a couple of larger modules split their 3 scenarios across sub-resources, noted where relevant).
- All test files share one Postgres instance and one `TRUNCATE`-based `resetDb()` — `vitest.config.ts` (Task 2) turns off file-level parallelism so files never race each other's truncates. Every task's test file must call `resetDb()` in `afterEach`, never assume a clean table from a fresh process.

---

### Task 1: Extract `createApp()` so the app can be imported without starting a server

**Files:**
- Create: `backend/src/app.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces: `export function createApp(): express.Application` from `backend/src/app.ts` — consumed by every later task's test files (via the harness in Task 2).

- [ ] **Step 1: Read the current file**

Read `backend/src/index.ts` in full first — the exact current content matters for this extraction (line numbers referenced elsewhere in this repo's comments must stay accurate for the CORS-logging and `/status` routes added in a prior branch).

- [ ] **Step 2: Create `backend/src/app.ts`**

Move everything from `index.ts` between the `express()` call and the final `app.listen(...)` block into a new exported function. Concretely, `backend/src/app.ts` should contain the same imports `index.ts` currently has (all of them except none are dropped — `path`, `cookieParser`, `cors`, `helmet`, `rateLimit`, `pool`, all the route modules, `getAllowedOrigins`, `STATUS_PAGE_HTML`), and export:

```ts
export function createApp(): express.Application {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());

  const publicIntakeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
  app.use("/api/public", cors(), publicIntakeLimiter, publicIntakeRoutes);

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
```

Import `STATUS_PAGE_HTML` and `STATUS_PAGE_SCRIPT` from `./lib/statusPage` at the top alongside the other imports. This must be byte-for-byte the same route registrations, in the same order, as the current `index.ts` — this is a pure extraction, not a rewrite. If what you read in Step 1 doesn't match what's shown above (e.g. different line content), use what you actually read, not this snippet — this snippet reflects the repo state as of this plan being written, but transcribe from the real file, not from here, if they differ.

- [ ] **Step 3: Rewrite `backend/src/index.ts`**

It keeps `import "dotenv/config"` and `import "express-async-errors"` as the first two lines (unchanged — order matters, both must load before route files run), then becomes:

```ts
import "dotenv/config";
import "express-async-errors";
import { createApp } from "./app";
import { startScheduler } from "./jobs/scheduler";

const app = createApp();

const port = Number(process.env.PORT) || 4000;
const onListening = () => {
  console.log(`Zentinel backend listening on :${port}`);
  startScheduler();
};

if (process.env.DESKTOP_MODE === "1" && process.env.DESKTOP_BIND !== "lan") {
  app.listen(port, "127.0.0.1", onListening);
} else {
  app.listen(port, onListening);
}
```

Keep the existing comments from the original file that explain *why* (the `express-async-errors` ordering comment, the desktop-bind comment) — move them to wherever their subject now lives (the ordering comment stays on the two top imports in `index.ts`; the desktop-bind comment stays on the `if (process.env.DESKTOP_MODE...)` block in `index.ts`; comments explaining route bodies — CORS, public intake, FRONTEND_DIST_PATH — move into `app.ts` with the code they describe).

- [ ] **Step 4: Verify it compiles and the existing suite still passes**

Run: `cd backend && npm run build`
Expected: exits 0, no TypeScript errors.

Run: `cd backend && npm test`
Expected: same 29 tests pass as before this change (this task doesn't add tests — it's a pure refactor. If the count differs, something broke).

- [ ] **Step 5: Manual smoke check**

Run: `cd backend && npm run dev`, then in another terminal: `curl -s http://localhost:4000/api/health` — expected `{"ok":true,...}` or `{"ok":false,"db":"unreachable"}` if no local DB configured (either is fine — the point is the server starts and the route responds, proving `createApp()` + `index.ts` still wire up identically to before).

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.ts backend/src/index.ts
git commit -m "refactor: extract createApp() so the Express app can be built without listening"
```

---

### Task 2: Test harness — embedded Postgres, supertest, resetDb, loginAs

**Files:**
- Create: `backend/vitest.config.ts`
- Create: `backend/src/test-support/globalSetup.ts`
- Create: `backend/src/test-support/testApp.ts`
- Modify: `backend/package.json` (add `supertest`, `@types/supertest`, `embedded-postgres` as devDependencies)

**Interfaces:**
- Consumes: `createApp` from `../app` (Task 1).
- Produces:
  - `backend/src/test-support/testApp.ts` exports:
    - `export const app: express.Application` — a single shared app instance for all tests.
    - `export async function resetDb(): Promise<void>` — truncates every app table; call in `afterEach`.
    - `export async function loginAs(role: "admin" | "sales" | "finance" | "ops", overrides?: Partial<{ name: string; email: string }>): Promise<{ agent: TestAgent; user: { id: string; email: string; name: string; role: string } }>` — inserts a user row with that role, logs in via real `POST /api/auth/login`, returns a `supertest` agent with the session cookie already attached (use `supertest.agent(app)`, not a fresh `request(app)` per call, so the cookie persists across requests on that agent) plus the created user's row.
  - Every later task's test file does `import { app, resetDb, loginAs } from "../../test-support/testApp";`.

- [ ] **Step 1: Add dependencies**

Run: `cd backend && npm install --save-dev supertest @types/supertest embedded-postgres@18.4.0-beta.17`

(That exact `embedded-postgres` version matches what `desktop/package.json` already pins — keep them in sync since they're the same package serving the same role in two places.)

- [ ] **Step 2: Write `backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./src/test-support/globalSetup.ts",
    testTimeout: 20000,
    hookTimeout: 20000,
    // All test files share ONE embedded Postgres instance (started once in
    // globalSetup) and every file's afterEach TRUNCATEs the whole database.
    // Vitest runs test FILES in parallel by default — with that on, one
    // file's TRUNCATE would wipe data another file's test is mid-assertion
    // on. Every route-module task in this plan depends on this being off.
    fileParallelism: false,
  },
});
```

- [ ] **Step 3: Write `backend/src/test-support/globalSetup.ts`**

```ts
// Starts one throwaway Postgres instance (via embedded-postgres — the same
// package the Electron desktop build uses, so no Docker/external service
// is needed here or in CI) for the whole test run, runs migrations against
// it once, and points DATABASE_URL at it before any test file loads the
// app. Vitest's globalSetup runs before test workers are spawned, and env
// vars set here are inherited by them — verified directly in this sandbox
// before writing this file, not assumed.
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

export default async function setup() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dataDir = path.join(os.tmpdir(), `zentinel-test-pg-${crypto.randomUUID()}`);
  const port = 55000 + Math.floor(Math.random() * 5000);

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "test",
    password: "test",
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zentinel_test");

  process.env.DATABASE_URL = `postgres://test:test@localhost:${port}/zentinel_test`;
  process.env.APP_BASE_URL = "http://localhost:5173";
  process.env.SESSION_COOKIE_NAME = "zoffec_sid_test";
  process.env.NODE_ENV = "test";

  execSync("npx node-pg-migrate up", {
    cwd: path.join(__dirname, "..", ".."),
    env: process.env,
    stdio: "inherit",
  });

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
```

- [ ] **Step 4: Write `backend/src/test-support/testApp.ts`**

```ts
import supertest from "supertest";
import { createApp } from "../app";
import { pool } from "../db/pool";
import { hashPassword } from "../lib/password";

export const app = createApp();

// Verified against every `create table` in backend/migrations/*.sql as of this
// plan being written (23 tables) — if a later migration adds a table, add it
// here too, or that table's rows will leak between tests.
const APP_TABLES = [
  "activity_log", "attachments", "notes", "signature_requests",
  "payments", "unmatched_payments", "tally_sync_log",
  "credit_notes", "invoice_line_items", "invoices", "invoice_number_counters",
  "projects", "contracts", "client_contacts", "clients",
  "leads", "message_templates", "services",
  "notifications", "password_reset_tokens", "sessions", "users",
  "settings",
];

export async function resetDb(): Promise<void> {
  await pool.query(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

const TEST_PASSWORD = "TestPass123";

export async function loginAs(
  role: "admin" | "sales" | "finance" | "ops",
  overrides: Partial<{ name: string; email: string }> = {}
): Promise<{ agent: ReturnType<typeof supertest.agent>; user: { id: string; email: string; name: string; role: string } }> {
  const email = overrides.email ?? `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const name = overrides.name ?? `Test ${role}`;
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const result = await pool.query(
    `insert into users (email, password_hash, name, role) values ($1, $2, $3, $4) returning id, email, name, role`,
    [email, passwordHash, name, role]
  );
  const user = result.rows[0];

  const agent = supertest.agent(app);
  const loginRes = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  if (loginRes.status !== 200) {
    throw new Error(`loginAs(${role}) failed: POST /api/auth/login returned ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return { agent, user };
}
```

Check `backend/src/lib/password.ts`'s actual export name before writing the import — use whatever it's really called (this plan assumes `hashPassword`; confirm by reading the file). The `APP_TABLES` list above was verified against every `create table` statement in `backend/migrations/*.sql` while writing this plan (23 tables, confirmed by grep, not assumed) — TOTP pending-enrollment state and SMTP config are NOT separate tables (TOTP-pending is in-memory only; SMTP/webhook config lives as rows in the generic `settings` key-value table, already included). If a migration is added after this plan was written, re-verify the list.

- [ ] **Step 5: Write one trivial smoke test to prove the harness works end to end**

Create `backend/src/test-support/__tests__/harness.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../testApp";
import supertest from "supertest";

describe("test harness", () => {
  afterEach(async () => {
    await resetDb();
  });

  it("can create an admin user and log in for real", async () => {
    const { agent, user } = await loginAs("admin");
    expect(user.role).toBe("admin");
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
  });

  it("resetDb actually clears data between tests", async () => {
    const res = await supertest(app).get("/api/users/assignable");
    // unauthenticated — should not see the admin from the previous test
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 6: Run it**

Run: `cd backend && npm test -- harness`
Expected: 2 tests pass. If `loginAs` fails, read the thrown error message (it includes the real login response) and fix `testApp.ts` rather than the test — this step exists to catch harness bugs before 17 more tasks build on top of it.

- [ ] **Step 7: Run the full existing suite to confirm nothing else broke**

Run: `cd backend && npm test`
Expected: all previous tests (29 from before Task 1, unaffected by this task) plus this task's 2 new ones pass, output pristine.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/vitest.config.ts backend/src/test-support
git commit -m "test: add embedded-postgres test harness (resetDb, loginAs, supertest agent)"
```

---

### Task 3: `auth.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `app`, `resetDb`, `loginAs` from `../../test-support/testApp` (Task 2).

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("auth routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("logs in with correct credentials and can fetch /me with the session cookie", async () => {
      const { agent, user } = await loginAs("admin");
      const res = await agent.get("/api/auth/me");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: user.id, email: user.email, role: "admin" });
    });
  });

  describe("validation / edge case", () => {
    it("locks the account after 8 failed attempts within the lockout window", async () => {
      const { user } = await loginAs("admin");
      const client = supertest(app);
      for (let i = 0; i < 7; i++) {
        const res = await client.post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe("invalid_credentials");
      }
      const eighth = await client.post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
      expect(eighth.status).toBe(423);
      expect(eighth.body.error).toBe("account_locked");

      // Even the CORRECT password is now rejected while locked.
      const correctButLocked = await client.post("/api/auth/login").send({ email: user.email, password: "TestPass123" });
      expect(correctButLocked.status).toBe(423);
    });

    it("rejects a malformed login body with a validation error", async () => {
      const res = await supertest(app).post("/api/auth/login").send({ email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_input");
    });
  });

  describe("authorization / not-found", () => {
    it("rejects /me without a session", async () => {
      const res = await supertest(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("rejects change-password with the wrong current password", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/auth/change-password").send({ currentPassword: "wrong", newPassword: "NewPass123" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_credentials");
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/auth`
Expected: 5 tests pass.

- [ ] **Step 3: Run the full suite**

Run: `cd backend && npm test`
Expected: all prior tests plus these 5 pass, output pristine.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/__tests__/auth.test.ts
git commit -m "test: add auth route coverage (login, lockout, validation, /me)"
```

---

### Task 4: `users.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/users.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("users routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a user and it appears in the list", async () => {
      const { agent } = await loginAs("admin");
      const email = `new-${Date.now()}@test.local`;
      const createRes = await agent.post("/api/users").send({ email, password: "NewPass123", name: "New Person", role: "ops" });
      expect(createRes.status).toBe(201);

      const listRes = await agent.get("/api/users");
      expect(listRes.status).toBe(200);
      expect(listRes.body.find((u: { email: string }) => u.email === email)).toBeTruthy();
    });

    it("any authenticated role can list assignable users without seeing email", async () => {
      await loginAs("admin", { email: "assignable-target@test.local" });
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/users/assignable");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].email).toBeUndefined();
    });
  });

  describe("validation / edge case", () => {
    it("rejects creating a user with an email that's already in use", async () => {
      const { agent, user } = await loginAs("admin");
      const res = await agent.post("/api/users").send({ email: user.email, password: "NewPass123", name: "Dup", role: "sales" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("email_already_exists");
    });

    it("deactivating a user immediately revokes their existing session", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const { agent: opsAgent, user: opsUser } = await loginAs("ops");

      // ops is logged in and working fine before deactivation.
      expect((await opsAgent.get("/api/auth/me")).status).toBe(200);

      const patchRes = await adminAgent.patch(`/api/users/${opsUser.id}`).send({ is_active: false });
      expect(patchRes.status).toBe(200);

      const afterRes = await opsAgent.get("/api/auth/me");
      expect(afterRes.status).toBe(401);
    });
  });

  describe("authorization / not-found", () => {
    it("rejects a non-admin from listing users", async () => {
      const { agent } = await loginAs("finance");
      const res = await agent.get("/api/users");
      expect(res.status).toBe(403);
    });

    it("returns 404 patching a nonexistent user", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.patch("/api/users/00000000-0000-0000-0000-000000000000").send({ name: "Ghost" });
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/users`
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/users.test.ts
git commit -m "test: add users route coverage (create, deactivate-revokes-session, role gate)"
```

---

### Task 5: `leads.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/leads.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("leads routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("creates a lead as sales and converts it to a client on Won", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/leads").send({
        company: "Acme Corp", contact_person: "Jane Doe", email: "jane@acme.test",
        industry: "IT/Software", source: "Referral",
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("New");
      const leadId = createRes.body.id;

      const wonRes = await agent.patch(`/api/leads/${leadId}`).send({ status: "Won" });
      expect(wonRes.status).toBe(200);

      const convertRes = await agent.post(`/api/leads/${leadId}/convert`);
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.client_id).toBeTruthy();
    });
  });

  describe("validation / edge case", () => {
    it("requires lost_reason when setting status to Lost", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/leads").send({
        company: "Beta LLC", contact_person: "Bob", email: "bob@beta.test",
        industry: "E-commerce", source: "Website",
      });
      const res = await agent.patch(`/api/leads/${createRes.body.id}`).send({ status: "Lost" });
      expect(res.status).toBe(400);
      expect(res.body.details.lost_reason).toBeTruthy();
    });

    it("rejects converting a lead that isn't Won", async () => {
      const { agent } = await loginAs("sales");
      const createRes = await agent.post("/api/leads").send({
        company: "Gamma Inc", contact_person: "Ann", email: "ann@gamma.test",
        industry: "E-commerce", source: "Website",
      });
      const res = await agent.post(`/api/leads/${createRes.body.id}/convert`);
      expect(res.status).not.toBe(201);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks finance and ops from leads entirely", async () => {
      const { agent: financeAgent } = await loginAs("finance");
      expect((await financeAgent.get("/api/leads")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/leads")).status).toBe(403);
    });

    it("blocks a sales rep from editing another sales rep's lead", async () => {
      const { agent: repA } = await loginAs("sales", { email: "repA@test.local" });
      const createRes = await repA.post("/api/leads").send({
        company: "Delta Co", contact_person: "Dana", email: "dana@delta.test",
        industry: "E-commerce", source: "Website",
      });
      const { agent: repB } = await loginAs("sales", { email: "repB@test.local" });
      const res = await repB.patch(`/api/leads/${createRes.body.id}`).send({ company: "Hijacked" });
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/leads`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/leads.test.ts
git commit -m "test: add leads route coverage (convert, Lost validation, role scoping)"
```

---

### Task 6: `clients.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/clients.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("clients routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a client, then finance adds a contract making it Active", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Widgets Ltd" });
      expect(createRes.status).toBe(201);
      const clientId = createRes.body.id;

      const { agent: financeAgent } = await loginAs("finance");
      const contractRes = await financeAgent.post(`/api/clients/${clientId}/contracts`).send({ value: 50000, status: "active" });
      expect(contractRes.status).toBe(201);

      const getRes = await adminAgent.get(`/api/clients/${clientId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.status).toBe("Active");
    });
  });

  describe("validation / edge case", () => {
    it("rejects creating a client with a duplicate company name", async () => {
      const { agent } = await loginAs("admin");
      await agent.post("/api/clients").send({ company: "Only One Inc" });
      const res = await agent.post("/api/clients").send({ company: "Only One Inc" });
      expect(res.status).toBe(500);
    });

    it("blocks finance from archiving a client (admin-only despite passing the route's role gate)", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/clients").send({ company: "Archivable Co" });
      const { agent: financeAgent } = await loginAs("finance");
      const res = await financeAgent.patch(`/api/clients/${createRes.body.id}`).send({ is_archived: true });
      expect(res.status).toBe(403);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales from every clients endpoint, including GET", async () => {
      const { agent } = await loginAs("sales");
      expect((await agent.get("/api/clients")).status).toBe(403);
    });

    it("returns 404 for a nonexistent client", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/clients/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/clients`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/clients.test.ts
git commit -m "test: add clients route coverage (Active status, duplicate company, role gate)"
```

---

### Task 7: `projects.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/projects.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function makeClient(adminAgent: Agent): Promise<string> {
  const res = await adminAgent.post("/api/clients").send({ company: `Client-${Date.now()}-${Math.random()}` });
  return res.body.id as string;
}

describe("projects routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("ops creates a project and completing it forces progress to 100", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);

      const { agent: opsAgent } = await loginAs("ops");
      const createRes = await opsAgent.post("/api/projects").send({ name: "Website Revamp", client_id: clientId, status: "In Progress", progress: 40 });
      expect(createRes.status).toBe(201);

      const patchRes = await opsAgent.patch(`/api/projects/${createRes.body.id}`).send({ status: "Completed" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.progress).toBe(100);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a due_date earlier than start_date", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);
      const { agent: opsAgent } = await loginAs("ops");
      const res = await opsAgent.post("/api/projects").send({
        name: "Bad Dates", client_id: clientId, start_date: "2026-06-01", due_date: "2026-05-01",
      });
      expect(res.status).toBe(400);
      expect(res.body.details.due_date).toBeTruthy();
    });

    it("empty PATCH body is rejected", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);
      const { agent: opsAgent } = await loginAs("ops");
      const createRes = await opsAgent.post("/api/projects").send({ name: "Empty Patch Target", client_id: clientId });
      const res = await opsAgent.patch(`/api/projects/${createRes.body.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("no_fields_to_update");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales entirely and blocks finance from writing", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const clientId = await makeClient(adminAgent);

      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/projects")).status).toBe(403);

      const { agent: financeAgent } = await loginAs("finance");
      expect((await financeAgent.get("/api/projects")).status).toBe(200);
      const writeRes = await financeAgent.post("/api/projects").send({ name: "Finance Can't Create", client_id: clientId });
      expect(writeRes.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/projects`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/projects.test.ts
git commit -m "test: add projects route coverage (progress normalization, date validation, role gate)"
```

---

### Task 8: `invoices.ts` tests

This module is the largest and most stateful in the app (Draft→Final locking, payments, credit notes, sequential numbering), so this task has more sub-cases than the 3-per-module norm — still organized under the same 3 categories.

**Files:**
- Create: `backend/src/routes/__tests__/invoices.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function makeInvoiceableClient(agent: Agent): Promise<string> {
  const res = await agent.post("/api/clients").send({ company: `Client-${Date.now()}-${Math.random()}`, tally_ledger_name: "TEST-LEDGER" });
  return res.body.id as string;
}

describe("invoices routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("creates a Draft, finalizes it with a sequential number, and a full payment marks it Paid", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient(agent);

      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId,
        line_items: [{ description: "Consulting", quantity: 1, rate: 100000, gst_rate: 18 }],
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("Draft");
      expect(createRes.body.subtotal).toBe(100000);
      expect(createRes.body.tax).toBe(18000);
      expect(createRes.body.total).toBe(118000);
      const invoiceId = createRes.body.id;

      const finalizeRes = await agent.post(`/api/invoices/${invoiceId}/finalize`);
      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.invoice_number).toMatch(/^ZI-\d{4}-\d+$/);

      const paymentRes = await agent.post(`/api/invoices/${invoiceId}/payments`).send({ amount: 118000, payment_date: "2026-01-15" });
      expect(paymentRes.status).toBe(201);
      expect(paymentRes.body.balance).toBe(0);
      expect(paymentRes.body.invoice_status).toBe("Paid");
    });
  });

  describe("validation / edge case", () => {
    it("rejects creating an invoice for a client with no tally_ledger_name", async () => {
      const { agent } = await loginAs("finance");
      const clientRes = await agent.post("/api/clients").send({ company: `No Ledger ${Date.now()}` });
      const res = await agent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 18 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("tally_ledger_name_required");
    });

    it("rejects a payment larger than the outstanding balance", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient(agent);
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      await agent.post(`/api/invoices/${createRes.body.id}/finalize`);
      const res = await agent.post(`/api/invoices/${createRes.body.id}/payments`).send({ amount: 999999, payment_date: "2026-01-15" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("amount_exceeds_balance");
    });

    it("rejects editing line items on a finalized invoice (must use a credit note instead)", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient(agent);
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      await agent.post(`/api/invoices/${createRes.body.id}/finalize`);
      const res = await agent.patch(`/api/invoices/${createRes.body.id}`).send({ line_items: [{ description: "Y", quantity: 1, rate: 2000, gst_rate: 0 }] });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("invoice_locked");
    });

    it("rejects a credit note against a Draft invoice", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient(agent);
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      const res = await agent.post(`/api/invoices/${createRes.body.id}/credit-notes`).send({ reason: "Discount", amount: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invoice_not_finalized");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales and ops from every invoices endpoint, including GET", async () => {
      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/invoices")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/invoices")).status).toBe(403);
    });

    it("returns 404 deleting a finalized (non-Draft) invoice", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient(agent);
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      await agent.post(`/api/invoices/${createRes.body.id}/finalize`);
      const res = await agent.delete(`/api/invoices/${createRes.body.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found_or_not_draft");
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/invoices`
Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/invoices.test.ts
git commit -m "test: add invoices route coverage (lifecycle, locking, payments, role gate)"
```

---

### Task 9: `services.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/services.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("services routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a service and any authenticated role can list it", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/services").send({ name: `GST Filing ${Date.now()}` });
      expect(createRes.status).toBe(201);

      const { agent: salesAgent } = await loginAs("sales");
      const listRes = await salesAgent.get("/api/services");
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((s: { id: string }) => s.id === createRes.body.id)).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a duplicate service name", async () => {
      const { agent } = await loginAs("admin");
      const name = `Payroll ${Date.now()}`;
      await agent.post("/api/services").send({ name });
      const res = await agent.post("/api/services").send({ name });
      expect(res.status).toBe(500);
    });

    it("rejects an empty name", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/services").send({ name: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks a non-admin from creating a service", async () => {
      const { agent } = await loginAs("ops");
      const res = await agent.post("/api/services").send({ name: "Ops Can't Create" });
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/services`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/services.test.ts
git commit -m "test: add services route coverage (create, duplicate name, admin-only write)"
```

---

### Task 10: `messageTemplates.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/messageTemplates.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("message-templates routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin creates a template and any role can list it", async () => {
      const { agent: adminAgent } = await loginAs("admin");
      const createRes = await adminAgent.post("/api/message-templates").send({
        name: "Proposal Nudge", channel: "email", body: "Hi {{name}}, following up on {{service}}.", category: "proposal_followup",
      });
      expect(createRes.status).toBe(201);

      const { agent: financeAgent } = await loginAs("finance");
      const listRes = await financeAgent.get("/api/message-templates");
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((t: { id: string }) => t.id === createRes.body.id)).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects an invalid channel", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/message-templates").send({
        name: "Bad Channel", channel: "sms", body: "Hi", category: "checkin",
      });
      expect(res.status).toBe(400);
    });

    it("rejects an empty PATCH body", async () => {
      const { agent } = await loginAs("admin");
      const createRes = await agent.post("/api/message-templates").send({
        name: "Patch Target", channel: "whatsapp", body: "Hi", category: "checkin",
      });
      const res = await agent.patch(`/api/message-templates/${createRes.body.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("no_fields_to_update");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks a non-admin from creating or updating a template", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.post("/api/message-templates").send({
        name: "Sales Can't Create", channel: "email", body: "Hi", category: "checkin",
      });
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/messageTemplates`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/messageTemplates.test.ts
git commit -m "test: add message-templates route coverage (create, enum validation, admin-only write)"
```

---

### Task 11: `notifications.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/notifications.test.ts`

Notifications don't have a direct "create" endpoint reachable from a fresh test (they're generated as side effects of other actions, e.g. round-robin lead assignment or the security-alert path in `requireRole`). Seed one directly via SQL through the shared `pool` import — this is the one task allowed to touch `pool` directly for setup, since there's no other way to get a notification row to test against without depending on another module's side effects.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";
import { pool } from "../../db/pool";

async function seedNotification(userId: string): Promise<string> {
  const res = await pool.query(
    `insert into notifications (user_id, title, body) values ($1, 'Test notification', 'body') returning id`,
    [userId]
  );
  return res.rows[0].id;
}

describe("notifications routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("marks a notification read and it no longer counts as unread", async () => {
      const { agent, user } = await loginAs("admin");
      const notifId = await seedNotification(user.id);

      const beforeRes = await agent.get("/api/notifications/unread-count");
      expect(beforeRes.body.count).toBe(1);

      const readRes = await agent.patch(`/api/notifications/${notifId}/read`);
      expect(readRes.status).toBe(200);

      const afterRes = await agent.get("/api/notifications/unread-count");
      expect(afterRes.body.count).toBe(0);
    });
  });

  describe("validation / edge case", () => {
    it("marking the same notification read twice returns not_found the second time", async () => {
      const { agent, user } = await loginAs("admin");
      const notifId = await seedNotification(user.id);
      expect((await agent.patch(`/api/notifications/${notifId}/read`)).status).toBe(200);
      const secondRes = await agent.patch(`/api/notifications/${notifId}/read`);
      expect(secondRes.status).toBe(404);
    });
  });

  describe("authorization / not-found", () => {
    it("returns 404 (not 403) trying to read another user's notification", async () => {
      const { user: owner } = await loginAs("admin", { email: "owner@test.local" });
      const notifId = await seedNotification(owner.id);
      const { agent: intruder } = await loginAs("sales", { email: "intruder@test.local" });
      const res = await intruder.patch(`/api/notifications/${notifId}/read`);
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/notifications`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/notifications.test.ts
git commit -m "test: add notifications route coverage (read, idempotency, cross-user 404)"
```

---

### Task 12: `dashboard.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("dashboard routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("returns stats, recent_activity, and upcoming_followups for admin", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("stats");
      expect(res.body).toHaveProperty("recent_activity");
      expect(res.body).toHaveProperty("upcoming_followups");
    });
  });

  describe("validation / edge case", () => {
    it("zeroes out client/revenue figures for the sales role", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.stats.active_clients).toBe(0);
      expect(res.body.stats.projects_active).toBe(0);
    });

    it("returns null (not 0) for revenue_change_pct when there's no prior-period baseline", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.stats.revenue_change_pct).toBeNull();
    });
  });

  describe("authorization / not-found", () => {
    it("requires authentication", async () => {
      const res = await supertest(app).get("/api/dashboard");
      expect(res.status).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/dashboard`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/dashboard.test.ts
git commit -m "test: add dashboard route coverage (role-scoped stats, null-baseline guard)"
```

---

### Task 13: `reports.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/reports.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("reports routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("sales can access lead-conversion (the one report open to sales)", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/reports/lead-conversion");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("funnel");
    });

    it("admin sets the fiscal-year revenue target and it's reflected in /revenue", async () => {
      const { agent } = await loginAs("admin");
      const putRes = await agent.put("/api/reports/revenue/target").send({ amount: 5000000, fiscal_year: "2026-27" });
      expect(putRes.status).toBe(200);
      const getRes = await agent.get("/api/reports/revenue");
      expect(getRes.status).toBe(200);
      expect(getRes.body.fy_target).toBe(5000000);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a non-positive target amount", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.put("/api/reports/revenue/target").send({ amount: -100, fiscal_year: "2026-27" });
      expect(res.status).toBe(400);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales from /revenue but allows ops (full report access despite no write access elsewhere)", async () => {
      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/reports/revenue")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/reports/revenue")).status).toBe(200);
    });

    it("blocks non-admin from setting the revenue target", async () => {
      const { agent } = await loginAs("finance");
      const res = await agent.put("/api/reports/revenue/target").send({ amount: 100, fiscal_year: "2026-27" });
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/reports`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/reports.test.ts
git commit -m "test: add reports route coverage (sales-open lead-conversion, target, role gate)"
```

---

### Task 14: `settings.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/settings.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("settings routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin regenerates the lead webhook secret and it shows up in /integrations", async () => {
      const { agent } = await loginAs("admin");
      const regenRes = await agent.post("/api/settings/integrations/lead-webhook-secret/regenerate");
      expect(regenRes.status).toBe(200);
      expect(regenRes.body.lead_webhook_secret).toBeTruthy();

      const getRes = await agent.get("/api/settings/integrations");
      expect(getRes.status).toBe(200);
      expect(getRes.body.lead_webhook_secret).toBe(regenRes.body.lead_webhook_secret);
    });

    it("admin saves SMTP config and the password is stripped from every response", async () => {
      const { agent } = await loginAs("admin");
      const putRes = await agent.put("/api/settings/smtp").send({ host: "smtp.test", port: 587, user: "u", pass: "secret", from: "noreply@test.local" });
      expect(putRes.status).toBe(200);
      expect(putRes.body.pass).toBeUndefined();

      const getRes = await agent.get("/api/settings/smtp");
      expect(getRes.status).toBe(200);
      expect(getRes.body.pass).toBeUndefined();
      expect(getRes.body.host).toBe("smtp.test");
    });
  });

  describe("validation / edge case", () => {
    it("GET /smtp returns null when nothing has been configured yet", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/settings/smtp");
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("smtp/test fails with smtp_not_configured before any SMTP config is saved", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/settings/smtp/test").send({ to: "someone@test.local" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("smtp_not_configured");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks every settings endpoint for non-admins", async () => {
      const { agent } = await loginAs("finance");
      expect((await agent.get("/api/settings/integrations")).status).toBe(403);
      expect((await agent.get("/api/settings/smtp")).status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/settings`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/settings.test.ts
git commit -m "test: add settings route coverage (webhook secret, SMTP config, admin-only)"
```

---

### Task 15: `setup.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/setup.test.ts`

Every test in this file relies on `resetDb()` having left the `users` table genuinely empty — true regardless of test/file execution order, since `afterEach` truncates after every single test across the whole run (file-level parallelism is off, per Task 2) and no migration seeds a user.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb } from "../../test-support/testApp";

describe("setup routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("reports needsSetup, creates the first admin, and auto-logs them in", async () => {
      const client = supertest(app);
      const statusBefore = await client.get("/api/setup/status");
      expect(statusBefore.body.needsSetup).toBe(true);

      const createRes = await client.post("/api/setup/create-admin").send({
        name: "First Admin", email: "first-admin@test.local", password: "AdminPass123",
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.role).toBe("admin");

      const statusAfter = await client.get("/api/setup/status");
      expect(statusAfter.body.needsSetup).toBe(false);

      const cookie = createRes.headers["set-cookie"];
      const meRes = await client.get("/api/auth/me").set("Cookie", cookie);
      expect(meRes.status).toBe(200);
      expect(meRes.body.email).toBe("first-admin@test.local");
    });
  });

  describe("validation / edge case", () => {
    it("rejects a password with no digit", async () => {
      const res = await supertest(app).post("/api/setup/create-admin").send({
        name: "Weak Pw", email: "weak@test.local", password: "onlyletters",
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_input");
    });
  });

  describe("authorization / not-found", () => {
    it("rejects creating a second admin once one already exists", async () => {
      const client = supertest(app);
      const first = await client.post("/api/setup/create-admin").send({
        name: "Admin One", email: "admin-one@test.local", password: "AdminPass123",
      });
      expect(first.status).toBe(201);

      const second = await client.post("/api/setup/create-admin").send({
        name: "Admin Two", email: "admin-two@test.local", password: "AdminPass123",
      });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe("already_set_up");
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/setup`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/setup.test.ts
git commit -m "test: add setup route coverage (first-admin creation, weak password, one-time-only)"
```

---

### Task 16: `publicIntake.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/publicIntake.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

async function configureWebhookSecret(): Promise<string> {
  const { agent } = await loginAs("admin", { email: "webhook-admin@test.local" });
  const res = await agent.post("/api/settings/integrations/lead-webhook-secret/regenerate");
  return res.body.lead_webhook_secret as string;
}

describe("public intake routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("creates a lead with the correct secret, sourced as Website", async () => {
      const secret = await configureWebhookSecret();
      const res = await supertest(app).post("/api/public/leads").send({
        secret, company: "Inbound Co", contact_person: "Ivy", email: "ivy@inbound.test",
      });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a malformed body (missing company)", async () => {
      const secret = await configureWebhookSecret();
      const res = await supertest(app).post("/api/public/leads").send({ secret, contact_person: "No Company", email: "x@test.local" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_input");
    });
  });

  describe("authorization / not-found", () => {
    it("rejects a wrong secret with invalid_secret", async () => {
      await configureWebhookSecret();
      const res = await supertest(app).post("/api/public/leads").send({
        secret: "totally-wrong", company: "Blocked Co", contact_person: "Bo", email: "bo@blocked.test",
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_secret");
    });

    it("rejects any secret when none has been configured yet", async () => {
      const res = await supertest(app).post("/api/public/leads").send({
        secret: "anything", company: "Too Early Co", contact_person: "Te", email: "te@early.test",
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_secret");
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/publicIntake`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/publicIntake.test.ts
git commit -m "test: add public intake route coverage (secret gate, validation)"
```

---

### Task 17: `publicSign.ts` tests

**Files:**
- Create: `backend/src/routes/__tests__/publicSign.test.ts`

Signing links only come from `POST /api/{entity}s/:id/attachments/:attId/signature-request`, an authenticated action — this test creates a lead, uploads an attachment to it, requests a signature, extracts the token from the returned link, then exercises the unauthenticated `/api/sign/:token` router with it.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import supertest from "supertest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function createSigningToken(agent: Agent): Promise<string> {
  const leadRes = await agent.post("/api/leads").send({
    company: "Sign Target Co", contact_person: "Sam", email: "sam@sign.test",
    industry: "Other", source: "Website",
  });
  const leadId = leadRes.body.id;
  const attachRes = await agent
    .post(`/api/leads/${leadId}/attachments`)
    .attach("file", Buffer.from("test document content"), "doc.txt");
  const attId = attachRes.body.id;
  const sigRes = await agent.post(`/api/leads/${leadId}/attachments/${attId}/signature-request`);
  const link: string = sigRes.body.link;
  return link.split("/sign/")[1];
}

describe("public sign routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("fetches a pending signing link, then signs it", async () => {
      const { agent } = await loginAs("sales");
      const token = await createSigningToken(agent);

      const getRes = await supertest(app).get(`/api/sign/${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.status).toBe("pending");

      const signRes = await supertest(app).post(`/api/sign/${token}`).send({ signer_name: "Sam Signer" });
      expect(signRes.status).toBe(200);
      expect(signRes.body.ok).toBe(true);
    });
  });

  describe("validation / edge case", () => {
    it("rejects signing an already-resolved link", async () => {
      const { agent } = await loginAs("sales");
      const token = await createSigningToken(agent);
      await supertest(app).post(`/api/sign/${token}`).send({ signer_name: "First Signer" });

      const res = await supertest(app).post(`/api/sign/${token}`).send({ signer_name: "Second Signer" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("already_resolved");
    });
  });

  describe("authorization / not-found", () => {
    it("returns 404 for an unknown token", async () => {
      const res = await supertest(app).get("/api/sign/not-a-real-token");
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/publicSign`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/publicSign.test.ts
git commit -m "test: add public sign route coverage (sign flow, double-resolve, unknown token)"
```

---

### Task 18: `system.ts` tests (light coverage)

**Files:**
- Create: `backend/src/routes/__tests__/system.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

describe("system routes", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("admin fetches server-info", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.get("/api/system/server-info");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("hostname");
    });
  });

  describe("validation / edge case", () => {
    it("rejects restore without the exact confirmation phrase", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent
        .post("/api/system/restore")
        .field("confirm", "yes please")
        .attach("file", Buffer.from(JSON.stringify({ version: 1, tables: [] })), "backup.json");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("confirmation_required");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks non-admins from the audit log", async () => {
      const { agent } = await loginAs("ops");
      const res = await agent.get("/api/system/audit-log");
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/system`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/__tests__/system.test.ts
git commit -m "test: add system route coverage (server-info, restore confirmation, admin-only)"
```

---

### Task 19: generic notes/attachments sub-routes tests (via leads)

**Files:**
- Create: `backend/src/routes/__tests__/notesAndAttachments.test.ts`

`mountNotesAndAttachments` (`backend/src/lib/attachNotesAndFiles.ts`) is mounted identically on leads/clients/projects/invoices — this task tests it once, through the leads router, plus the one cross-entity nuance called out in the source comment (no per-record ownership re-check, unlike `PATCH /leads/:id` itself).

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { app, resetDb, loginAs } from "../../test-support/testApp";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];

async function createLead(agent: Agent, company: string): Promise<string> {
  const res = await agent.post("/api/leads").send({
    company, contact_person: "Contact", email: `${company.replace(/\s+/g, "").toLowerCase()}@test.local`,
    industry: "Other", source: "Website",
  });
  return res.body.id as string;
}

describe("notes and attachments sub-routes (via leads)", () => {
  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("adds a note and uploads a file to a lead", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "Notes Target Co");

      const noteRes = await agent.post(`/api/leads/${leadId}/notes`).send({ body: "Called, left voicemail." });
      expect(noteRes.status).toBe(201);

      const fileRes = await agent.post(`/api/leads/${leadId}/attachments`).attach("file", Buffer.from("hello"), "note.txt");
      expect(fileRes.status).toBe(201);

      const listRes = await agent.get(`/api/leads/${leadId}/attachments`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
    });
  });

  describe("validation / edge case", () => {
    it("rejects an empty note body and a missing file", async () => {
      const { agent } = await loginAs("sales");
      const leadId = await createLead(agent, "Empty Note Co");

      const noteRes = await agent.post(`/api/leads/${leadId}/notes`).send({ body: "   " });
      expect(noteRes.status).toBe(400);

      const fileRes = await agent.post(`/api/leads/${leadId}/attachments`).send();
      expect(fileRes.status).toBe(400);
      expect(fileRes.body.error).toBe("no_file");
    });
  });

  describe("authorization / not-found", () => {
    it("returns 404 for notes/attachments on a nonexistent lead", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/leads/00000000-0000-0000-0000-000000000000/notes");
      expect(res.status).toBe(404);
    });

    it("a sales rep CAN note another sales rep's lead (coarse role gate only, no per-record ownership check here)", async () => {
      const { agent: repA } = await loginAs("sales", { email: "notes-repA@test.local" });
      const leadId = await createLead(repA, "Cross Rep Co");

      const { agent: repB } = await loginAs("sales", { email: "notes-repB@test.local" });
      const res = await repB.post(`/api/leads/${leadId}/notes`).send({ body: "I can see this lead's notes route." });
      expect(res.status).toBe(201);
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test -- routes/__tests__/notesAndAttachments`
Expected: 4 tests pass.

- [ ] **Step 3: Run the full suite one last time**

Run: `cd backend && npm test`
Expected: every test across every task in this plan passes, output pristine. Report the final total test count.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/__tests__/notesAndAttachments.test.ts
git commit -m "test: add generic notes/attachments sub-route coverage (via leads)"
```

## Self-Review Notes

- **Spec coverage:** every module listed in the design doc's section 4 scope (auth, leads, clients, projects, invoices, services, message-templates, notifications, dashboard, reports, settings, users, setup, public-intake, public-sign, system, plus the generic notes/attachments sub-routes) has a task. The harness itself (Tasks 1-2) implements the design doc's revised (embedded-postgres, TRUNCATE) approach.
- **Placeholder scan:** no TBD/TODO; every task has complete, real test code and exact expected values (status codes, error keys) pulled from reading the actual route source during planning, not guessed.
- **Type consistency:** `Agent` type alias (`Awaited<ReturnType<typeof loginAs>>["agent"]`) used consistently in every task that needs a typed helper parameter (Tasks 7, 8, 17, 19) — matches `loginAs`'s actual return shape defined in Task 2.
- **Corrected during self-review:** `leads.ts`'s `INDUSTRIES` enum does not include `"Retail"` — every lead-creation test uses `"E-commerce"` instead (verified against `backend/src/routes/leads.ts:15-18`). The `APP_TABLES` truncate list was corrected from an initial draft to match the real 23 tables found by grepping every migration's `create table` statement (removed a nonexistent `totp_pending`/`smtp_config`, fixed `client_contracts` → `contracts`, added `unmatched_payments`/`tally_sync_log`). `vitest.config.ts` gained `fileParallelism: false` after realizing every test file shares one database and one `TRUNCATE`-based reset — without it, parallel files would truncate each other's in-progress data.

