import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function Setup({ onDone }: { onDone: () => void }) {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/setup/create-admin", { name, email, password });
      await refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div className="logo-mark">Z</div>
          <div>
            <div className="logo-name">Zoffec Sentinel</div>
            <div className="logo-sub">Epitome of Integrity</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
          First time here — create the admin account. There's no default login; this is the only account that exists until you create your team's users afterward.
        </p>
        <form onSubmit={onSubmit}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Your name</label>
            <input className="form-input" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label">Confirm password</label>
            <input className="form-input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? "Creating…" : "Create admin account"}
          </button>
        </form>
      </div>
    </div>
  );
}
