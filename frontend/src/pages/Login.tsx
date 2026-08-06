import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
      navigate("/");
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

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div className="logo-mark">Z</div>
          <div>
            <div className="logo-name">Zoffec CMS</div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
            <input type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            <label htmlFor="remember" style={{ fontSize: 12, color: "var(--text2)" }}>Remember me for 30 days</label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
