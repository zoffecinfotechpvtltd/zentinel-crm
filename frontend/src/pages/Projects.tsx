import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api, ApiError, API_BASE } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { PageHeader } from "../components/PageHeader";
import { NotesAndFiles } from "../components/NotesAndFiles";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { formatDate } from "../lib/format";
import { IconProjects, IconPlus, IconInbox, IconCalendar } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { CustomDatePicker } from "../components/CustomDatePicker";

const STATUSES = ["Not Started", "In Progress", "Awaiting Client", "Completed", "On Hold"];

type Project = {
  id: string; name: string; client_id: string; status: string; progress: number;
  due_date: string | null; is_overdue: boolean; is_due_this_week: boolean;
  assigned_to: string | null; assigned_to_name: string | null; service_name: string | null;
  opportunity_id: string | null; opportunity_company: string | null;
  tasks_total: string; tasks_done: string; hours_logged: string;
};
type ProjectTask = { id: string; title: string; is_done: boolean; position: number; created_at: string; completed_at: string | null };
type TimeEntry = { id: string; hours: string; entry_date: string; notes: string | null; created_at: string; user_id: string; user_name: string | null };
type Client = { id: string; company: string };
type Assignable = { id: string; name: string; role: string };
type LinkedOpportunity = { id: string; kind: string; company: string; stage: string };
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

const emptyForm = { name: "", client_id: "", opportunity_id: "", assigned_to: "", start_date: "", due_date: "", status: "Not Started", progress: "0", remarks: "" };

