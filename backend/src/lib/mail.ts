import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;
let warnedNoConfig = false;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (!warnedNoConfig) {
      console.warn(
        "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — emails will be logged to console instead of sent. " +
          "Set these env vars (Brevo: smtp-relay.brevo.com, port 587, your Brevo SMTP login + key) to send real email."
      );
      warnedNoConfig = true;
    }
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user, pass },
  });
  return transporter;
}

export async function sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const t = getTransporter();
  const from = process.env.MAIL_FROM || "Zoffec CMS <no-reply@zoffec.local>";

  if (!t) {
    console.log(`[dev-mail] To: ${params.to} | Subject: ${params.subject}\n${params.text}`);
    return;
  }

  await t.sendMail({ from, to: params.to, subject: params.subject, text: params.text, html: params.html });
}
