import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";

export function Login() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password, rememberMe);
      if (result.requiresTwoFactor) {
        setPendingToken(result.pendingToken);
      } else {
        navigate("/");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 423) setError("Account locked due to too many failed attempts. Try again later.");
        else setError("Invalid email or password.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyTwoFactor(pendingToken, code);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitForgot(e: FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    try {
      await api.post("/auth/password-reset/request", { email: forgotEmail });
      setForgotSent(true);
    } finally {
      setForgotBusy(false);
    }
  }

  if (forgotMode) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div className="logo-mark">Z</div>
            <div>
              <div className="logo-name">Zoffec Sentinel</div>
              <div className="logo-sub">Reset your password</div>
            </div>
          </div>
          {forgotSent ? (
            <div className="banner banner-info">If that email has an account, a reset link is on its way. Check your inbox.</div>
          ) : (
            <form onSubmit={onSubmitForgot}>
              <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>Enter your account email — we'll send a link to set a new password.</p>
              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="forgot-email">Email</label>
                <input id="forgot-email" className="form-input" type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus />
              </div>
              <button className="btn btn-primary" type="submit" disabled={forgotBusy} style={{ width: "100%", justifyContent: "center" }}>
                {forgotBusy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
          <button type="button" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (pendingToken) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div className="logo-mark">Z</div>
            <div>
              <div className="logo-name">Zoffec Sentinel</div>
              <div className="logo-sub">Two-step verification</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
            Enter the 6-digit code from your authenticator app, or one of your backup codes.
          </p>
          <form onSubmit={onSubmitCode}>
            {error && <div className="banner banner-error">{error}</div>}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label" htmlFor="twofactor-code">Code</label>
              <input id="twofactor-code" className="form-input mono" style={{ fontSize: 18, letterSpacing: 2, textAlign: "center" }} required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting || !code} style={{ width: "100%", justifyContent: "center" }}>
              {submitting ? "Verifying…" : "Verify"}
            </button>
            <button type="button" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => { setPendingToken(null); setCode(""); setError(null); }}>
              Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div className="logo-mark">Z</div>
          <div>
            <div className="logo-name">Zoffec Sentinel</div>
            <div className="logo-sub">Epitome of Integrity</div>
          </div>
        </div>
        <form onSubmit={onSubmit}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <label htmlFor="remember" style={{ fontSize: 12, color: "var(--text2)" }}>Remember me for 30 days</label>
            </div>
            <button type="button" onClick={() => setForgotMode(true)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--accent2)", cursor: "pointer" }}>
              Forgot password?
            </button>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
