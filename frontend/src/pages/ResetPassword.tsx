import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { passwordPolicyError } from "../lib/passwordPolicy";

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
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
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
        <AuthBrandPanel headline="That link didn't come through in one piece." />
        <div className="login-form-panel">
          <div className="login-card">
            <div className="login-card-head">
              <div className="login-card-title">Set your password</div>
            </div>
            <div className="banner banner-error">This link is missing its token — check you copied the whole URL from the email.</div>
            <Link className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} to="/login">Back to login</Link>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-shell">
        <AuthBrandPanel headline="All set. Taking you to sign in." />
        <div className="login-form-panel">
          <div className="login-card">
            <div className="login-card-head">
              <div className="login-card-title">Set your password</div>
            </div>
            <div className="banner banner-info">Password set. Taking you to login…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <AuthBrandPanel headline="Almost there. Choose a password you'll keep." />
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card-head">
            <div className="login-card-title">Set your password</div>
            <div className="login-card-sub">This link works once. Choose a password you haven't used elsewhere.</div>
          </div>
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
    </div>
  );
}
