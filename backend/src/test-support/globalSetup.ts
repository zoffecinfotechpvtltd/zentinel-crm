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

// embedded-postgres ships as an ESM-only package; this project's tsconfig
// resolves modules as CommonJS (Node16), so any top-level type import of it
// (a static `import type`, or even a `typeof import(...)` type query) trips
// TS1541/TS1542 ("must have a resolution-mode attribute"). Sidestepped by
// never naming the type at all — it's only ever obtained via the dynamic
// `await import("embedded-postgres")` inside startPostgres() below, and
// left to inference from there (return type of startPostgres is inferred,
// not annotated).
const PORT_RANGE_START = 55000;
const PORT_RANGE_SIZE = 5000;
const MAX_START_ATTEMPTS = 5;

function randomPort(): number {
  return PORT_RANGE_START + Math.floor(Math.random() * PORT_RANGE_SIZE);
}

// A random port in the range can occasionally collide with something else
// already listening (another process on the machine, or a leftover instance
// from a previous run that didn't shut down cleanly) — without a retry that
// fails the entire run opaquely. Each attempt gets its own fresh data dir
// (initialise() writes into it) so a failed attempt's directory doesn't
// collide with the next one's.
async function startPostgres() {
  const { default: EmbeddedPostgresCtor } = await import("embedded-postgres");
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    const dataDir = path.join(os.tmpdir(), `zentinel-test-pg-${crypto.randomUUID()}`);
    const port = randomPort();
    const pg = new EmbeddedPostgresCtor({
      databaseDir: dataDir,
      port,
      user: "test",
      password: "test",
      persistent: false,
    });

    try {
      await pg.initialise();
      await pg.start();
      return { pg, port, dataDir };
    } catch (err) {
      lastErr = err;
      console.warn(
        `[test-support] embedded Postgres failed to start on port ${port} (attempt ${attempt}/${MAX_START_ATTEMPTS}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      await pg.stop().catch(() => {});
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }

  throw new Error(
    `Failed to start embedded Postgres after ${MAX_START_ATTEMPTS} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

export default async function setup() {
  const { pg, port, dataDir } = await startPostgres();

  // Attachment uploads (see backend/src/lib/attachNotesAndFiles.ts) resolve
  // their storage root from UPLOADS_DIR, falling back to
  // `path.join(process.cwd(), "uploads")` — the real checkout's
  // backend/uploads/ dir — when unset. Pointed at a throwaway temp dir here,
  // the same way the Postgres dataDir above is, so tests that upload files
  // (notesAndAttachments.test.ts, publicSign.test.ts) never write into the
  // actual repo.
  const uploadsDir = path.join(os.tmpdir(), `zentinel-test-uploads-${crypto.randomUUID()}`);

  // From here on, any failure must still stop the Postgres process and
  // clean up its data dir — otherwise setup() throws without ever
  // returning a teardown function, and vitest has nothing to call, leaking
  // the process and the temp directory for the rest of the machine's
  // lifetime (or until something notices).
  try {
    await pg.createDatabase("zentinel_test");

    process.env.DATABASE_URL = `postgres://test:test@localhost:${port}/zentinel_test`;
    process.env.APP_BASE_URL = "http://localhost:5173";
    process.env.SESSION_COOKIE_NAME = "zoffec_sid_test";
    process.env.NODE_ENV = "test";
    process.env.UPLOADS_DIR = uploadsDir;

    // stdio "pipe" (not "inherit") so a clean migration run doesn't dump
    // ~200 lines of SQL into every test invocation — the output is only
    // useful when something is actually wrong, so it's captured and only
    // printed if the migration step throws.
    try {
      execSync("npx node-pg-migrate up", {
        cwd: path.join(__dirname, "..", ".."),
        env: process.env,
        stdio: "pipe",
      });
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer };
      if (e.stdout?.length) process.stdout.write(e.stdout);
      if (e.stderr?.length) process.stderr.write(e.stderr);
      throw err;
    }
  } catch (err) {
    await pg.stop().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    throw err;
  }

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  };
}
