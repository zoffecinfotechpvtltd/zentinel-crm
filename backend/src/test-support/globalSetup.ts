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
