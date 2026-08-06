import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  const result = await pool.query(`select * from services where is_active = true order by name`);
  res.json(result.rows);
});

const createServiceSchema = z.object({ name: z.string().min(1) });

router.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const result = await pool.query(
    `insert into services (name, created_by, updated_by) values ($1, $2, $2) returning *`,
    [parsed.data.name, req.user!.id]
  );
  res.status(201).json(result.rows[0]);
});

export default router;
