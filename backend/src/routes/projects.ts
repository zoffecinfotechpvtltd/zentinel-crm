import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeActivityLog } from "../lib/activityLog";
import { createNotification } from "../lib/notifications";
import { buildSingleEventIcs } from "../lib/ics";
import { mountNotesAndAttachments } from "../lib/attachNotesAndFiles";
import { fireWebhook } from "../lib/outboundWebhook";

const router = Router();

router.use(requireAuth, requireRole("admin", "ops", "finance"));

const STATUSES = ["Not Started", "In Progress", "Awaiting Client", "Completed", "On Hold"] as const;

const OVERDUE_EXPR = `(p.due_date < current_date and p.status <> 'Completed')`;
const DUE_THIS_WEEK_EXPR = `(p.due_date >= current_date and p.due_date < current_date + interval '7 days' and p.status <> 'Completed')`;

router.get("/", async (req, res) => {
  const conditions: string[] = ["p.deleted_at is null"];
  const values: unknown[] = [];
  let i = 1;

  if (req.query.status) {
    conditions.push(`p.status = $${i++}`);
    values.push(req.query.status);
  }
  if (req.query.assigned_to) {
    conditions.push(`p.assigned_to = $${i++}`);
    values.push(req.query.assigned_to);
  }
  if (req.query.client_id) {
    conditions.push(`p.client_id = $${i++}`);
    values.push(req.query.client_id);
  }
  if (req.query.overdue === "true") {
    conditions.push(OVERDUE_EXPR);
  }
  if (req.query.due_this_week === "true") {
    conditions.push(DUE_THIS_WEEK_EXPR);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;
  const whereClause = conditions.join(" and ");

  const countResult = await pool.query(`select count(*) from projects p where ${whereClause}`, values);
  const dataResult = await pool.query(
    `select p.*, ${OVERDUE_EXPR} as is_overdue, ${DUE_THIS_WEEK_EXPR} as is_due_this_week,
       u.name as assigned_to_name, s.name as service_name, o.company as opportunity_company
     from projects p
     left join users u on u.id = p.assigned_to
     left join services s on s.id = p.service_id
     left join opportunities o on o.id = p.opportunity_id
     where ${whereClause}
     order by p.due_date nulls last, p.created_at desc
     limit $${i} offset $${i + 1}`,
    [...values, perPage, offset]
  );

  res.json({ data: dataResult.rows, total: Number(countResult.rows[0].count), page, per_page: perPage });
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    `select p.*, ${OVERDUE_EXPR} as is_overdue, ${DUE_THIS_WEEK_EXPR} as is_due_this_week
     from projects p where p.id = $1 and p.deleted_at is null`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const project = result.rows[0];

  const siblingsResult = await pool.query(
    `select id, name, status, progress, due_date from projects
     where client_id = $1 and id <> $2 and deleted_at is null and status <> 'Completed'
     order by due_date nulls last`,
    [project.client_id, project.id]
  );

  res.json({ ...project, client_other_active_projects: siblingsResult.rows });
});

router.get("/:id/due-date.ics", async (req, res) => {
  const result = await pool.query(
    `select p.*, c.company as client_company from projects p
     left join clients c on c.id = p.client_id
     where p.id = $1 and p.deleted_at is null`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const project = result.rows[0];
  if (!project.due_date) {
    res.status(400).json({ error: "no_due_date" });
    return;
  }

  const ics = buildSingleEventIcs({
    uid: project.id,
    date: project.due_date,
    summary: `Due — ${project.name}`,
    description: project.client_company ? `Client: ${project.client_company}` : undefined,
  });
  res.setHeader("Content-Type", "text/calendar");
  res.setHeader("Content-Disposition", `attachment; filename="due-${project.name.replace(/[^a-z0-9]/gi, "-")}.ics"`);
  res.send(ics);
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  client_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  contract_id: z.string().uuid().optional(),
  opportunity_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum(STATUSES).optional().default("Not Started"),
  progress: z.number().int().min(0).max(100).optional().default(0),
  remarks: z.string().optional(),
});

function normalizeProgress(status: string | undefined, progress: number | undefined): number | undefined {
  if (status === "Completed") return 100;
  if (status === "Not Started") return 0;
  return progress;
}

router.post("/", requireRole("admin", "ops"), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  if (f.start_date && f.due_date && f.due_date < f.start_date) {
    res.status(400).json({
      error: "invalid_input",
      details: { due_date: "due_date must be on/after start_date" },
    });
    return;
  }

  if (f.opportunity_id) {
    const r = await pool.query(`select 1 from opportunities where id = $1 and deleted_at is null`, [f.opportunity_id]);
    if (r.rows.length === 0) {
      res.status(400).json({ error: "invalid_input", details: { opportunity_id: "opportunity_id does not refer to an existing opportunity" } });
      return;
    }
  }

  const progress = normalizeProgress(f.status, f.progress) ?? 0;

  const result = await pool.query(
    `insert into projects (
       name, client_id, service_id, contract_id, opportunity_id, assigned_to,
       start_date, due_date, status, progress, remarks, created_by, updated_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     returning *`,
    [
      f.name, f.client_id, f.service_id ?? null, f.contract_id ?? null, f.opportunity_id ?? null, f.assigned_to ?? null,
      f.start_date ?? null, f.due_date ?? null, f.status, progress, f.remarks ?? null, req.user!.id,
    ]
  );

  if (f.assigned_to) {
    await createNotification(pool, {
      userId: f.assigned_to,
      type: "project_assigned",
      entityType: "project",
      entityId: result.rows[0].id,
      title: `You were assigned a new project: ${result.rows[0].name}`,
    });
  }

  await writeActivityLog(pool, {
    entityType: "project",
    entityId: result.rows[0].id,
    actorId: req.user!.id,
    action: "created",
    detail: { name: result.rows[0].name },
  });

  res.status(201).json(result.rows[0]);
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  service_id: z.string().uuid().nullable().optional(),
  contract_id: z.string().uuid().nullable().optional(),
  opportunity_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  remarks: z.string().nullable().optional(),
});

router.patch("/:id", requireRole("admin", "ops"), async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = { ...parsed.data };

  const client = await pool.connect();
  try {
    const existingResult = await client.query(`select * from projects where id = $1 and deleted_at is null`, [
      req.params.id,
    ]);
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const existing = existingResult.rows[0];

    const effectiveStart = f.start_date !== undefined ? f.start_date : existing.start_date;
    const effectiveDue = f.due_date !== undefined ? f.due_date : existing.due_date;
    if (effectiveStart && effectiveDue && effectiveDue < effectiveStart) {
      res.status(400).json({
        error: "invalid_input",
        details: { due_date: "due_date must be on/after start_date" },
      });
      return;
    }

    if (f.status) {
      const normalized = normalizeProgress(f.status, f.progress ?? existing.progress);
      if (normalized !== undefined) f.progress = normalized;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(f)) {
      setClauses.push(`${key} = $${i++}`);
      values.push(value);
    }
    if (setClauses.length === 0) {
      res.status(400).json({ error: "no_fields_to_update" });
      return;
    }
    setClauses.push(`updated_by = $${i++}`, `updated_at = now()`);
    values.push(req.user!.id);
    values.push(req.params.id);

    await client.query("begin");

    const updateResult = await client.query(
      `update projects set ${setClauses.join(", ")} where id = $${i} returning *`,
      values
    );

    if (f.status && f.status !== existing.status) {
      await writeActivityLog(client, {
        entityType: "project",
        entityId: req.params.id,
        actorId: req.user!.id,
        action: "status_changed",
        detail: { from: existing.status, to: f.status },
      });
    }
    if (f.assigned_to !== undefined && f.assigned_to !== existing.assigned_to) {
      await writeActivityLog(client, {
        entityType: "project",
        entityId: req.params.id,
        actorId: req.user!.id,
        action: "reassigned",
        detail: { from: existing.assigned_to, to: f.assigned_to },
      });
    }

    await client.query("commit");

    if (f.assigned_to !== undefined && f.assigned_to && f.assigned_to !== existing.assigned_to) {
      await createNotification(pool, {
        userId: f.assigned_to,
        type: "project_assigned",
        entityType: "project",
        entityId: req.params.id,
        title: `You were assigned a project: ${updateResult.rows[0].name}`,
      });
    }

    if (f.status === "Completed" && existing.status !== "Completed") {
      fireWebhook("project.completed", { project_id: req.params.id, name: updateResult.rows[0].name });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const result = await pool.query(
    `update projects set deleted_at = now(), updated_by = $1, updated_at = now() where id = $2 and deleted_at is null returning id`,
    [req.user!.id, req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

mountNotesAndAttachments(router, "project");

export default router;
