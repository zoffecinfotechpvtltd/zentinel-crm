import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api, API_BASE, ApiError } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { PageHeader } from "../components/PageHeader";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { formatDate } from "../lib/format";
import { IconOpportunities, IconPlus, IconInbox, IconUpload, IconDownload, IconCheck } from "../components/Icons";
import { CustomSelect, type SelectOption } from "../components/CustomSelect";
import { CustomDatePicker } from "../components/CustomDatePicker";

const KINDS = ["service", "product"] as const;
const STAGES = ["Open", "Proposal Sent", "Won", "Lost"] as const;

type OpportunityType = { id: string; name: string };
type LinkedCompany = { id: string; company: string };
type Opportunity = {
  id: string; kind: "service" | "product"; company: string; client_name: string | null; contact: string | null;
  description: string | null; pdf_pg_url: string | null; stage: string; lost_reason: string | null;
  follow_up_date: string | null; lead_date: string | null; remarks: string | null; assigned_to: string | null;
  client_id: string | null; lead_id: string | null; client: LinkedCompany | null; lead: LinkedCompany | null;
  opportunity_types: OpportunityType[];
};
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };
type ImportResult = { imported: number; skipped: { row: number; reason: string }[]; duplicates: number };
type CompanySearchResponse = { clients: LinkedCompany[]; leads: LinkedCompany[] };

const emptyForm = {
  kind: "service" as (typeof KINDS)[number], company: "", client_name: "", contact: "",
  opportunity_type_ids: [] as string[], description: "", pdf_pg_url: "",
  stage: "Open" as (typeof STAGES)[number], lost_reason: "", follow_up_date: "", lead_date: "", remarks: "",
  client_id: "", lead_id: "",
};

