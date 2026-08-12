import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomFieldsSection } from "../components/CustomFieldsSection";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { PageHeader } from "../components/PageHeader";
import { NotesAndFiles } from "../components/NotesAndFiles";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { formatDate, formatMoney, toDateInputValue } from "../lib/format";
import { IconLeads, IconPlus, IconInbox, IconCheck } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { CustomDatePicker } from "../components/CustomDatePicker";

const INDUSTRIES = ["Banking & Finance", "IT/Software", "Healthcare", "Government", "Manufacturing", "E-commerce", "Telecom", "Other"];
const SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Email Campaign"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
const STATUS_RAIL: Record<string, string> = {
  New: "var(--info)", Contacted: "var(--text3)", Qualified: "var(--success)",
  "Proposal Sent": "var(--purple)", Negotiation: "var(--warning)", Won: "var(--success)", Lost: "var(--danger)",
};

type Lead = {
  id: string; company: string; contact_person: string; designation: string | null; email: string;
  mobile: string | null; industry: string | null; source: string | null; service_id: string | null;
  status: string; lost_reason: string | null; value_estimate: string | null; assigned_to: string | null;
  next_followup_date: string | null; notes: string | null; converted_to_client_id: string | null;
  lead_score: number; opportunity_count: number; custom_fields: Record<string, unknown>;
};

function scoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--text3)";
}
type LinkedOpportunity = { id: string; kind: string; company: string; stage: string; follow_up_date: string | null; lead_date: string | null; created_at: string };
type DuplicateLeadSummary = { id: string; company: string; contact_person: string; email: string; status: string; created_at: string };
type DuplicatePair = { lead1: DuplicateLeadSummary; lead2: DuplicateLeadSummary };
type Service = { id: string; name: string };
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

const emptyForm = {
  company: "", contact_person: "", designation: "", email: "", mobile: "", website: "",
  industry: "", source: "", service_id: "", value_estimate: "", next_followup_date: "", notes: "",
  custom_fields: {} as Record<string, unknown>,
};

