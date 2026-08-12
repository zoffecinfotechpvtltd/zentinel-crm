import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateRawToken, hashToken } from "../lib/tokens";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/", async (_req, res) => {
  const result = await pool.query(
    `select id, name, key_prefix, created_at, last_used_at, is_active from api_keys where deleted_at is null order by created_at desc`
  );
  res.json(result.rows);
});

const createSchema = z.object({ name: z.string().min(1) });

// The raw key is returned exactly once, here, in the create response —
// it's never retrievable again afterward, same as the backup-restore
// confirmation phrase or a signature-request link. Losing it means
// generating a new key, not "looking it up."
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const rawKey = `zk_${generateRawToken()}`;
  const keyHash = hashToken(rawKey);
  const keyPrefix = rawKey.slice(0, 10);
  const result = await pool.query(
    `insert into api_keys (name, key_prefix, key_hash, created_by) values ($1,$2,$3,$4)
     returning id, name, key_prefix, created_at, last_used_at, is_active`,
    [parsed.data.name, keyPrefix, keyHash, req.user!.id]
  );
  res.status(201).json({ ...result.rows[0], key: rawKey });
});

router.patch("/:id", async (req, res) => {
  const parsed = z.object({ is_active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const result = await pool.query(
    `update api_keys set is_active = $1 where id = $2 and deleted_at is null returning id, name, key_prefix, created_at, last_used_at, is_active`,
    [parsed.data.is_active, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

router.delete("/:id", async (req, res) => {
  const result = await pool.query(
    `update api_keys set deleted_at = now() where id = $1 and deleted_at is null returning id`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
