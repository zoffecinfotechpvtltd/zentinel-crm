import { Router } from "express";
import multer from "multer";
import os from "node:os";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { dumpDatabase, restoreDatabase, type BackupFile } from "../lib/backupRestore";
import { isObjectStorageConfigured } from "../lib/objectStorage";

const router = Router();
const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.use(requireAuth, requireRole("admin"));

router.get("/audit-log", async (req, res) => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (req.query.entity_type) {
    conditions.push(`a.entity_type = $${i++}`);
    values.push(req.query.entity_type);
  }
  if (req.query.actor_id) {
    conditions.push(`a.actor_id = $${i++}`);
    values.push(req.query.actor_id);
  }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 50));
  const offset = (page - 1) * perPage;

  const countResult = await pool.query(`select count(*) from activity_log a ${whereClause}`, values);
  const dataResult = await pool.query(
    `select a.id, a.entity_type, a.entity_id, a.action, a.detail, a.created_at, u.name as actor_name, u.email as actor_email
     from activity_log a
     left join users u on u.id = a.actor_id
     ${whereClause}
     order by a.created_at desc
     limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

// Lets an admin find the addresses other machines on the office LAN can use
// to reach this one, when running in desktop Server mode. Loopback-only
// desktop installs and cloud deploys can still call this — it just returns
// whatever interfaces the OS reports, callers decide if it's useful.
router.get("/server-info", (_req, res) => {
  const addresses: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  res.json({
    hostname: os.hostname(),
    lan_addresses: addresses,
    port: Number(process.env.PORT) || 4000,
    desktop_bind: process.env.DESKTOP_MODE === "1" ? (process.env.DESKTOP_BIND === "lan" ? "lan" : "loopback") : "not_desktop",
    object_storage_configured: isObjectStorageConfigured,
  });
});

// Full logical backup, as a downloadable JSON file — every row in every
// app table, in FK-safe order. No pg_dump available inside the desktop
// build (the embedded Postgres package ships server binaries only), so
// this reimplements the same idea with the `pg` driver directly.
router.get("/backup", async (req, res) => {
  console.log(`[backup] ${req.user!.email} requested a full data export`);
  const backup = await dumpDatabase(pool);
  const filename = `zentinel-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(backup));
});

// Wipes every row in the database and replaces it with the uploaded
// backup's contents. Deliberately destructive and deliberately hard to
// trigger by accident: requires a typed confirmation phrase on top of
// whatever the frontend's own confirm dialog already demands.
router.post("/restore", backupUpload.single("file"), async (req, res) => {
  if (req.body?.confirm !== "REPLACE ALL DATA") {
    res.status(400).json({ error: "confirmation_required", message: 'Send confirm: "REPLACE ALL DATA" to proceed.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "no_file" });
    return;
  }

  let backup: BackupFile;
  try {
    backup = JSON.parse(req.file.buffer.toString("utf8"));
  } catch {
    res.status(400).json({ error: "invalid_backup_file", message: "That doesn't look like a valid backup JSON file." });
    return;
  }
  if (backup.version !== 1 || !Array.isArray(backup.tables)) {
    res.status(400).json({ error: "invalid_backup_file", message: "Unrecognized backup format." });
    return;
  }

  console.warn(`[restore] ${req.user!.email} is restoring from a backup dated ${backup.exported_at} — this replaces ALL current data.`);
  const client = await pool.connect();
  try {
    const result = await restoreDatabase(client, backup);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[restore] failed and was rolled back:", err);
    res.status(500).json({ error: "restore_failed", message: err instanceof Error ? err.message : "Restore failed and was rolled back — nothing was changed." });
  } finally {
    client.release();
  }
});

export default router;
