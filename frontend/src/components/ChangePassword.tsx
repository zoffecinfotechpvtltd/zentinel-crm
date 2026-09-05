import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "./Toast";
import { passwordPolicyError } from "../lib/passwordPolicy";

export function ChangePassword() {
  const { push } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      push("Password updated", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Change Password</div>
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label" htmlFor="change-pw-current">Current password</label>
        <input id="change-pw-current" className="form-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label" htmlFor="change-pw-new">New password</label>
        <input id="change-pw-new" className="form-input" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label" htmlFor="change-pw-confirm">Confirm new password</label>
        <input id="change-pw-confirm" className="form-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={submit}
        disabled={busy || !currentPassword || !newPassword || !confirm}
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </div>
  );
}
