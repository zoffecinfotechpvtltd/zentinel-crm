import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Admin + Sales only — same access as Leads (pre-sale pipeline data).
// Unlike Leads, there's no per-rep row scoping: this is a shared team
// tracker (matches how the source spreadsheet it replaced was used —
// everyone on the sales side could see the whole list), not an
// individually-owned queue.
router.use(requireAuth, requireRole("admin", "sales"));

const KINDS = ["service", "product"] as const;
const STAGES = ["Open", "Proposal Sent", "Won", "Lost"] as const;

async function attachTypeNames(opportunities: Array<{ id: string }>): Promise<Array<Record<string, unknown>>> {
  if (opportunities.length === 0) return [];
  const ids = opportunities.map((o) => o.id);
  const typesResult = await pool.query(
    `select otl.opportunity_id, ot.id, ot.name
     from opportunity_type_links otl join opportunity_types ot on ot.id = otl.opportunity_type_id
     where otl.opportunity_id = any($1)
     order by ot.name`,
    [ids]
  );
  const byOpportunity = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of typesResult.rows) {
    const list = byOpportunity.get(row.opportunity_id) ?? [];
    list.push({ id: row.id, name: row.name });
    byOpportunity.set(row.opportunity_id, list);
  }
  return opportunities.map((o) => ({ ...o, opportunity_types: byOpportunity.get(o.id) ?? [] }));
}

async function linkTypes(opportunityId: string, typeIds: string[]): Promise<void> {
  await pool.query(`delete from opportunity_type_links where opportunity_id = $1`, [opportunityId]);
  if (typeIds.length === 0) return;
  const values = typeIds.map((_, idx) => `($1, $${idx + 2})`).join(", ");
  await pool.query(
    `insert into opportunity_type_links (opportunity_id, opportunity_type_id) values ${values} on conflict do nothing`,
    [opportunityId, ...typeIds]
  );
}

