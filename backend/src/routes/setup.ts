import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { hashPassword } from "../lib/password";
import { createSession, setSessionCookie } from "../lib/session";
import { passwordSchema } from "../lib/passwordPolicy";

const router = Router();

// No default/bootstrap admin account ships with this app — every install
// creates its own, chosen by whoever runs it first. This endpoint is only
// reachable while the users table is empty, so it can't be used to hijack
// an already-set-up instance.
router.get("/status", async (_req, res) => {
  const result = await pool.query(`select count(*) from users`);
  res.json({ needsSetup: Number(result.rows[0].count) === 0 });
});

const createAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
});

router.post("/create-admin", async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Re-check inside the transaction (not just the GET above) so two
    // concurrent setup attempts can't both succeed. `count(*)` can't take a
    // row lock directly (Postgres rejects FOR UPDATE on aggregates), so an
    // advisory lock serializes concurrent attempts instead.
    await client.query(`select pg_advisory_xact_lock(727272)`);
    const countResult = await client.query(`select count(*) from users`);
    if (Number(countResult.rows[0].count) > 0) {
      await client.query("rollback");
      res.status(409).json({ error: "already_set_up", message: "An admin account already exists." });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const userResult = await client.query(
      `insert into users (email, password_hash, name, role) values ($1, $2, $3, 'admin') returning id, email, name, role`,
      [parsed.data.email, passwordHash, parsed.data.name]
    );
    const user = userResult.rows[0];
    await client.query(`update users set created_by = $1 where id = $1`, [user.id]);

    await client.query("commit");

    const session = await createSession(pool, { userId: user.id, rememberMe: false });
    setSessionCookie(res, session.id, false);

    res.status(201).json(user);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

export default router;
