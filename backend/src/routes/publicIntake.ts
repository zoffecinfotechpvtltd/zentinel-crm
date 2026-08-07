import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { createNotification } from "../lib/notifications";
import { getNextRoundRobinSalesRep } from "./leads";

const router = Router();

// Unauthenticated by design — this is the endpoint a public website's
// "Contact us" / "Get a quote" form posts to, so a visitor obviously has no
// Zentinel login. The secret (set once under Settings -> Integrations,
// pasted into the website's form handler) is the only thing standing
// between this and an open lead-injection endpoint; requireAuth doesn't
// apply here at all.
const intakeSchema = z.object({
  secret: z.string().min(1),
  company: z.string().min(1),
  contact_person: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().optional(),
  message: z.string().optional(),
});

router.post("/leads", async (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const f = parsed.data;

  const secretResult = await pool.query(`select value from settings where key = 'lead_webhook_secret'`);
  const configuredSecret = secretResult.rows[0]?.value?.secret;
  if (!configuredSecret || f.secret !== configuredSecret) {
    res.status(401).json({ error: "invalid_secret" });
    return;
  }

  const assignedTo = await getNextRoundRobinSalesRep();

  const result = await pool.query(
    `insert into leads (company, contact_person, email, mobile, source, notes, status, assigned_to)
     values ($1,$2,$3,$4,'Website',$5,'New',$6)
     returning id, company`,
    [f.company, f.contact_person, f.email, f.mobile ?? null, f.message ?? null, assignedTo]
  );

  if (assignedTo) {
    await createNotification(pool, {
      userId: assignedTo,
      type: "lead_assigned",
      entityType: "lead",
      entityId: result.rows[0].id,
      title: `New website lead: ${result.rows[0].company}`,
    });
  }

  res.status(201).json({ ok: true });
});

export default router;
