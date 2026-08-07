import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { useToast } from "./Toast";

type Status = { enabled: boolean };

export function TwoFactorSettings() {
  const { push } = useToast();
  const { data: status, reload } = useFetch<Status>("/auth/2fa/status");

  const [step, setStep] = useState<"idle" | "setup" | "backup-codes" | "disable">("idle");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError(null);
    const result = await api.post<{ secret: string; otpauth_uri: string }>("/auth/2fa/setup");
    setSecret(result.secret);
    setOtpauthUri(result.otpauth_uri);
    setCode("");
    setStep("setup");
  }

  async function confirmSetup() {
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<{ backup_codes: string[] }>("/auth/2fa/enable", { code });
      setBackupCodes(result.backup_codes);
      setStep("backup-codes");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't confirm that code");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/2fa/disable", { password });
      push("Two-factor authentication turned off", "info");
      setPassword("");
      setStep("idle");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password didn't match");
    } finally {
      setBusy(false);
    }
  }

  function finishBackupCodes() {
    setStep("idle");
    setSecret("");
    setOtpauthUri("");
    setCode("");
    setBackupCodes([]);
  }

  return (
    <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="card-title">Two-Factor Authentication</div>

      {step === "idle" && (
        <>
          <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
            {status?.enabled
              ? "Enabled — a code from your authenticator app is required at login, in addition to your password."
              : "Adds a second step at login using an authenticator app (Google Authenticator, Authy, 1Password, etc.)."}
          </p>
          {status?.enabled ? (
            <button type="button" className="btn btn-ghost" onClick={() => { setStep("disable"); setError(null); }}>Turn off</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={startSetup}>Set up 2FA</button>
          )}
        </>
      )}

      {step === "setup" && (
        <>
          {error && <div className="banner banner-error">{error}</div>}
          <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>
            In your authenticator app, add a new account and enter this key manually (most apps call it "manual entry" or "enter a setup key" — no camera/QR needed):
          </p>
          <code className="mono" style={{ display: "block", background: "var(--bg3)", padding: "10px 12px", borderRadius: 8, fontSize: 14, letterSpacing: 1, marginBottom: 6, wordBreak: "break-all" }}>{secret}</code>
          <details style={{ marginBottom: 14 }}>
            <summary style={{ fontSize: 11, color: "var(--text3)", cursor: "pointer" }}>Show full setup link instead</summary>
            <code className="mono" style={{ display: "block", fontSize: 11, color: "var(--text3)", marginTop: 6, wordBreak: "break-all" }}>{otpauthUri}</code>
          </details>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Enter the 6-digit code it shows</label>
            <input className="form-input mono" style={{ fontSize: 16, letterSpacing: 2 }} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep("idle")}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={confirmSetup} disabled={busy || !code}>{busy ? "Confirming…" : "Confirm & enable"}</button>
          </div>
        </>
      )}

      {step === "backup-codes" && (
        <>
          <div className="banner banner-info">2FA is on. Save these backup codes somewhere safe — each works once, and this is the only time they're shown.</div>
          <div className="mono" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "var(--bg3)", padding: 14, borderRadius: 8, marginBottom: 14, fontSize: 14 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button type="button" className="btn btn-primary" onClick={finishBackupCodes}>I've saved these</button>
        </>
      )}

      {step === "disable" && (
        <>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Confirm your password to turn off 2FA</label>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setStep("idle"); setPassword(""); }}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={disable} disabled={busy || !password}>{busy ? "Turning off…" : "Turn off 2FA"}</button>
          </div>
        </>
      )}
    </div>
  );
}