export function Leads() {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();
  const [view, setViewState] = useState<"list" | "board">(() => (localStorage.getItem("zoffec-leads-view") === "board" ? "board" : "list"));
  function setView(v: "list" | "board") {
    localStorage.setItem("zoffec-leads-view", v);
    setViewState(v);
  }
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [status, setStatus] = useState("");
  const [serviceId, setServiceId] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "8" });
  if (search) query.set("search", search);
  if (status) query.set("status", status);
  if (serviceId) query.set("service_id", serviceId);

  const { data, loading, error, reload } = useFetch<ListResponse<Lead>>(`/leads?${query.toString()}`, [page, search, status, serviceId]);
  const boardQuery = new URLSearchParams({ page: "1", per_page: "300" });
  if (search) boardQuery.set("search", search);
  if (serviceId) boardQuery.set("service_id", serviceId);
  const { data: boardData, reload: reloadBoard } = useFetch<ListResponse<Lead>>(view === "board" ? `/leads?${boardQuery.toString()}` : "", [view, search, serviceId]);
  const { data: services } = useFetch<Service[]>("/services");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: leadDetail } = useFetch<Lead & { opportunities: LinkedOpportunity[] }>(editing ? `/leads/${editing.id}` : "", [editing?.id]);

  const [interactionLead, setInteractionLead] = useState<Lead | null>(null);
  const [interactionNote, setInteractionNote] = useState("");
  const [interactionDate, setInteractionDate] = useState("");
  const [interactionDone, setInteractionDone] = useState(false);
  const [interactionErr, setInteractionErr] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const { data: duplicates, reload: reloadDuplicates } = useFetch<DuplicatePair[]>(duplicatesOpen ? "/leads/duplicates" : "");
  const [mergingId, setMergingId] = useState<string | null>(null);

  async function mergeInto(keepId: string, mergeId: string) {
    setMergingId(mergeId);
    try {
      await api.post(`/leads/${keepId}/merge`, { merge_id: mergeId });
      push("Leads merged", "success");
      reloadDuplicates();
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to merge", "error");
    } finally {
      setMergingId(null);
    }
  }

  const canEdit = user?.role === "admin" || user?.role === "sales";
  const canDelete = user?.role === "admin";

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) => {
      const pageIds = data?.data.map((l) => l.id) ?? [];
      const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(pageIds);
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!(await confirm({ message: `Delete ${selected.size} selected lead(s)? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => api.delete(`/leads/${id}`)));
      push(`Deleted ${selected.size} lead(s)`, "success");
      setSelected(new Set());
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Some deletes failed", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  function bulkExportCsv() {
    const rows = (data?.data ?? []).filter((l) => selected.has(l.id));
    const header = ["Company", "Contact", "Email", "Mobile", "Service", "Source", "Status", "Value", "Next Follow-up"];
    const csvLines = [header.join(",")];
    for (const l of rows) {
      const cells = [
        l.company, l.contact_person, l.email, l.mobile ?? "", serviceName(l.service_id),
        l.source ?? "", l.status, l.value_estimate ?? "", l.next_followup_date ?? "",
      ];
      csvLines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([csvLines.join("\r\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setModalOpen(true);
  }
  function openEdit(l: Lead) {
    setEditing(l);
    setForm({
      company: l.company, contact_person: l.contact_person, designation: l.designation ?? "",
      email: l.email, mobile: l.mobile ?? "", website: "", industry: l.industry ?? "", source: l.source ?? "",
      service_id: l.service_id ?? "", value_estimate: l.value_estimate ?? "",
      next_followup_date: toDateInputValue(l.next_followup_date), notes: l.notes ?? "",
      custom_fields: l.custom_fields ?? {},
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    const nullable = (v: string) => v || (editing ? null : undefined);
    const payload: Record<string, unknown> = {
      company: form.company, contact_person: form.contact_person, email: form.email,
      designation: nullable(form.designation), mobile: nullable(form.mobile),
      industry: nullable(form.industry), source: nullable(form.source),
      service_id: nullable(form.service_id),
      value_estimate: form.value_estimate ? Number(form.value_estimate) : (editing ? null : undefined),
      next_followup_date: nullable(form.next_followup_date), notes: nullable(form.notes),
      custom_fields: form.custom_fields,
    };
    try {
      if (editing) {
        await api.patch(`/leads/${editing.id}`, payload);
        push("Lead updated", "success");
      } else {
        await api.post("/leads", payload);
        push("Lead added", "success");
      }
      setModalOpen(false);
      reload();
      reloadBoard();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "details" in err.body) {
        const details = (err.body as { details?: { fieldErrors?: Record<string, string[]> } }).details;
        const fe: Record<string, string> = {};
        if (details?.fieldErrors) {
          for (const [k, v] of Object.entries(details.fieldErrors)) fe[k] = v[0];
        }
        setFieldErrors(fe);
      } else {
        push(err instanceof Error ? err.message : "Failed to save lead", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function convert(l: Lead) {
    if (!(await confirm({ message: `Convert ${l.company} to a client?`, confirmLabel: "Convert" }))) return;
    try {
      await api.post(`/leads/${l.id}/convert`, {});
      push(`${l.company} converted to a client`, "success");
      reload();
      reloadBoard();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to convert", "error");
    }
  }

  async function remove(l: Lead) {
    if (!(await confirm({ message: `Delete lead "${l.company}"? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.delete(`/leads/${l.id}`);
      push("Lead deleted", "success");
      reload();
      reloadBoard();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  async function moveStatus(l: Lead, newStatus: string) {
    if (l.status === newStatus) return;
    if (newStatus === "Lost") {
      const reason = prompt(`Reason ${l.company} was lost:`);
      if (!reason) return;
      try {
        await api.patch(`/leads/${l.id}`, { status: newStatus, lost_reason: reason });
        push(`Marked ${l.company} as Lost`, "info");
        reload(); reloadBoard();
      } catch (err) {
        push(err instanceof Error ? err.message : "Failed to update status", "error");
      }
      return;
    }
    try {
      await api.patch(`/leads/${l.id}`, { status: newStatus });
      push(`${l.company} moved to ${newStatus}`, "success");
      reload();
      reloadBoard();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to update status", "error");
    }
  }

  function openInteraction(l: Lead) {
    setInteractionLead(l);
    setInteractionNote("");
    setInteractionDate("");
    setInteractionDone(false);
    setInteractionErr(null);
  }

  async function saveInteraction() {
    if (!interactionLead) return;
    setInteractionErr(null);
    try {
      await api.post(`/leads/${interactionLead.id}/log-interaction`, {
        note: interactionNote,
        next_followup_date: interactionDone ? undefined : interactionDate || undefined,
        no_further_followup: interactionDone || undefined,
      });
      setInteractionLead(null);
      push("Interaction logged", "success");
      reload();
    } catch (err) {
      setInteractionErr(err instanceof Error ? err.message : "Failed to save");
    }
  }

  const serviceName = (id: string | null) => services?.find((s) => s.id === id)?.name ?? "—";

  const columns = useMemo(() => {
    const byStatus: Record<string, Lead[]> = {};
    for (const s of STATUSES) byStatus[s] = [];
    for (const l of boardData?.data ?? []) (byStatus[l.status] ??= []).push(l);
    return byStatus;
  }, [boardData]);

  return (
    <div>
      <PageHeader
        icon={<IconLeads size={19} />}
        title="Lead Management"
        subtitle={data ? `${data.total} lead${data.total === 1 ? "" : "s"} in the pipeline` : undefined}
        actions={<>
          <div className="view-toggle">
            <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
            <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button>
          </div>
          {user?.role === "admin" && <button type="button" className="btn btn-ghost" onClick={() => setDuplicatesOpen(true)}>Duplicates</button>}
          {canEdit && <button type="button" className="btn btn-primary" onClick={openAdd}><IconPlus size={14} /> Add Lead</button>}
        </>}
      />

      <div className="filter-bar">
        <input className="filter-input" placeholder="Search company / contact..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {view === "list" && (
          <CustomSelect
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All Status"
            options={[{ value: "", label: "All Status" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        )}
        <CustomSelect
          value={serviceId}
          onChange={(v) => { setServiceId(v); setPage(1); }}
          placeholder="All Services"
          options={[{ value: "", label: "All Services" }, ...(services?.map((s) => ({ value: s.id, label: s.name })) ?? [])]}
        />
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {view === "list" && selected.size > 0 && (
        <div className="banner banner-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>{selected.size} selected</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={bulkExportCsv}>Export CSV</button>
          {canDelete && <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={bulkDelete} disabled={bulkBusy}>{bulkBusy ? "Deleting…" : "Delete selected"}</button>}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {view === "list" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}><input type="checkbox" checked={(data?.data.length ?? 0) > 0 && data!.data.every((l) => selected.has(l.id))} onChange={toggleSelectAll} /></th>
                  <th>Company</th><th>Contact</th><th>Service</th><th>Source</th><th title="Stage progress + deal size + source quality + how recently touched">Score</th><th>Status</th><th>Follow-up</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <TableSkeleton rows={6} cols={9} />}
                {!loading && data?.data.length === 0 && (
                  <tr><td colSpan={9}>
                    <div className="empty">
                      <div className="empty-icon"><IconInbox size={30} /></div>
                      No leads match these filters yet.
                    </div>
                  </td></tr>
                )}
                {data?.data.map((l) => (
                  <tr key={l.id} className={selected.has(l.id) ? "row-selected" : undefined}>
                    <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} /></td>
                    <td>
                      <div style={{ fontWeight: 550, color: "var(--text)" }}>{l.company}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>{l.industry ?? "—"}</div>
                      {l.opportunity_count > 0 && (
                        <Link to={`/opportunities?q=${encodeURIComponent(l.company)}`} style={{ fontSize: 10.5, color: "var(--info)", fontWeight: 600, textDecoration: "none" }}>
                          ↳ {l.opportunity_count} opportunit{l.opportunity_count === 1 ? "y" : "ies"}
                        </Link>
                      )}
                    </td>
                    <td><div>{l.contact_person}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{l.designation}</div></td>
                    <td style={{ fontSize: 12 }}>{serviceName(l.service_id)}</td>
                    <td style={{ fontSize: 12 }}>{l.source ?? "—"}</td>
                    <td>
                      <span style={{ fontWeight: 650, color: scoreColor(l.lead_score) }}>{l.lead_score}</span>
                    </td>
                    <td>
                      {canEdit ? (
                        <CustomSelect
                          className="sm"
                          value={l.status}
                          onChange={(v) => moveStatus(l, v)}
                          options={STATUSES.map((s) => ({ value: s, label: s }))}
                        />
                      ) : <Badge status={l.status} />}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(l.next_followup_date)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(l)}>Edit</button>}
                        {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => openInteraction(l)}>Log</button>}
                        {canEdit && l.status !== "Won" && !l.converted_to_client_id && (
                          <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--success)" }} onClick={() => convert(l)}>Convert</button>
                        )}
                        {canDelete && <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(l)}>Delete</button>}
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
      )}

      {view === "board" && (
        <div className="kanban-board">
          {STATUSES.map((s) => (
            <div className="kanban-col" key={s} style={{ ["--col-accent" as string]: STATUS_RAIL[s] }}>
              <div className="kanban-col-head">
                <div className="kanban-col-title">{s}</div>
                <div className="kanban-col-count">{columns[s]?.length ?? 0}</div>
              </div>
              <div
                className={`kanban-col-body${dragOverCol === s ? " drop-target" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(s); }}
                onDragLeave={() => setDragOverCol((c) => (c === s ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  const lead = boardData?.data.find((l) => l.id === dragId);
                  if (lead) moveStatus(lead, s);
                  setDragId(null);
                }}
              >
                {(columns[s] ?? []).map((l) => (
                  <div
                    key={l.id}
                    className={`kanban-card${dragId === l.id ? " dragging" : ""}`}
                    draggable={canEdit}
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => canEdit && openEdit(l)}
                  >
                    <div className="kanban-card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                      <span>{l.company}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(l.lead_score) }}>{l.lead_score}</span>
                    </div>
                    <div className="kanban-card-sub">{l.contact_person}{l.industry ? ` · ${l.industry}` : ""}</div>
                    <div className="kanban-card-foot">
                      <span className="mono">{l.value_estimate ? formatMoney(l.value_estimate) : "—"}</span>
                      <span>{formatDate(l.next_followup_date)}</span>
                    </div>
                  </div>
                ))}
                {(columns[s] ?? []).length === 0 && <div style={{ fontSize: 11.5, color: "var(--text3)", padding: "8px 2px" }}>Drop here</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? "Edit Lead" : "Add New Lead"}
          onClose={() => setModalOpen(false)}
          wide={!!editing}
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Lead"}</button>
          </>}
        >
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Company Name *</label>
              <input className="form-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              {fieldErrors.company && <div className="form-error">{fieldErrors.company}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Contact Person *</label>
              <input className="form-input" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
              {fieldErrors.contact_person && <div className="form-error">{fieldErrors.contact_person}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <input className="form-input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {fieldErrors.email && <div className="form-error">{fieldErrors.email}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Mobile</label>
              <input className="form-input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Industry</label>
              <CustomSelect
                value={form.industry}
                onChange={(v) => setForm({ ...form, industry: v })}
                options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Lead Source</label>
              <CustomSelect
                value={form.source}
                onChange={(v) => setForm({ ...form, source: v })}
                options={SOURCES.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Service Interested In</label>
              <CustomSelect
                value={form.service_id}
                onChange={(v) => setForm({ ...form, service_id: v })}
                options={services?.map((s) => ({ value: s.id, label: s.name })) ?? []}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Value Estimate (₹)</label>
              <input className="form-input" type="number" value={form.value_estimate} onChange={(e) => setForm({ ...form, value_estimate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Date</label>
              <CustomDatePicker value={form.next_followup_date} onChange={(v) => setForm({ ...form, next_followup_date: v })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <CustomFieldsSection entityType="lead" values={form.custom_fields} onChange={(v) => setForm({ ...form, custom_fields: v })} />
          {editing && leadDetail && leadDetail.opportunities.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div className="form-label" style={{ marginBottom: 8 }}>Linked Opportunities</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {leadDetail.opportunities.map((o) => (
                  <Link
                    key={o.id}
                    to={`/opportunities?q=${encodeURIComponent(o.company)}`}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: "var(--bg3)", color: "var(--text)", textDecoration: "none" }}
                  >
                    <span style={{ textTransform: "capitalize" }}>{o.kind} — {o.company}</span>
                    <Badge status={o.stage} />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {editing && <NotesAndFiles entityType="lead" entityId={editing.id} />}
        </Modal>
      )}

      {interactionLead && (
        <Modal
          title={`Log Interaction — ${interactionLead.company}`}
          onClose={() => setInteractionLead(null)}
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setInteractionLead(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveInteraction}><IconCheck size={14} /> Save</button>
          </>}
        >
          {interactionErr && <div className="banner banner-error">{interactionErr}</div>}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">What happened? *</label>
            <textarea className="form-textarea" value={interactionNote} onChange={(e) => setInteractionNote(e.target.value)} placeholder="Had a call, discussed pricing..." />
          </div>
          {(interactionLead.status === "Won" || interactionLead.status === "Lost") && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <input type="checkbox" id="nofurther" checked={interactionDone} onChange={(e) => setInteractionDone(e.target.checked)} />
              <label htmlFor="nofurther" style={{ fontSize: 12, color: "var(--text2)" }}>No further follow-up needed</label>
            </div>
          )}
          {!interactionDone && (
            <div className="form-group">
              <label className="form-label">Next Follow-up Date *</label>
              <CustomDatePicker value={interactionDate} onChange={setInteractionDate} />
            </div>
          )}
        </Modal>
      )}

      {duplicatesOpen && (
        <Modal title="Possible Duplicate Leads" onClose={() => setDuplicatesOpen(false)} wide
          footer={<button type="button" className="btn btn-ghost" onClick={() => setDuplicatesOpen(false)}>Close</button>}>
          {!duplicates && <div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>Loading…</div>}
          {duplicates?.length === 0 && <div className="empty"><div className="empty-icon"><IconCheck size={26} /></div>No duplicates found.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {duplicates?.map((pair) => (
              <div key={`${pair.lead1.id}-${pair.lead2.id}`} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", padding: 12, borderRadius: 10, background: "var(--bg3)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{pair.lead1.company}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text2)" }}>{pair.lead1.contact_person} · {pair.lead1.email}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{pair.lead1.status} · added {formatDate(pair.lead1.created_at)}</div>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} disabled={mergingId !== null}
                    onClick={() => mergeInto(pair.lead1.id, pair.lead2.id)}>
                    {mergingId === pair.lead2.id ? "Merging…" : "Keep this one"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>vs</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{pair.lead2.company}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text2)" }}>{pair.lead2.contact_person} · {pair.lead2.email}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{pair.lead2.status} · added {formatDate(pair.lead2.created_at)}</div>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} disabled={mergingId !== null}
                    onClick={() => mergeInto(pair.lead2.id, pair.lead1.id)}>
                    {mergingId === pair.lead1.id ? "Merging…" : "Keep this one"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
