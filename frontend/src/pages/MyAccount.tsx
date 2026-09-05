import { useEffect, useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { TwoFactorSettings } from "../components/TwoFactorSettings";
import { ChangePassword } from "../components/ChangePassword";
import { IconUsers, IconTrash } from "../components/Icons";
import { UserAvatar } from "../components/UserAvatar";
import { friendlyUserAgent, friendlyAddress } from "../lib/format";

type Session = { id: string; user_agent: string | null; ip_address: string | null; created_at: string; is_current: boolean };

function ProfileCard() {
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  async function saveName() {
    if (!name.trim() || name.trim() === user?.name) return;
    setSavingName(true);
    try {
      await api.patch("/auth/me", { name: name.trim() });
      await refresh();
      push("Name updated", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update your name", "error");
    } finally {
      setSavingName(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.postForm("/auth/me/avatar", form);
      await refresh();
      push("Photo updated", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't upload that photo", "error");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    await api.delete("/auth/me/avatar");
    await refresh();
    push("Photo removed", "info");
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-title">Profile</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <UserAvatar user={user} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: uploadingPhoto ? "wait" : "pointer", width: "fit-content" }}>
            {uploadingPhoto ? "Uploading…" : "Change Photo"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={uploadingPhoto}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }}
            />
          </label>
          {user?.avatar_url && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)", width: "fit-content" }} onClick={removePhoto}>
              <IconTrash size={12} /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label">Name</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" disabled={savingName || !name.trim() || name.trim() === user?.name} onClick={saveName}>
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="form-group full" style={{ marginTop: 12 }}>
        <label className="form-label">Email</label>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>{user?.email}</div>
      </div>
    </div>
  );
}

export function MyAccount() {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();
  const { data: sessions, reload } = useFetch<Session[]>("/auth/sessions");

  async function revokeOtherSessions() {
    if (!(await confirm({ message: "Log out every other session on your account? This one stays signed in.", confirmLabel: "Log out others" }))) return;
    const res = await api.post<{ revoked: number }>("/auth/sessions/revoke-others");
    push(`Signed out ${res.revoked} other session${res.revoked === 1 ? "" : "s"}`, "success");
    reload();
  }

  return (
    <div>
      <PageHeader icon={<IconUsers size={19} />} title="My Account" subtitle={user ? `${user.name} — ${user.email}` : undefined} />

      <ProfileCard />

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title">
          My Sessions
          {sessions && sessions.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={revokeOtherSessions}>Log out other sessions</button>}
        </div>
        {sessions?.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            <div>
              <div style={{ color: "var(--text)" }} title={s.ip_address ?? undefined}>
                {friendlyUserAgent(s.user_agent)}
                {s.is_current && <span style={{ color: "var(--success)", marginLeft: 6 }}>(this device)</span>}
              </div>
              <div style={{ color: "var(--text3)", marginTop: 2 }} title={s.user_agent ?? undefined}>{friendlyAddress(s.ip_address)}</div>
            </div>
            <div style={{ color: "var(--text3)" }}>signed in {new Date(s.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <ChangePassword />
      <TwoFactorSettings />
    </div>
  );
}