export function Opportunities() {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [stage, setStage] = useState("");
  const [typeId, setTypeId] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "10" });
  if (search) query.set("search", search);
  if (kind) query.set("kind", kind);
  if (stage) query.set("stage", stage);
  if (typeId) query.set("opportunity_type_id", typeId);

  const { data, loading, error, reload } = useFetch<ListResponse<Opportunity>>(`/opportunities?${query.toString()}`, [page, search, kind, stage, typeId]);
  const { data: types, reload: reloadTypes } = useFetch<OpportunityType[]>("/opportunities/types");
  const { data: companies } = useFetch<CompanySearchResponse>("/opportunities/companies/search");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const companyOptions: SelectOption[] = [
    ...(companies?.clients.map((c) => ({ value: `client:${c.id}`, label: `${c.company} — existing client` })) ?? []),
    ...(companies?.leads.map((l) => ({ value: `lead:${l.id}`, label: `${l.company} — existing lead` })) ?? []),
  ];
  // Deliberately NOT a composite "client:<id>"/"lead:<id>" value here: that
  // would make CustomSelect's closed-state display fall back to the picked
  // option's full annotated label ("Acme Co — existing client") instead of
  // the plain company name. Feeding it the plain company text keeps the
  // input showing just the company, while handleCompanyChange below still
  // reads the composite id off whichever option was actually clicked.
  const companySelectValue = form.company;

  function handleCompanyChange(v: string) {
    if (v.startsWith("client:")) {
      const id = v.slice(7);
      const match = companies?.clients.find((c) => c.id === id);
      setForm((f) => ({ ...f, company: match?.company ?? f.company, client_id: id, lead_id: "" }));
    } else if (v.startsWith("lead:")) {
      const id = v.slice(5);
      const match = companies?.leads.find((l) => l.id === id);
      setForm((f) => ({ ...f, company: match?.company ?? f.company, lead_id: id, client_id: "" }));
    } else {
      setForm((f) => ({ ...f, company: v, client_id: "", lead_id: "" }));
    }
  }

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "sales";
  const canDelete = user?.role === "admin";

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setModalOpen(true);
  }
  function openEdit(o: Opportunity) {
    setEditing(o);
    setForm({
      kind: o.kind, company: o.company, client_name: o.client_name ?? "", contact: o.contact ?? "",
      opportunity_type_ids: o.opportunity_types.map((t) => t.id), description: o.description ?? "",
      pdf_pg_url: o.pdf_pg_url ?? "", stage: o.stage as (typeof STAGES)[number], lost_reason: o.lost_reason ?? "",
      follow_up_date: o.follow_up_date ?? "", lead_date: o.lead_date ?? "", remarks: o.remarks ?? "",
      client_id: o.client_id ?? "", lead_id: o.lead_id ?? "",
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  function toggleType(id: string) {
    setForm((f) => ({
      ...f,
      opportunity_type_ids: f.opportunity_type_ids.includes(id)
        ? f.opportunity_type_ids.filter((t) => t !== id)
        : [...f.opportunity_type_ids, id],
    }));
  }

  async function addType() {
    if (!newTypeName.trim()) return;
    try {
      const created = await api.post<OpportunityType>("/opportunities/types", { name: newTypeName.trim() });
      setNewTypeName("");
      reloadTypes();
      setForm((f) => ({ ...f, opportunity_type_ids: [...f.opportunity_type_ids, created.id] }));
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't add type", "error");
    }
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    const payload: Record<string, unknown> = {
      kind: form.kind, company: form.company, client_name: form.client_name || undefined,
      contact: form.contact || undefined, opportunity_type_ids: form.opportunity_type_ids,
      description: form.description || undefined, pdf_pg_url: form.pdf_pg_url || undefined,
      stage: form.stage, lost_reason: form.stage === "Lost" ? form.lost_reason || undefined : undefined,
      follow_up_date: form.follow_up_date || undefined, lead_date: form.lead_date || undefined, remarks: form.remarks || undefined,
      client_id: form.client_id || undefined, lead_id: form.lead_id || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/opportunities/${editing.id}`, payload);
        push("Opportunity updated", "success");
      } else {
        await api.post("/opportunities", payload);
        push("Opportunity added", "success");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "details" in err.body) {
        const details = (err.body as { details?: Record<string, string> | { fieldErrors?: Record<string, string[]> } }).details;
        const fe: Record<string, string> = {};
        if (details && "fieldErrors" in details && details.fieldErrors) {
          for (const [k, v] of Object.entries(details.fieldErrors)) fe[k] = v[0];
        } else if (details) {
          for (const [k, v] of Object.entries(details)) if (typeof v === "string") fe[k] = v;
        }
        setFieldErrors(fe);
      } else {
        push(err instanceof Error ? err.message : "Failed to save opportunity", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(o: Opportunity) {
    if (!(await confirm({ message: `Delete opportunity "${o.company}"? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.delete(`/opportunities/${o.id}`);
      push("Opportunity deleted", "success");
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  async function convertToClient(o: Opportunity) {
    if (!(await confirm({
      message: `Convert "${o.company}" to a Client record? This links (or creates) a Client so its projects, invoices, and files all live under the same company.`,
      confirmLabel: "Convert",
    }))) return;
    try {
      await api.post(`/opportunities/${o.id}/convert`, {});
      push("Converted to Client", "success");
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Conversion failed", "error");
    }
  }

  function openImport() {
    setImportFile(null);
    setImportResult(null);
    setImportOpen(true);
  }

  async function runImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const form2 = new FormData();
      form2.append("file", importFile);
      const result = await api.postForm<ImportResult>("/opportunities/import", form2);
      setImportResult(result);
      reload();
      reloadTypes();
      push(`Imported ${result.imported} opportunit${result.imported === 1 ? "y" : "ies"}`, result.skipped.length ? "info" : "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        icon={<IconOpportunities size={19} />}
        title="Opportunities"
        subtitle={data ? `${data.total} opportunit${data.total === 1 ? "y" : "ies"} tracked` : undefined}
        actions={<>
          {canEdit && <button type="button" className="btn btn-ghost" onClick={openImport}><IconUpload size={14} /> Import</button>}
          {canEdit && <button type="button" className="btn btn-primary" onClick={openAdd}><IconPlus size={14} /> Add Opportunity</button>}
        </>}
      />

      <div className="filter-bar">
        <input className="filter-input" placeholder="Search company / client..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <CustomSelect
          value={kind}
          onChange={(v) => { setKind(v); setPage(1); }}
          placeholder="All Kinds"
          options={[{ value: "", label: "All Kinds" }, { value: "service", label: "Service" }, { value: "product", label: "Product" }]}
        />
        <CustomSelect
          value={stage}
          onChange={(v) => { setStage(v); setPage(1); }}
          placeholder="All Stages"
          options={[{ value: "", label: "All Stages" }, ...STAGES.map((s) => ({ value: s, label: s }))]}
        />
        <CustomSelect
          value={typeId}
          onChange={(v) => { setTypeId(v); setPage(1); }}
          placeholder="All Types"
          options={[{ value: "", label: "All Types" }, ...(types?.map((t) => ({ value: t.id, label: t.name })) ?? [])]}
        />
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th><th>Contact</th><th>Kind</th><th>Lead Date</th><th>Types</th><th>Stage</th><th>Follow-up</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={8} />}
              {!loading && data?.data.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty">
                    <div className="empty-icon"><IconInbox size={30} /></div>
                    No opportunities match these filters yet.
                  </div>
                </td></tr>
              )}
              {data?.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 550, color: "var(--text)" }}>{o.company}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{o.client_name ?? "—"}</div>
                    {o.client && <div style={{ fontSize: 10.5, color: "var(--success)", fontWeight: 600 }}>↳ linked client</div>}
                    {!o.client && o.lead && <div style={{ fontSize: 10.5, color: "var(--info)", fontWeight: 600 }}>↳ linked lead</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{o.contact ?? "—"}</td>
                  <td style={{ fontSize: 12, textTransform: "capitalize" }}>{o.kind}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(o.lead_date)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 220 }}>
                      {o.opportunity_types.length === 0 && <span style={{ fontSize: 11, color: "var(--text3)" }}>—</span>}
                      {o.opportunity_types.map((t) => <span key={t.id} className="badge badge-draft">{t.name}</span>)}
                    </div>
                  </td>
                  <td><Badge status={o.stage} /></td>
                  <td style={{ fontSize: 12 }}>{formatDate(o.follow_up_date)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(o)}>Edit</button>}
                      {canEdit && o.stage === "Won" && !o.client_id && (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--success)" }} onClick={() => convertToClient(o)}>Convert to Client</button>
                      )}
                      {canDelete && <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(o)}>Delete</button>}
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
          title={editing ? "Edit Opportunity" : "Add Opportunity"}
          onClose={() => setModalOpen(false)}
          wide
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Opportunity"}</button>
          </>}
        >
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Kind *</label>
              <CustomSelect
                value={form.kind}
                onChange={(v) => setForm({ ...form, kind: v as (typeof KINDS)[number] })}
                options={[{ value: "service", label: "Service" }, { value: "product", label: "Product" }]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Company *</label>
              <CustomSelect
                searchable
                allowCustomValue
                value={companySelectValue}
                onChange={handleCompanyChange}
                placeholder="Type a company name, or pick an existing client/lead…"
                options={companyOptions}
              />
              {(form.client_id || form.lead_id) && (
                <div style={{ fontSize: 11, color: "var(--success)" }}>Linked to an existing {form.client_id ? "client" : "lead"}</div>
              )}
              {fieldErrors.company && <div className="form-error">{fieldErrors.company}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Client Name</label>
              <input className="form-input" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact</label>
              <input className="form-input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Stage</label>
              <CustomSelect
                value={form.stage}
                onChange={(v) => setForm({ ...form, stage: v as (typeof STAGES)[number] })}
                options={STAGES.map((s) => ({ value: s, label: s }))}
              />
            </div>
            {form.stage === "Lost" && (
              <div className="form-group">
                <label className="form-label">Lost Reason *</label>
                <input className="form-input" value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} />
                {fieldErrors.lost_reason && <div className="form-error">{fieldErrors.lost_reason}</div>}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Lead Date</label>
              <CustomDatePicker value={form.lead_date} onChange={(v) => setForm({ ...form, lead_date: v })} placeholder="When this lead came in…" />
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Date</label>
              <CustomDatePicker value={form.follow_up_date} onChange={(v) => setForm({ ...form, follow_up_date: v })} />
            </div>
            <div className="form-group">
              <label className="form-label">PDF/PG &amp; URL</label>
              <input className="form-input" value={form.pdf_pg_url} onChange={(e) => setForm({ ...form, pdf_pg_url: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Opportunity Types</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0" }}>
                {types?.map((t) => {
                  const selected = form.opportunity_type_ids.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`type-chip${selected ? " selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => toggleType(t.id)}
                    >
                      {selected && <IconCheck size={11} />}
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <input className="filter-input" placeholder="New type name…" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} style={{ maxWidth: 220 }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={addType}>+ Add Type</button>
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Remarks</label>
              <textarea className="form-textarea" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="Import Opportunities"
          onClose={() => setImportOpen(false)}
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)}>Close</button>
            <button type="button" className="btn btn-primary" onClick={runImport} disabled={!importFile || importing}>{importing ? "Importing…" : "Import"}</button>
          </>}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
                Download the template, fill in one row per opportunity, then upload it here to import many at once.
              </div>
              <a
                className="btn btn-ghost btn-sm"
                href={`${API_BASE}/api/opportunities/import-template`}
                style={{ display: "inline-flex" }}
              >
                <IconDownload size={13} /> Download Template
              </a>
            </div>
            <div className="form-group">
              <label className="form-label">Filled-in Template (.xlsx)</label>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                <IconUpload size={13} /> {importFile ? importFile.name : "Choose File"}
                <input
                  type="file"
                  accept=".xlsx"
                  style={{ display: "none" }}
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {importResult && (
              <div>
                <div className="banner banner-info">
                  {importResult.imported} row(s) imported.
                  {importResult.duplicates > 0 && ` ${importResult.duplicates} duplicate(s) skipped — already in the system.`}
                </div>
                {importResult.skipped.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
                      {importResult.skipped.length} row(s) skipped:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflow: "auto" }}>
                      {importResult.skipped.map((s) => (
                        <div key={s.row} style={{ fontSize: 11.5, color: "var(--danger)" }}>Row {s.row}: {s.reason}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
