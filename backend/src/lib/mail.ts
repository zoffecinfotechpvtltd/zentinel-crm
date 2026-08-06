import nodemailer, { type Transporter } from "nodemailer";
import { pool } from "../db/pool";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

// SMTP config is stored in the `settings` table (admin-configurable via the
// in-app Settings screen — a desktop install has no env vars a normal user
// can edit) and falls back to env vars for anyone who prefers that. Works
// with any SMTP provider: Gmail, Zoho, Outlook, a company mail server,
// Brevo, whatever — this app has no opinion on which one you use.
async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const result = await pool.query(`select value from settings where key = 'smtp_config'`);
  if (result.rows.length > 0) {
    const v = result.rows[0].value as Partial<SmtpConfig>;
    if (v.host && v.user && v.pass) {
      return { host: v.host, port: v.port ?? 587, user: v.user, pass: v.pass, from: v.from || `Zoffec Sentinel <${v.user}>` };
    }
  }

  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, MAIL_FROM } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return { host: SMTP_HOST, port: Number(SMTP_PORT) || 587, user: SMTP_USER, pass: SMTP_PASS, from: MAIL_FROM || `Zoffec Sentinel <${SMTP_USER}>` };
  }

  return null;
}

let cachedTransporter: { key: string; transporter: Transporter } | null = null;
let warnedNoConfig = false;

function getTransporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransporter?.key === key) return cachedTransporter.transporter;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  cachedTransporter = { key, transporter };
  return transporter;
}

export async function sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const config = await getSmtpConfig();

  if (!config) {
    if (!warnedNoConfig) {
      console.warn(
        "No SMTP configured (Settings screen, or SMTP_HOST/SMTP_USER/SMTP_PASS env vars) — emails will be logged to console instead of sent."
      );
      warnedNoConfig = true;
    }
    console.log(`[dev-mail] To: ${params.to} | Subject: ${params.subject}\n${params.text}`);
    return;
  }

  const transporter = getTransporter(config);
  await transporter.sendMail({ from: config.from, to: params.to, subject: params.subject, text: params.text, html: params.html });
}

export async function sendTestMail(config: SmtpConfig, to: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transporter.sendMail({
    from: config.from,
    to,
    subject: "Zoffec Sentinel — SMTP test",
    text: "If you're reading this, your SMTP settings are working correctly.",
  });
}
