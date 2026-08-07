import { useEffect, useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError, API_BASE } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconSettings } from "../components/Icons";

const RESTORE_CONFIRM_PHRASE = "REPLACE ALL DATA";

type SmtpConfig = { host: string; port: number; user: string; from: string };
type ServerInfo = { hostname: string; lan_addresses: string[]; port: number; desktop_bind: "lan" | "loopback" | "not_desktop"; object_storage_configured: boolean };
type IntegrationsConfig = { lead_webhook_secret: string | null; outbound_webhook_url: string | null };

export function Settings() {
  const { push } = useToast();
  const confirm = useConfirm();
  const { data, reload } = useFetch<SmtpConfig | null>("/settings/smtp");
  const { data: serverInfo } = useFetch<ServerInfo>("/system/server-info");
  const { data: integrations, reload: reloadIntegrations } = useFetch<IntegrationsConfig>("/settings/integrations");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [form, setForm] = useState({ host: "", port: "587", user: "", pass: "", from: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ host: data.host, port: String(data.port), user: data.user, pass: "", from: data.from });
    }
  }, [data]);

  useEffect(() => {
    if (integrations) setWebhookUrl(integrations.outbound_webhook_url ?? "");
  }, [integrations]);

  async function saveOutboundWebhook() {
    setWebhookSaved(false);
    try {
      await api.put("/settings/integrations/outbound-webhook", { url: webhookUrl });
      setWebhookSaved(true);
      reloadIntegrations();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to save", "error");
    }
  }

  async function regenerateLeadSecret() {
    setRegenerating(true);
    try {
      await api.post("/settings/integrations/lead-webhook-secret/regenerate");
      push("New lead-capture key generated — update your website's form handler with it.", "success");
      reloadIntegrations();
    } finally {
      setRegenerating(false);
    }
  }

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.put("/settings/smtp", { ...form, port: Number(form.port) });
      setSaved(true);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress(addr: string) {
    await navigator.clipboard.writeText(addr);
    push("Copied — send it to whoever's connecting", "success");
  }

  async function restoreFromBackup() {
    if (!restoreFile || restoreConfirmText !== RESTORE_CONFIRM_PHRASE) return;
    if (!(await confirm({ message: "This replaces EVERY record in the database with what's in this backup file. Everyone's current data will be gone. Continue?", confirmLabel: "Replace all data", danger: true }))) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("file", restoreFile);
      form.append("confirm", RESTORE_CONFIRM_PHRASE);
      const result = await api.postForm<{ tablesRestored: number; rowsRestored: number }>("/system/restore", form);
      push(`Restored ${result.rowsRestored} row(s) across ${result.tablesRestored} tables. Everyone should log in again.`, "success");
      setRestoreFile(null);
      setRestoreConfirmText("");
    } catch (err) {
      push(err instanceof Error ? err.message : "Restore failed — nothing was changed", "error");
    } finally {
      setRestoring(false);
    }
  }

  async function sendTest() {
    setTestResult(null);
    setBusy(true);
    try {
      await api.post("/settings/smtp/test", { to: testTo });
      setTestResult("Sent — check that inbox.");
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Failed to send test email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader icon={<IconSettings size={19} />} title="Settings" subtitle="Company-wide configuration — admin only. For your own sessions and 2FA, see Account & 2FA in the user menu." />

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title">Email (SMTP)</div>
        <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 16 }}>
          Works with any provider — Gmail, Zoho, Outlook, your own mail server. Used for password-reset links and the daily summary email. Leave unconfigured and emails just get skipped (nothing breaks).
        </p>
        {error && <div className="banner banner-error">{error}</div>}
        {saved && <div className="banner banner-info">Saved.</div>}
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">SMTP Host</label>
            <input className="form-input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.gmail.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Port</label>
            <input className="form-input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Password / App key</label>
            <input className="form-input" type="password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} placeholder={data ? "unchanged — enter to update" : ""} />
          </div>
          <div className="form-group full">
            <label className="form-label">"From" address</label>
            <input className="form-input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Zentinel <no-reply@yourcompany.com>" />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>Save</button>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Send a test email to</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="form-input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button type="button" className="btn btn-ghost" onClick={sendTest} disabled={busy || !testTo}>Send test</button>
            </div>
          </div>
          {testResult && <div style={{ fontSize: 12, color: "var(--text2)" }}>{testResult}</div>}
        </div>
      </div>

      {serverInfo && serverInfo.desktop_bind !== "not_desktop" && (
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <div className="card-title">Network</div>
          {serverInfo.desktop_bind === "loopback" && (
            <p style={{ fontSize: 12, color: "var(--text2)" }}>
              Running in loopback-only mode — only this PC can reach it. To share this data with the rest of the team, pick "Run as Server" during setup on the machine you want to host it (Menu → File → Switch server / connect elsewhere).
            </p>
          )}
          {serverInfo.desktop_bind === "lan" && (
            <>
              <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>
                This PC is hosting. On any other PC on this network, install Zentinel, choose "Connect to a Server," and enter one of these addresses — or just open it in a browser, no install needed.
              </p>
              {serverInfo.lan_addresses.length === 0 && <div className="banner banner-error">No LAN network interface detected — check this PC is connected to the office network.</div>}
              {serverInfo.lan_addresses.map((addr) => {
                const url = `http://${addr}:${serverInfo.port}`;
                return (
                  <div key={addr} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <code className="mono" style={{ background: "var(--bg3)", padding: "6px 10px", borderRadius: 6, fontSize: 13, flex: 1 }}>{url}</code>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyAddress(url)}>Copy</button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {serverInfo && serverInfo.desktop_bind === "not_desktop" && (
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <div className="card-title">File Storage</div>
          {serverInfo.object_storage_configured ? (
            <div className="banner banner-info">Object storage is active — uploaded files persist across deploys and restarts, and a full database backup is written there automatically every night.</div>
          ) : (
            <div className="banner banner-error">
              Attachments are stored on local disk, which is wiped on every redeploy/restart on a free-tier host. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY as environment variables to make uploads permanent — a free Supabase Storage bucket (S3-compatible, no card required) works with these as-is.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="card-title">Backup &amp; Restore</div>
        <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
          {serverInfo?.desktop_bind === "lan"
            ? "This machine holds every lead, client, invoice, and file record for the whole team — back it up regularly. A restore replaces everything currently in the database."
            : "Every record in the database, as a downloadable file. A restore replaces everything currently in the database."}
        </p>
        <a className="btn btn-ghost" href={`${API_BASE}/api/system/backup`}>Download backup now</a>

        <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          <div className="form-label" style={{ marginBottom: 8, color: "var(--danger)" }}>Restore from a backup file</div>
          <input
            type="file"
            accept="application/json"
            className="form-input"
            style={{ marginBottom: 10 }}
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          />
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Type "{RESTORE_CONFIRM_PHRASE}" to confirm</label>
            <input className="form-input" value={restoreConfirmText} onChange={(e) => setRestoreConfirmText(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!restoreFile || restoreConfirmText !== RESTORE_CONFIRM_PHRASE || restoring}
            onClick={restoreFromBackup}
          >
            {restoring ? "Restoring…" : "Restore — replace all data"}
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="card-title">Integrations</div>
        <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
          Internal automation hooks — not a public API. Use these to connect your own website's contact form or your own Slack/Make.com/n8n/Zapier webhook.
        </p>

        <div style={{ marginBottom: 20 }}>
          <div className="form-label" style={{ marginBottom: 6 }}>Website lead capture</div>
          <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
            POST <code className="mono">{`${API_BASE}/api/public/leads`}</code> with <code className="mono">{`{ secret, company, contact_person, email, mobile?, message? }`}</code> from your website's form handler to create a lead here automatically. Assigns round-robin to Sales, same as a manually entered lead.
          </p>
          {integrations?.lead_webhook_secret ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <code className="mono" style={{ background: "var(--bg3)", padding: "6px 10px", borderRadius: 6, fontSize: 12, flex: 1, wordBreak: "break-all" }}>{integrations.lead_webhook_secret}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(integrations.lead_webhook_secret ?? ""); push("Copied", "success"); }}>Copy</button>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Not set up yet.</p>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={regenerateLeadSecret} disabled={regenerating}>
            {regenerating ? "Generating…" : integrations?.lead_webhook_secret ? "Regenerate key" : "Generate key"}
          </button>
        </div>

        <div style={{ paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Outbound webhook URL</label>
            <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
              Fires a JSON POST here when a lead is Won or Lost, an invoice is fully paid, or a project is marked Completed — paste in a Slack incoming-webhook URL or a Make.com/n8n/Zapier webhook trigger.
            </p>
            <input className="form-input" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
          </div>
          {webhookSaved && <div className="banner banner-info">Saved.</div>}
          <button type="button" className="btn btn-primary btn-sm" onClick={saveOutboundWebhook}>Save</button>
        </div>
      </div>
    </div>
  );
}
