import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
      await api.post("/auth/password-reset/confirm", { token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="logo-name" style={{ marginBottom: 12 }}>Zoffec Sentinel</div>
          <div className="banner banner-error">This link is missing its token — check you copied the whole URL from the email.</div>
          <Link className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} to="/login">Back to login</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="logo-name" style={{ marginBottom: 12 }}>Zoffec Sentinel</div>
          <div className="banner banner-info">Password set. Taking you to login…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div className="logo-mark">Z</div>
          <div>
            <div className="logo-name">Zoffec Sentinel</div>
            <div className="logo-sub">Set your password</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
          This link works once. Choose a password you haven't used elsewhere.
        </p>
        <form onSubmit={onSubmit}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label" htmlFor="new-password">New password</label>
            <input id="new-password" className="form-input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" className="form-input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? "Setting password…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
