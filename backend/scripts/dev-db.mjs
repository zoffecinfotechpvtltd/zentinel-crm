// Standalone persistent embedded-postgres for local dev/manual verification
// sessions - same package the test harness and the Electron desktop build
// use, so no Docker/external Postgres install is needed on this machine.
// Not part of the app itself; throwaway tooling for this session.
import path from "node:path";
import os from "node:os";

const dataDir = path.join(os.tmpdir(), "zentinel-dev-pg");
const port = 55432;

const { default: EmbeddedPostgres } = await import("embedded-postgres");
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user: "zoffec",
  password: "zoffec_dev_local",
  persistent: true,
});

try {
  await pg.initialise();
} catch {
  // already initialised from a previous run - fine, start() below reuses it
}
await pg.start();
try {
  await pg.createDatabase("zoffec_cms");
} catch {
  // already exists
}

console.log(`DATABASE_URL=postgres://zoffec:zoffec_dev_local@localhost:${port}/zoffec_cms`);
console.log("Embedded Postgres running. Press Ctrl+C to stop.");

process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
process.on("SIGTERM", async () => { await pg.stop(); process.exit(0); });

// Keep the event loop alive - nothing else here guarantees an open handle.
await new Promise(() => {});
