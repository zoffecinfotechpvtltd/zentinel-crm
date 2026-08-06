import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { formatDate } from "../lib/format";

const STATUSES = ["Not Started", "In Progress", "Awaiting Client", "Completed", "On Hold"];

type Project = {
  id: string; name: string; client_id: string; status: string; progress: number;
  due_date: string | null; is_overdue: boolean; is_due_this_week: boolean;
};
type Client = { id: string; company: string };
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

const emptyForm = { name: "", client_id: "", start_date: "", due_date: "", status: "Not Started", progress: "0", remarks: "" };

export function Projects() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "8" });
  if (status) query.set("status", status);

  const { data, loading, reload } = useFetch<ListResponse<Project>>(`/projects?${query.toString()}`, [page, status]);
  const { data: clientsResp } = useFetch<ListResponse<Client>>("/clients?per_page=200");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "ops";
  const clientName = (id: string) => clientsResp?.data.find((c) => c.id === id)?.company ?? "—";

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }
  function openEdit(p: Project) {
    setEditing(p);
    setForm({
      name: p.name, client_id: p.client_id, start_date: "", due_date: p.due_date ?? "",
      status: p.status, progress: String(p.progress), remarks: "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    setError(null);
    const payload = {
      name: form.name, client_id: form.client_id || undefined,
      start_date: form.start_date || undefined, due_date: form.due_date || undefined,
      status: form.status, progress: Number(form.progress), remarks: form.remarks || undefined,
    };
    try {
      if (editing) {
        const { client_id, ...rest } = payload;
        await api.patch(`/projects/${editing.id}`, rest);
      } else {
        await api.post("/projects", payload);
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Project Management</div>
        {canEdit && <button className="btn btn-primary" onClick={openAdd}>+ Add Project</button>}
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Project</th><th>Client</th><th>Due Date</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="empty">Loading…</div></td></tr>}
              {!loading && data?.data.length === 0 && <tr><td colSpan={6}><div className="empty">No projects found</div></td></tr>}
              {data?.data.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}</td>
                  <td>{clientName(p.client_id)}</td>
                  <td style={{ fontSize: 12, color: p.is_overdue ? "var(--danger)" : p.is_due_this_week ? "var(--warning)" : undefined }}>
                    {formatDate(p.due_date)}{p.is_overdue ? " (overdue)" : ""}
                  </td>
                  <td style={{ width: 120 }}>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.progress}%` }} /></div>
                  </td>
                  <td><Badge status={p.status} /></td>
                  <td>{canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          {data && <Pagination page={page} perPage={data.per_page} total={data.total} onChange={setPage} />}
        </div>
      </div>

      {modalOpen && (
        <Modal title={editing ? "Edit Project" : "Add New Project"} onClose={() => setModalOpen(false)} footer={<>
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save Project</button>
        </>}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">Project Name *</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            {!editing && (
              <div className="form-group full">
                <label className="form-label">Client *</label>
                <select className="form-select" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">Select client…</option>
                  {clientsResp?.data.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label className="form-label">Start Date</label><input className="form-input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Due Date</label><input className="form-input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Progress (%)</label><input className="form-input" type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} /></div>
            <div className="form-group full"><label className="form-label">Remarks</label><textarea className="form-textarea" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
