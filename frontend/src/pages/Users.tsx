import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Modal } from "../components/Modal";

type User = { id: string; email: string; name: string; role: string; is_active: boolean };

const ROLES = ["admin", "sales", "finance", "ops"];

export function Users() {
  const { data, reload } = useFetch<User[]>("/users");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "sales" });
  const [error, setError] = useState<string | null>(null);

  async function createUser() {
    setError(null);
    try {
      await api.post("/users", form);
      setModalOpen(false);
      setForm({ email: "", password: "", name: "", role: "sales" });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    }
  }

  async function toggleActive(u: User) {
    await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
    reload();
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Users</div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Add User</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.email}</td><td style={{ textTransform: "capitalize" }}>{u.role}</td>
                  <td>{u.is_active ? <span style={{ color: "var(--success)" }}>Active</span> : <span style={{ color: "var(--text3)" }}>Deactivated</span>}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? "Deactivate" : "Reactivate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title="Add User" onClose={() => setModalOpen(false)} footer={<>
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createUser}>Create</button>
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
