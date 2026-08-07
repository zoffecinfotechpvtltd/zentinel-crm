import { pool } from "../db/pool";

// Fires a JSON POST to whatever URL Admin configured under Settings ->
// Integrations for a given business event — the internal-team equivalent of
// a Zapier/Make.com trigger, without needing a published Zapier app. Any
// automation tool that can receive a webhook (Slack incoming webhooks,
// Make.com, n8n, Zapier's own "Webhooks" trigger) can consume this.
// Fire-and-forget: a broken or unreachable webhook URL must never break the
// business action that triggered it.
export async function fireWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const result = await pool.query(`select value from settings where key = 'outbound_webhook_url'`);
    const url = result.rows[0]?.value?.url;
    if (!url) return;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
    });
  } catch (err) {
    console.error(`Outbound webhook for event "${event}" failed:`, err);
  }
}
