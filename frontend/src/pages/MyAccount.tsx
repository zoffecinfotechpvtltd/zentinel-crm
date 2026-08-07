import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { TwoFactorSettings } from "../components/TwoFactorSettings";
import { ChangePassword } from "../components/ChangePassword";
import { IconUsers } from "../components/Icons";
import { friendlyUserAgent, friendlyAddress } from "../lib/format";

type Session = { id: string; user_agent: string | null; ip_address: string | null; created_at: string; is_current: boolean };

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
