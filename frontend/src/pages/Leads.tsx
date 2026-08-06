import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { formatDate, formatMoney, toDateInputValue } from "../lib/format";

const INDUSTRIES = ["Banking & Finance", "IT/Software", "Healthcare", "Government", "Manufacturing", "E-commerce", "Telecom", "Other"];
const SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Email Campaign"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];

type Lead = {
  id: string; company: string; contact_person: string; designation: string | null; email: string;
  mobile: string | null; industry: string | null; source: string | null; service_id: string | null;
  status: string; lost_reason: string | null; value_estimate: string | null; assigned_to: string | null;
  next_followup_date: string | null; notes: string | null; converted_to_client_id: string | null;
};
type Service = { id: string; name: string };
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

const emptyForm = {
  company: "", contact_person: "", designation: "", email: "", mobile: "", website: "",
  industry: "", source: "", service_id: "", value_estimate: "", next_followup_date: "", notes: "",
};

export function Leads() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [serviceId, setServiceId] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "8" });
  if (search) query.set("search", search);
  if (status) query.set("status", status);
  if (serviceId) query.set("service_id", serviceId);

  const { data, loading, error, reload } = useFetch<ListResponse<Lead>>(`/leads?${query.toString()}`, [page, search, status, serviceId]);
  const { data: services } = useFetch<Service[]>("/services");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [interactionLead, setInteractionLead] = useState<Lead | null>(null);
  const [interactionNote, setInteractionNote] = useState("");
  const [interactionDate, setInteractionDate] = useState("");
  const [interactionDone, setInteractionDone] = useState(false);
  const [interactionErr, setInteractionErr] = useState<string | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "sales";

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
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    const payload: Record<string, unknown> = {
      company: form.company, contact_person: form.contact_person, email: form.email,
      designation: form.designation || undefined, mobile: form.mobile || undefined,
      industry: form.industry || undefined, source: form.source || undefined,
      service_id: form.service_id || undefined,
      value_estimate: form.value_estimate ? Number(form.value_estimate) : undefined,
      next_followup_date: form.next_followup_date || undefined, notes: form.notes || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/leads/${editing.id}`, payload);
      } else {
        await api.post("/leads", payload);
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "details" in err.body) {
        const details = (err.body as { details?: { fieldErrors?: Record<string, string[]> } }).details;
        const fe: Record<string, string> = {};
        if (details?.fieldErrors) {
          for (const [k, v] of Object.entries(details.fieldErrors)) fe[k] = v[0];
        }
        setFieldErrors(fe);
      }
    } finally {
      setSaving(false);
    }
  }

  async function convert(l: Lead) {
    if (!confirm(`Convert ${l.company} to a client?`)) return;
    try {
      await api.post(`/leads/${l.id}/convert`, {});
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to convert");
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
      reload();
    } catch (err) {
      setInteractionErr(err instanceof Error ? err.message : "Failed to save");
    }
  }

  const serviceName = (id: string | null) => services?.find((s) => s.id === id)?.name ?? "—";

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Lead Management</div>
        {canEdit && <button className="btn btn-primary" onClick={openAdd}>+ Add Lead</button>}
      </div>

      <div className="filter-bar">
        <input className="filter-input" placeholder="Search company / contact..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPage(1); }}>
          <option value="">All Services</option>
          {services?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Company</th><th>Contact</th><th>Service</th><th>Value</th><th>Status</th><th>Follow-up</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="empty">Loading…</div></td></tr>}
              {!loading && data?.data.length === 0 && <tr><td colSpan={7}><div className="empty">No leads found</div></td></tr>}
              {data?.data.map((l) => (
                <tr key={l.id}>
                  <td><div style={{ fontWeight: 500, color: "var(--text)" }}>{l.company}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{l.industry}</div></td>
                  <td><div>{l.contact_person}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{l.designation}</div></td>
                  <td style={{ fontSize: 12 }}>{serviceName(l.service_id)}</td>
                  <td className="mono">{l.value_estimate ? formatMoney(l.value_estimate) : "—"}</td>
                  <td><Badge status={l.status} /></td>
                  <td style={{ fontSize: 12 }}>{formatDate(l.next_followup_date)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(l)}>Edit</button>}
                      {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openInteraction(l)}>Log</button>}
                      {canEdit && l.status !== "Won" && !l.converted_to_client_id && (
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--success)" }} onClick={() => convert(l)}>Convert</button>
                      )}
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
        <Modal
          title={editing ? "Edit Lead" : "Add New Lead"}
          onClose={() => setModalOpen(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Lead"}</button>
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
              <select className="form-select" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
                <option value="">—</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Lead Source</label>
              <select className="form-select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                <option value="">—</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Service Interested In</label>
              <select className="form-select" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
                <option value="">—</option>
                {services?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Value Estimate (₹)</label>
              <input className="form-input" type="number" value={form.value_estimate} onChange={(e) => setForm({ ...form, value_estimate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Date</label>
              <input className="form-input" type="date" value={form.next_followup_date} onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {interactionLead && (
        <Modal
          title={`Log Interaction — ${interactionLead.company}`}
          onClose={() => setInteractionLead(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setInteractionLead(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveInteraction}>Save</button>
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
              <input className="form-input" type="date" value={interactionDate} onChange={(e) => setInteractionDate(e.target.value)} />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
