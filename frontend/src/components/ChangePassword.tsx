import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "./Toast";

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
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
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
    <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="card-title">Change Password</div>
      {error && <div className="banner banner-error">{error}</div>}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Current password</label>
        <input className="form-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">New password</label>
        <input className="form-input" type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Confirm new password</label>
        <input className="form-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
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
