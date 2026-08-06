import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;

  const countResult = await pool.query(
    `select count(*) from notifications where user_id = $1 and archived_at is null`,
    [req.user!.id]
  );
  const dataResult = await pool.query(
    `select * from notifications where user_id = $1 and archived_at is null
     order by created_at desc limit $2 offset $3`,
    [req.user!.id, perPage, offset]
  );

  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

router.get("/unread-count", async (req, res) => {
  const result = await pool.query(
    `select count(*) from notifications where user_id = $1 and read_at is null and archived_at is null`,
    [req.user!.id]
  );
  res.json({ count: Number(result.rows[0].count) });
});

router.patch("/:id/read", async (req, res) => {
  const result = await pool.query(
    `update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null returning *`,
    [req.params.id, req.user!.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result.rows[0]);
});

router.post("/mark-all-read", async (req, res) => {
  const result = await pool.query(
    `update notifications set read_at = now() where user_id = $1 and read_at is null returning id`,
    [req.user!.id]
  );
  res.json({ ok: true, updated: result.rowCount ?? 0 });
});

export default router;
