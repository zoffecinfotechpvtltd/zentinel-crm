import { useEffect, useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";

type SmtpConfig = { host: string; port: number; user: string; from: string };

export function Settings() {
  const { data, reload } = useFetch<SmtpConfig | null>("/settings/smtp");
  const [form, setForm] = useState({ host: "", port: "587", user: "", pass: "", from: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ host: data.host, port: String(data.port), user: data.user, pass: "", from: data.from });
    }
  }, [data]);

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
      <div className="section-header">
        <div className="section-title">Settings</div>
      </div>

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
            <input className="form-input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Zoffec Sentinel <no-reply@yourcompany.com>" />
          </div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Save</button>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Send a test email to</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="form-input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button className="btn btn-ghost" onClick={sendTest} disabled={busy || !testTo}>Send test</button>
            </div>
          </div>
          {testResult && <div style={{ fontSize: 12, color: "var(--text2)" }}>{testResult}</div>}
        </div>
      </div>
    </div>
  );
}