// GET /api/opportunities — list with search/filter/pagination.
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;

  const conditions: string[] = ["o.deleted_at is null"];
  const values: unknown[] = [];
  let i = 1;

  if (req.query.search) {
    conditions.push(`(o.company ilike $${i} or o.client_name ilike $${i})`);
    values.push(`%${req.query.search}%`);
    i++;
  }
  if (req.query.kind) {
    conditions.push(`o.kind = $${i++}`);
    values.push(req.query.kind);
  }
  if (req.query.stage) {
    conditions.push(`o.stage = $${i++}`);
    values.push(req.query.stage);
  }
  if (req.query.opportunity_type_id) {
    conditions.push(
      `exists (select 1 from opportunity_type_links l where l.opportunity_id = o.id and l.opportunity_type_id = $${i++})`
    );
    values.push(req.query.opportunity_type_id);
  }
  if (req.query.followup === "today") {
    conditions.push(`o.follow_up_date = current_date and o.stage not in ('Won','Lost')`);
  } else if (req.query.followup === "overdue") {
    conditions.push(`o.follow_up_date < current_date and o.stage not in ('Won','Lost')`);
  } else if (req.query.followup === "upcoming") {
    conditions.push(`o.follow_up_date > current_date and o.stage not in ('Won','Lost')`);
  }

  const whereClause = conditions.join(" and ");

  const countResult = await pool.query(`select count(*) from opportunities o where ${whereClause}`, values);
  const dataResult = await pool.query(
    `select o.* from opportunities o where ${whereClause} order by o.created_at desc limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({
    data: await attachTypeNames(dataResult.rows),
    total: Number(countResult.rows[0].count),
    page,
    per_page: perPage,
  });
});

const createSchema = z.object({
  kind: z.enum(KINDS),
  company: z.string().min(1),
  client_name: z.string().optional(),
  contact: z.string().optional(),
  description: z.string().optional(),
  pdf_pg_url: z.string().optional(),
  opportunity_type_ids: z.array(z.string().uuid()).optional(),
  stage: z.enum(STAGES).optional(),
  lost_reason: z.string().optional(),
  follow_up_date: z.string().optional(),
  remarks: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  if (f.stage === "Lost" && !f.lost_reason) {
    res.status(400).json({
      error: "invalid_input",
      details: { lost_reason: "lost_reason is required when stage is set to Lost" },
    });
    return;
  }

  const result = await pool.query(
    `insert into opportunities (
       kind, company, client_name, contact, description, pdf_pg_url,
       stage, lost_reason, follow_up_date, remarks, assigned_to, created_by, updated_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     returning *`,
    [
      f.kind, f.company, f.client_name ?? null, f.contact ?? null, f.description ?? null, f.pdf_pg_url ?? null,
      f.stage ?? "Open", f.lost_reason ?? null, f.follow_up_date ?? null, f.remarks ?? null,
      f.assigned_to ?? null, req.user!.id,
    ]
  );
  const opportunity = result.rows[0];

  if (f.opportunity_type_ids?.length) {
    await linkTypes(opportunity.id, f.opportunity_type_ids);
  }

  const [withTypes] = await attachTypeNames([opportunity]);
  res.status(201).json(withTypes);
});

// --- Opportunity Types (admin-editable tag list, same pattern as Services) ---
// Registered before "/:id" so "/types" isn't swallowed by the :id param route.

router.get("/types", async (_req, res) => {
  const result = await pool.query(`select * from opportunity_types where is_active order by name`);
  res.json(result.rows);
});

const createTypeSchema = z.object({ name: z.string().min(1) });

router.post("/types", requireRole("admin"), async (req, res) => {
  const parsed = createTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const result = await pool.query(`insert into opportunity_types (name) values ($1) returning *`, [parsed.data.name]);
  res.status(201).json(result.rows[0]);
});

// --- Excel template + bulk import ---
// Also registered before "/:id" for the same route-ordering reason.

const TEMPLATE_HEADERS = [
  "Kind (service/product)", "Company", "Client Name", "Contact",
  "Opportunity Types (comma-separated)", "Description", "PDF/PG & URL",
  "Stage (Open/Proposal Sent/Won/Lost)", "Follow-up Date (YYYY-MM-DD)", "Remarks",
];

router.get("/import-template", async (_req, res) => {
  const typesResult = await pool.query(`select name from opportunity_types where is_active order by name`);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Opportunities");
  sheet.columns = TEMPLATE_HEADERS.map((header) => ({ header, width: 24 }));
  sheet.addRow([
    "service", "Example Client Pvt Ltd", "Jane Doe", "9999999999",
    "Accessibility, CSCRF", "SEBI CSCRF compliance audit", "https://example.com/proposal.pdf",
    "Open", "2026-09-01", "Follow up after Diwali",
  ]);

  const reference = workbook.addWorksheet("Reference — do not import");
  reference.columns = [
    { header: "Valid Kind values", key: "kind", width: 24 },
    { header: "Valid Stage values", key: "stage", width: 24 },
    { header: "Current Opportunity Types", key: "type", width: 30 },
  ];
  const maxRows = Math.max(KINDS.length, STAGES.length, typesResult.rows.length);
  for (let r = 0; r < maxRows; r++) {
    reference.addRow({
      kind: KINDS[r] ?? "",
      stage: STAGES[r] ?? "",
      type: typesResult.rows[r]?.name ?? "",
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="opportunities-import-template.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/import", importUpload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no_file" });
    return;
  }

  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's .d.ts predates the current @types/node Buffer<ArrayBufferLike>
    // generic and structurally rejects it even though this is a plain,
    // correct Node Buffer at runtime — casting through `Buffer` doesn't
    // help since that's the very (generic) type causing the mismatch;
    // `any` is the actual escape hatch here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(req.file.buffer as any);
  } catch {
    res.status(400).json({ error: "invalid_file", message: "That doesn't look like a valid .xlsx file." });
    return;
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    res.status(400).json({ error: "invalid_file", message: "The file has no worksheet to import from." });
    return;
  }

  const existingTypesResult = await pool.query(`select id, name from opportunity_types`);
  const typeIdByName = new Map<string, string>(existingTypesResult.rows.map((t) => [t.name.toLowerCase(), t.id]));

  let imported = 0;
  let duplicates = 0;
  const skipped: Array<{ row: number; reason: string }> = [];
  const dateFormat = /^\d{4}-\d{2}-\d{2}$/;

  // Duplicate guard: keyed on (kind, lowercased company) — the closest thing
  // to a natural key this data has (no external id in the source
  // spreadsheets). Re-uploading the same file (or a file with overlapping
  // rows) must not create repeat opportunities. Seeded from what's already
  // in the DB, then grown as each row in THIS file is accepted, so two
  // duplicate rows inside one file are also caught, not just duplicates
  // against pre-existing data.
  const existingKeysResult = await pool.query(
    `select kind, lower(company) as company from opportunities where deleted_at is null`
  );
  const seenKeys = new Set(existingKeysResult.rows.map((r) => `${r.kind}::${r.company}`));

  // Deliberately NOT one big transaction: this is a best-effort bulk import
  // over real-world messy spreadsheet data (verified against ~150 real
  // historical rows while building this — several had unparseable date
  // strings). One row's DB-level failure must not roll back every other
  // already-valid row in the same file; each row commits independently and
  // a failure is reported in `skipped`, not thrown.
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const kindRaw = row.getCell(1).text.trim().toLowerCase();
    const company = row.getCell(2).text.trim();
    if (!kindRaw && !company) continue; // blank row

    if (!KINDS.includes(kindRaw as (typeof KINDS)[number])) {
      skipped.push({ row: r, reason: `Kind must be "service" or "product", got "${kindRaw || "(blank)"}"` });
      continue;
    }
    if (!company) {
      skipped.push({ row: r, reason: "Company is required" });
      continue;
    }

    const dedupeKey = `${kindRaw}::${company.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) {
      skipped.push({ row: r, reason: `Duplicate — an opportunity for "${company}" (${kindRaw}) already exists` });
      duplicates++;
      continue;
    }

    const stageRaw = row.getCell(8).text.trim() || "Open";
    if (!STAGES.includes(stageRaw as (typeof STAGES)[number])) {
      skipped.push({ row: r, reason: `Stage must be one of ${STAGES.join("/")}, got "${stageRaw}"` });
      continue;
    }

    const followUpRaw = row.getCell(9).text.trim();
    if (followUpRaw && !dateFormat.test(followUpRaw)) {
      skipped.push({ row: r, reason: `Follow-up Date must be YYYY-MM-DD, got "${followUpRaw}"` });
      continue;
    }

    try {
      const typeNames = row.getCell(5).text.split(",").map((s) => s.trim()).filter(Boolean);
      const typeIds: string[] = [];
      for (const name of typeNames) {
        const key = name.toLowerCase();
        let typeId = typeIdByName.get(key);
        if (!typeId) {
          const inserted = await pool.query(
            `insert into opportunity_types (name) values ($1) on conflict (name) do update set name = excluded.name returning id`,
            [name]
          );
          typeId = inserted.rows[0].id;
          typeIdByName.set(key, typeId!);
        }
        typeIds.push(typeId!);
      }

      const opportunityResult = await pool.query(
        `insert into opportunities (
           kind, company, client_name, contact, description, pdf_pg_url,
           stage, follow_up_date, remarks, created_by, updated_by
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
         returning id`,
        [
          kindRaw, company, row.getCell(3).text.trim() || null, row.getCell(4).text.trim() || null,
          row.getCell(6).text.trim() || null, row.getCell(7).text.trim() || null,
          stageRaw, followUpRaw || null, row.getCell(10).text.trim() || null, req.user!.id,
        ]
      );

      if (typeIds.length > 0) {
        const values = typeIds.map((_, idx) => `($1, $${idx + 2})`).join(", ");
        await pool.query(
          `insert into opportunity_type_links (opportunity_id, opportunity_type_id) values ${values}`,
          [opportunityResult.rows[0].id, ...typeIds]
        );
      }

      seenKeys.add(dedupeKey);
      imported++;
    } catch (err) {
      skipped.push({ row: r, reason: err instanceof Error ? err.message : "Unexpected error inserting this row" });
    }
  }

  res.json({ imported, skipped, duplicates });
});

