import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { IconUsers, IconPlus } from "../components/Icons";

type User = { id: string; email: string; name: string; role: string; is_active: boolean };

const ROLES = ["admin", "sales", "finance", "ops"];

export function Users() {
  const { data, reload } = useFetch<User[]>("/users");
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "sales" });
  const [error, setError] = useState<string | null>(null);

  async function createUser() {
    setError(null);
    try {
      await api.post("/users", form);
      setModalOpen(false);
      setForm({ email: "", password: "", name: "", role: "sales" });
      push("User created", "success");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    }
  }

  async function toggleActive(u: User) {
    if (u.is_active && !confirm(`Deactivate ${u.name}? They'll be signed out immediately and can't log in until reactivated.`)) return;
    await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
    push(u.is_active ? `${u.name} deactivated` : `${u.name} reactivated`, "info");
    reload();
  }

  return (
    <div>
      <PageHeader
        icon={<IconUsers size={19} />}
        title="Users"
        subtitle={data ? `${data.length} team member${data.length === 1 ? "" : "s"}` : undefined}
        actions={<button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}><IconPlus size={14} /> Add User</button>}
      />
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 550, color: "var(--text)" }}>{u.name}</td><td>{u.email}</td><td><span className="role-badge">{u.role}</span></td>
                  <td>{u.is_active ? <span style={{ color: "var(--success)" }}>Active</span> : <span style={{ color: "var(--text3)" }}>Deactivated</span>}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? "Deactivate" : "Reactivate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title="Add User" onClose={() => setModalOpen(false)} footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={createUser}>Create</button>
        </>}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group full"><label className="form-label">Email *</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-group full"><label className="form-label">Temporary Password *</label><input className="form-input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></div>
            <div className="form-group full">
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
