import type { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../db/pool";

export type NotableEntity = "lead" | "client" | "project" | "invoice";

const ENTITY_TABLES: Record<NotableEntity, string> = {
  lead: "leads",
  client: "clients",
  project: "projects",
  invoice: "invoices",
};

function uploadsRoot(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
}

// Mounted onto each entity's own router (leads.ts, clients.ts, projects.ts,
// invoices.ts), so these routes inherit that router's existing
// requireAuth/requireRole gate for free — same pattern as contacts/contracts
// already nested under clients.ts.
//
// Known simplification: access here is "any role permitted to touch this
// entity type at all," not the finer per-record ownership scoping some
// entities have elsewhere (e.g. a Sales rep only seeing their own leads).
// Notes/files on a record they couldn't otherwise open are still only
// reachable by knowing that record's id, but this doesn't re-check
// ownership the way the entity's own GET /:id does. Worth tightening if
// that gap matters more than the duplication avoided by not doing so here.
export function mountNotesAndAttachments(router: Router, entityType: NotableEntity): void {
  const table = ENTITY_TABLES[entityType];

  async function entityExists(id: string): Promise<boolean> {
    const r = await pool.query(`select 1 from ${table} where id = $1 and deleted_at is null`, [id]);
    return r.rows.length > 0;
  }

  router.get(`/:id/notes`, async (req, res) => {
    if (!(await entityExists(req.params.id))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const result = await pool.query(
      `select n.id, n.body, n.created_at, n.created_by, u.name as author_name
       from notes n left join users u on u.id = n.created_by
       where n.entity_type = $1 and n.entity_id = $2 and n.deleted_at is null
       order by n.created_at desc`,
      [entityType, req.params.id]
    );
    res.json(result.rows);
  });

  router.post(`/:id/notes`, async (req, res) => {
    if (!(await entityExists(req.params.id))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      res.status(400).json({ error: "invalid_input", details: { body: "Note text is required" } });
      return;
    }
    const result = await pool.query(
      `insert into notes (entity_type, entity_id, body, created_by) values ($1,$2,$3,$4) returning id, body, created_at, created_by`,
      [entityType, req.params.id, body, req.user!.id]
    );
    res.status(201).json({ ...result.rows[0], author_name: req.user!.name });
  });

  router.delete(`/:id/notes/:noteId`, async (req, res) => {
    const noteResult = await pool.query(`select created_by from notes where id = $1 and deleted_at is null`, [req.params.noteId]);
    if (noteResult.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (req.user!.role !== "admin" && noteResult.rows[0].created_by !== req.user!.id) {
      res.status(403).json({ error: "forbidden", message: "You can only delete your own notes." });
      return;
    }
    await pool.query(`update notes set deleted_at = now() where id = $1`, [req.params.noteId]);
    res.json({ ok: true });
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(uploadsRoot(), entityType);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
        cb(null, `${crypto.randomUUID()}-${safeName}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  router.get(`/:id/attachments`, async (req, res) => {
    if (!(await entityExists(req.params.id))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const result = await pool.query(
      `select a.id, a.filename, a.mime_type, a.size_bytes, a.document_type, a.created_at, a.uploaded_by, u.name as uploader_name
       from attachments a left join users u on u.id = a.uploaded_by
       where a.entity_type = $1 and a.entity_id = $2 and a.deleted_at is null
       order by a.created_at desc`,
      [entityType, req.params.id]
    );
    res.json(result.rows);
  });

  router.post(`/:id/attachments`, upload.single("file"), async (req, res) => {
    if (!(await entityExists(req.params.id))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }
    const documentType = typeof req.body?.document_type === "string" && req.body.document_type.trim() ? req.body.document_type.trim() : null;
    const result = await pool.query(
      `insert into attachments (entity_type, entity_id, filename, mime_type, size_bytes, storage_path, document_type, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, filename, mime_type, size_bytes, document_type, created_at, uploaded_by`,
      [entityType, req.params.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, documentType, req.user!.id]
    );
    res.status(201).json({ ...result.rows[0], uploader_name: req.user!.name });
  });

  router.get(`/:id/attachments/:attId/file`, async (req, res) => {
    const result = await pool.query(
      `select * from attachments where id = $1 and entity_type = $2 and entity_id = $3 and deleted_at is null`,
      [req.params.attId, entityType, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const att = result.rows[0];
    if (!fs.existsSync(att.storage_path)) {
      res.status(404).json({ error: "file_missing", message: "This file is no longer on disk." });
      return;
    }
    res.setHeader("Content-Type", att.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${att.filename.replace(/"/g, "")}"`);
    res.sendFile(path.resolve(att.storage_path));
  });

  router.delete(`/:id/attachments/:attId`, async (req, res) => {
    const result = await pool.query(
      `select uploaded_by, storage_path from attachments where id = $1 and deleted_at is null`,
      [req.params.attId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (req.user!.role !== "admin" && result.rows[0].uploaded_by !== req.user!.id) {
      res.status(403).json({ error: "forbidden", message: "You can only delete your own uploads." });
      return;
    }
    await pool.query(`update attachments set deleted_at = now() where id = $1`, [req.params.attId]);
    fs.unlink(result.rows[0].storage_path, () => {}); // best-effort; DB soft-delete is the source of truth
    res.json({ ok: true });
  });
}