// --- Single-opportunity routes (":id" is a catch-all for this router's
// remaining single-segment paths, so everything above must stay above it) ---

router.get("/:id", async (req, res) => {
  const result = await pool.query(`select * from opportunities where id = $1 and deleted_at is null`, [req.params.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const [withTypes] = await attachTypeNames(result.rows);
  res.json(withTypes);
});

const updateSchema = z.object({
  kind: z.enum(KINDS).optional(),
  company: z.string().min(1).optional(),
  client_name: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  pdf_pg_url: z.string().nullable().optional(),
  opportunity_type_ids: z.array(z.string().uuid()).optional(),
  stage: z.enum(STAGES).optional(),
  lost_reason: z.string().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { opportunity_type_ids, ...f } = parsed.data;

  const existingResult = await pool.query(`select * from opportunities where id = $1 and deleted_at is null`, [req.params.id]);
  if (existingResult.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const existing = existingResult.rows[0];

  if (f.stage === "Lost" && !(f.lost_reason ?? existing.lost_reason)) {
    res.status(400).json({
      error: "invalid_input",
      details: { lost_reason: "lost_reason is required when stage is set to Lost" },
    });
    return;
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(f)) {
    setClauses.push(`${key} = $${i++}`);
    values.push(value);
  }
  if (setClauses.length === 0 && opportunity_type_ids === undefined) {
    res.status(400).json({ error: "no_fields_to_update" });
    return;
  }

  let updated = existing;
  if (setClauses.length > 0) {
    setClauses.push(`updated_by = $${i++}`, `updated_at = now()`);
    values.push(req.user!.id);
    values.push(req.params.id);
    const updateResult = await pool.query(
      `update opportunities set ${setClauses.join(", ")} where id = $${i} returning *`,
      values
    );
    updated = updateResult.rows[0];
  }

  if (opportunity_type_ids !== undefined) {
    await linkTypes(req.params.id, opportunity_type_ids);
  }

  const [withTypes] = await attachTypeNames([updated]);
  res.json(withTypes);
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const result = await pool.query(
    `update opportunities set deleted_at = now(), updated_by = $1, updated_at = now() where id = $2 and deleted_at is null returning id`,
    [req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