export function Projects() {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [status, setStatus] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "8" });
  if (status) query.set("status", status);

  const { data, loading, reload } = useFetch<ListResponse<Project>>(`/projects?${query.toString()}`, [page, status]);
  const { data: clientsResp } = useFetch<ListResponse<Client>>("/clients?per_page=200");
  const { data: assignable } = useFetch<Assignable[]>("/users/assignable");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const activeClientId = editing ? editing.client_id : form.client_id;
  const { data: clientOpportunities } = useFetch<ListResponse<LinkedOpportunity>>(
    activeClientId ? `/opportunities?client_id=${activeClientId}&per_page=100` : "",
    [activeClientId]
  );

  const { data: tasks, reload: reloadTasks } = useFetch<ProjectTask[]>(editing ? `/projects/${editing.id}/tasks` : "", [editing?.id]);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  async function addTask() {
    if (!editing || !newTaskTitle.trim()) return;
    try {
      await api.post(`/projects/${editing.id}/tasks`, { title: newTaskTitle.trim() });
      setNewTaskTitle("");
      reloadTasks();
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't add task", "error");
    }
  }

  async function toggleTask(task: ProjectTask) {
    if (!editing) return;
    try {
      await api.patch(`/projects/${editing.id}/tasks/${task.id}`, { is_done: !task.is_done });
      reloadTasks();
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update task", "error");
    }
  }

  async function removeTask(taskId: string) {
    if (!editing) return;
    try {
      await api.delete(`/projects/${editing.id}/tasks/${taskId}`);
      reloadTasks();
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't delete task", "error");
    }
  }

  const { data: timeEntries, reload: reloadTimeEntries } = useFetch<TimeEntry[]>(editing ? `/projects/${editing.id}/time-entries` : "", [editing?.id]);
  const [timeForm, setTimeForm] = useState({ hours: "", entry_date: "", notes: "" });

  async function logTime() {
    if (!editing || !timeForm.hours) return;
    try {
      await api.post(`/projects/${editing.id}/time-entries`, {
        hours: Number(timeForm.hours), entry_date: timeForm.entry_date || undefined, notes: timeForm.notes || undefined,
      });
      setTimeForm({ hours: "", entry_date: "", notes: "" });
      reloadTimeEntries();
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't log time", "error");
    }
  }

  async function removeTimeEntry(entryId: string) {
    if (!editing) return;
    try {
      await api.delete(`/projects/${editing.id}/time-entries/${entryId}`);
      reloadTimeEntries();
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't delete entry", "error");
    }
  }

  const canEdit = user?.role === "admin" || user?.role === "ops";
  const clientName = (id: string) => clientsResp?.data.find((c) => c.id === id)?.company ?? "—";
  const filtered = search
    ? data?.data.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || clientName(p.client_id).toLowerCase().includes(search.toLowerCase()))
    : data?.data;

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }
  function openEdit(p: Project) {
    setEditing(p);
    setForm({
      name: p.name, client_id: p.client_id, opportunity_id: p.opportunity_id ?? "", assigned_to: p.assigned_to ?? "", start_date: "", due_date: p.due_date ?? "",
      status: p.status, progress: String(p.progress), remarks: "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    setError(null);
    const payload = {
      name: form.name, client_id: form.client_id || undefined, opportunity_id: form.opportunity_id || (editing ? null : undefined),
      assigned_to: form.assigned_to || (editing ? null : undefined),
      start_date: form.start_date || undefined, due_date: form.due_date || (editing ? null : undefined),
      status: form.status, progress: Number(form.progress), remarks: form.remarks || undefined,
    };
    try {
      if (editing) {
        const { client_id: _client_id, ...rest } = payload;
        await api.patch(`/projects/${editing.id}`, rest);
        push("Project updated", "success");
      } else {
        await api.post("/projects", payload);
        push("Project created", "success");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function remove(p: Project) {
    if (!(await confirm({ message: `Delete project "${p.name}"? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.delete(`/projects/${p.id}`);
      push("Project deleted", "success");
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  return (
    <div>
      <PageHeader
        icon={<IconProjects size={19} />}
        title="Project Management"
        subtitle={data ? `${data.total} project${data.total === 1 ? "" : "s"} tracked` : undefined}
        actions={canEdit && <button type="button" className="btn btn-primary" onClick={openAdd}><IconPlus size={14} /> Add Project</button>}
      />

      <div className="filter-bar">
        <input className="filter-input" placeholder="Search project / client..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <CustomSelect
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="All Status"
          options={[{ value: "", label: "All Status" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Project</th><th>Client</th><th>Assigned To</th><th>Due Date</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={7} />}
              {!loading && filtered?.length === 0 && (
                <tr><td colSpan={7}><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>No projects match these filters yet.</div></td></tr>
              )}
              {filtered?.map((p) => (
                <tr key={p.id} className={p.is_overdue ? "row-urgent" : undefined}>
                  <td>
                    <div style={{ fontWeight: 550, color: "var(--text)" }}>{p.name}</div>
                    {p.service_name && <div style={{ fontSize: 11, color: "var(--text3)" }}>{p.service_name}</div>}
                  </td>
                  <td>
                    <div>{clientName(p.client_id)}</div>
                    {p.opportunity_company && (
                      <Link to={`/opportunities?q=${encodeURIComponent(p.opportunity_company)}`} style={{ fontSize: 10.5, color: "var(--info)", fontWeight: 600, textDecoration: "none" }}>
                        ↳ from opportunity
                      </Link>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{p.assigned_to_name ?? <span style={{ color: "var(--text3)" }}>Unassigned</span>}</td>
                  <td style={{ fontSize: 12, color: p.is_overdue ? "var(--danger)" : p.is_due_this_week ? "var(--warning)" : undefined }}>
                    {formatDate(p.due_date)}{p.is_overdue ? " (overdue)" : ""}
                  </td>
                  <td style={{ width: 120 }}>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.progress}%` }} /></div>
                    {Number(p.tasks_total) > 0 && (
                      <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 3 }}>{p.tasks_done}/{p.tasks_total} tasks</div>
                    )}
                  </td>
                  <td><Badge status={p.status} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>}
                      {p.due_date && <a className="icon-btn" href={`${API_BASE}/api/projects/${p.id}/due-date.ics`} title="Add due date to calendar"><IconCalendar size={13} /></a>}
                      {user?.role === "admin" && <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(p)}>Delete</button>}
                    </div>
                  </td>
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
        <Modal title={editing ? "Edit Project" : "Add New Project"} onClose={() => setModalOpen(false)} wide={!!editing} footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save Project</button>
        </>}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">Project Name *</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            {!editing && (
              <div className="form-group full">
                <label className="form-label">Client *</label>
                <CustomSelect
                  value={form.client_id}
                  onChange={(v) => setForm({ ...form, client_id: v, opportunity_id: "" })}
                  placeholder="Select client…"
                  options={clientsResp?.data.map((c) => ({ value: c.id, label: c.company })) ?? []}
                />
              </div>
            )}
            {activeClientId && (clientOpportunities?.data.length ?? 0) > 0 && (
              <div className="form-group full">
                <label className="form-label">Link to Opportunity</label>
                <CustomSelect
                  value={form.opportunity_id}
                  onChange={(v) => setForm({ ...form, opportunity_id: v })}
                  placeholder="Not linked to an opportunity"
                  options={clientOpportunities?.data.map((o) => ({ value: o.id, label: `${o.kind} — ${o.company} (${o.stage})` })) ?? []}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <CustomSelect
                value={form.assigned_to}
                onChange={(v) => setForm({ ...form, assigned_to: v })}
                placeholder="Unassigned"
                options={assignable?.map((u) => ({ value: u.id, label: `${u.name} (${u.role})` })) ?? []}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <CustomSelect
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <div className="form-group"><label className="form-label">Start Date</label><CustomDatePicker value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} /></div>
            <div className="form-group"><label className="form-label">Due Date</label><CustomDatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} /></div>
            <div className="form-group"><label className="form-label">Progress (%)</label><input className="form-input" type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} /></div>
            <div className="form-group full"><label className="form-label">Remarks</label><textarea className="form-textarea" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          {editing && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div className="form-label" style={{ marginBottom: 8 }}>
                Checklist{tasks && tasks.length > 0 ? ` (${tasks.filter((t) => t.is_done).length}/${tasks.length})` : ""}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  className="form-input" placeholder="Add a task…" value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={addTask} disabled={!newTaskTitle.trim()}>Add</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tasks?.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)" }}>No tasks yet</div>}
                {tasks?.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--bg3)" }}>
                    <input type="checkbox" checked={t.is_done} onChange={() => toggleTask(t)} />
                    <span style={{ flex: 1, fontSize: 13, textDecoration: t.is_done ? "line-through" : "none", color: t.is_done ? "var(--text3)" : "var(--text)" }}>
                      {t.title}
                    </span>
                    <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => removeTask(t.id)} title="Delete">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {editing && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div className="form-label" style={{ marginBottom: 8 }}>
                Time Log{timeEntries && timeEntries.length > 0 ? ` (${timeEntries.reduce((s, t) => s + Number(t.hours), 0)}h total)` : ""}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input className="form-input" type="number" min="0" step="0.5" placeholder="Hours" style={{ width: 90 }}
                  value={timeForm.hours} onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })} />
                <div style={{ width: 150 }}>
                  <CustomDatePicker value={timeForm.entry_date} onChange={(v) => setTimeForm({ ...timeForm, entry_date: v })} placeholder="Today" />
                </div>
                <input className="form-input" placeholder="Note (optional)" style={{ flex: 1, minWidth: 140 }}
                  value={timeForm.notes} onChange={(e) => setTimeForm({ ...timeForm, notes: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={logTime} disabled={!timeForm.hours}>Log</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {timeEntries?.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)" }}>No time logged yet</div>}
                {timeEntries?.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--bg3)" }}>
                    <span style={{ fontWeight: 600, fontSize: 13, width: 40 }}>{t.hours}h</span>
                    <span style={{ fontSize: 12, color: "var(--text3)", width: 90 }}>{formatDate(t.entry_date)}</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--text2)" }}>{t.notes ?? "—"} — {t.user_name ?? "Someone"}</span>
                    {(user?.role === "admin" || t.user_id === user?.id) && (
                      <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => removeTimeEntry(t.id)} title="Delete">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {editing && <NotesAndFiles entityType="project" entityId={editing.id} />}
        </Modal>
      )}
    </div>
  );
}
