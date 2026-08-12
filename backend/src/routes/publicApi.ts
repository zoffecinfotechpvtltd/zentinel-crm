import { Router } from "express";
import { pool } from "../db/pool";
import { requireApiKey } from "../middleware/apiKeyAuth";

const router = Router();
router.use(requireApiKey);

// Stable, deliberately smaller field set than the internal routes return —
// this is a public contract external tools build against, so it can't
// silently grow or shrink just because an internal column got added.
// Read-only: no POST/PATCH/DELETE here for v1.

function paginate(req: import("express").Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
  return { page, perPage, offset: (page - 1) * perPage };
}

router.get("/leads", async (req, res) => {
  const { page, perPage, offset } = paginate(req);
  const countResult = await pool.query(`select count(*) from leads where deleted_at is null`);
  const dataResult = await pool.query(
    `select id, company, contact_person, email, mobile, industry, source, status, value_estimate, created_at
     from leads where deleted_at is null order by created_at desc limit $1 offset $2`,
    [perPage, offset]
  );
  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

router.get("/clients", async (req, res) => {
  const { page, perPage, offset } = paginate(req);
  const countResult = await pool.query(`select count(*) from clients where deleted_at is null`);
  const dataResult = await pool.query(
    `select c.id, c.company, c.gstin, c.is_archived, c.created_at,
       (select cc.name from client_contacts cc where cc.client_id = c.id and cc.is_primary and cc.deleted_at is null limit 1) as primary_contact_name,
       (select cc.email from client_contacts cc where cc.client_id = c.id and cc.is_primary and cc.deleted_at is null limit 1) as primary_contact_email
     from clients c where c.deleted_at is null order by c.created_at desc limit $1 offset $2`,
    [perPage, offset]
  );
  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

router.get("/invoices", async (req, res) => {
  const { page, perPage, offset } = paginate(req);
  const countResult = await pool.query(`select count(*) from invoices where deleted_at is null`);
  const dataResult = await pool.query(
    `select id, invoice_number, client_id, status, subtotal, tax, total, invoice_date, due_date, created_at
     from invoices where deleted_at is null order by created_at desc limit $1 offset $2`,
    [perPage, offset]
  );
  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

export default router;
