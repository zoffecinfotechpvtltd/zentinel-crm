import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomFieldsSection } from "../components/CustomFieldsSection";
import { useAuth, isAdminRole } from "../context/AuthContext";
import { useFetch, useInfiniteFetch } from "../lib/useFetch";
import { api, ApiError, downloadFile } from "../lib/api";
import { Badge } from "../components/Badge";
import { StatCard } from "../components/StatCard";
import { Modal } from "../components/Modal";
import { InfiniteScrollSentinel } from "../components/InfiniteScrollSentinel";
import { PageHeader } from "../components/PageHeader";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { formatDate, formatMoney } from "../lib/format";
import { IconOpportunities, IconPlus, IconInbox, IconUpload, IconDownload, IconCheck } from "../components/Icons";
import { CustomSelect, type SelectOption } from "../components/CustomSelect";
import { CustomDatePicker } from "../components/CustomDatePicker";
import { opportunityFormSchema, emptyOpportunityForm, KINDS, STAGES, type OpportunityFormValues } from "../lib/schemas/opportunity";

type OpportunityType = { id: string; name: string };
type LinkedCompany = { id: string; company: string };
type Opportunity = {
  id: string; kind: "service" | "product"; company: string; client_name: string | null; contact: string | null;
  description: string | null; pdf_pg_url: string | null; stage: string; lost_reason: string | null;
  value: string | null; follow_up_date: string | null; lead_date: string | null; remarks: string | null; assigned_to: string | null;
  client_id: string | null; lead_id: string | null; client: LinkedCompany | null; lead: LinkedCompany | null;
  opportunity_types: OpportunityType[]; custom_fields: Record<string, unknown>;
};
type ImportResult = { imported: number; skipped: { row: number; reason: string }[]; duplicates: number };
type CompanySearchResponse = { clients: LinkedCompany[]; leads: LinkedCompany[] };

export function Opportunities() {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();

  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [kind, setKind] = useState("");
  const [stage, setStage] = useState("");
  const [typeId, setTypeId] = useState("");

  const { items: opportunities, total, loading, error, loadingMore, hasMore, loadMore, reload } = useInfiniteFetch<Opportunity>(
    (p) => {
      const query = new URLSearchParams({ page: String(p), per_page: "20" });
      if (search) query.set("search", search);
      if (kind) query.set("kind", kind);
      if (stage) query.set("stage", stage);
      if (typeId) query.set("opportunity_type_id", typeId);
      return `/opportunities?${query.toString()}`;
    },
    [search, kind, stage, typeId]
  );
  const { data: types, reload: reloadTypes } = useFetch<OpportunityType[]>("/opportunities/types");
  const { data: pipelineValue, reload: reloadPipelineValue } = useFetch<{ open_pipeline: number; won: number }>("/opportunities/pipeline-value");
  const { data: companies } = useFetch<CompanySearchResponse>("/opportunities/companies/search");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  // Ancillary state not covered by opportunityFormSchema (see the schema
  // file's comment) - the company-search linkage and the dynamic custom
  // fields payload, both merged into the submit payload alongside the
  // validated RHF fields.
  const [linkedClientId, setLinkedClientId] = useState("");
  const [linkedLeadId, setLinkedLeadId] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  const {
    register, handleSubmit, watch, setValue, getValues, reset,
    formState: { errors, isSubmitting },
  } = useForm<OpportunityFormValues>({ resolver: zodResolver(opportunityFormSchema), defaultValues: emptyOpportunityForm });

  const stageValue = watch("stage");
  const kindValue = watch("kind");
  const typeIds = watch("opportunity_type_ids");
  const companySelectValue = watch("company");

  const companyOptions: SelectOption[] = [
    ...(companies?.clients.map((c) => ({ value: `client:${c.id}`, label: `${c.company} - existing client` })) ?? []),
    ...(companies?.leads.map((l) => ({ value: `lead:${l.id}`, label: `${l.company} - existing lead` })) ?? []),
  ];

  function handleCompanyChange(v: string) {
    if (v.startsWith("client:")) {
      const id = v.slice(7);
      const match = companies?.clients.find((c) => c.id === id);
      setValue("company", match?.company ?? getValues("company"), { shouldValidate: true });
      setLinkedClientId(id);
      setLinkedLeadId("");
    } else if (v.startsWith("lead:")) {
      const id = v.slice(5);
      const match = companies?.leads.find((l) => l.id === id);
      setValue("company", match?.company ?? getValues("company"), { shouldValidate: true });
      setLinkedLeadId(id);
      setLinkedClientId("");
    } else {
      setValue("company", v, { shouldValidate: true });
      setLinkedClientId("");
      setLinkedLeadId("");
    }
  }

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const canEdit = isAdminRole(user?.role) || user?.role === "sales";
  const canDelete = isAdminRole(user?.role);

  function openAdd() {
    setEditing(null);
    reset(emptyOpportunityForm);
    setLinkedClientId("");
    setLinkedLeadId("");
    setCustomFields({});
    setSaveError(null);
    setModalOpen(true);
  }
  function openEdit(o: Opportunity) {
    setEditing(o);
    reset({
      kind: o.kind, company: o.company, client_name: o.client_name ?? "", contact: o.contact ?? "",
      opportunity_type_ids: o.opportunity_types.map((t) => t.id), description: o.description ?? "",
      pdf_pg_url: o.pdf_pg_url ?? "", stage: o.stage as (typeof STAGES)[number], lost_reason: o.lost_reason ?? "",
      value: o.value ?? "", follow_up_date: o.follow_up_date ?? "", lead_date: o.lead_date ?? "", remarks: o.remarks ?? "",
    });
    setLinkedClientId(o.client_id ?? "");
    setLinkedLeadId(o.lead_id ?? "");
    setCustomFields(o.custom_fields ?? {});
    setSaveError(null);
    setModalOpen(true);
  }

  function toggleType(id: string) {
    const current = getValues("opportunity_type_ids");
    setValue("opportunity_type_ids", current.includes(id) ? current.filter((t) => t !== id) : [...current, id]);
  }

  async function addType() {
    if (!newTypeName.trim()) return;
    try {
      const created = await api.post<OpportunityType>("/opportunities/types", { name: newTypeName.trim() });
      setNewTypeName("");
      reloadTypes();
      setValue("opportunity_type_ids", [...getValues("opportunity_type_ids"), created.id]);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't add type", "error");
    }
  }

  const onSave = handleSubmit(
    async (values) => {
      setSaveError(null);
      try {
        const nullable = (v: string | undefined) => v || (editing ? null : undefined);
        const payload: Record<string, unknown> = {
          kind: values.kind, company: values.company, client_name: nullable(values.client_name),
          contact: nullable(values.contact), opportunity_type_ids: values.opportunity_type_ids,
          description: nullable(values.description), pdf_pg_url: nullable(values.pdf_pg_url),
          stage: values.stage, lost_reason: values.stage === "Lost" ? nullable(values.lost_reason) : (editing ? null : undefined),
          value: values.value ? Number(values.value) : (editing ? null : undefined),
          follow_up_date: nullable(values.follow_up_date), lead_date: nullable(values.lead_date), remarks: nullable(values.remarks),
          client_id: nullable(linkedClientId), lead_id: nullable(linkedLeadId), custom_fields: customFields,
        };
        if (editing) {
          await api.patch(`/opportunities/${editing.id}`, payload);
          push("Opportunity updated", "success");
        } else {
          await api.post("/opportunities", payload);
          push("Opportunity added", "success");
        }
        setModalOpen(false);
        reload();
        reloadPipelineValue();
      } catch (err) {
        push(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to save opportunity", "error");
      }
    },
    () => {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    }
  );

  async function remove(o: Opportunity) {
    if (!(await confirm({ message: `Delete opportunity "${o.company}"? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.delete(`/opportunities/${o.id}`);
      push("Opportunity deleted", "success");
      reload();
      reloadPipelineValue();
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
      reloadPipelineValue();
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
      reloadPipelineValue();
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
        subtitle={!loading ? `${total} opportunit${total === 1 ? "y" : "ies"} tracked` : undefined}
        actions={<>
          {canEdit && <button type="button" className="btn btn-ghost" onClick={openImport}><IconUpload size={14} /> Import</button>}
          {canEdit && <button type="button" className="btn btn-primary" onClick={openAdd}><IconPlus size={14} /> Add Opportunity</button>}
        </>}
      />

      {pipelineValue && (
        <div className="stat-grid">
          <StatCard label="Open Pipeline Value" value={formatMoney(pipelineValue.open_pipeline)} color="var(--accent)" />
          <StatCard label="Won Value" value={formatMoney(pipelineValue.won)} color="var(--success)" />
        </div>
      )}

      <div className="filter-bar">
        <input className="filter-input" placeholder="Search company / client..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <CustomSelect
          value={kind}
          onChange={setKind}
          placeholder="All Kinds"
          options={[{ value: "", label: "All Kinds" }, { value: "service", label: "Service" }, { value: "product", label: "Product" }]}
        />
        <CustomSelect
          value={stage}
          onChange={setStage}
          placeholder="All Stages"
          options={[{ value: "", label: "All Stages" }, ...STAGES.map((s) => ({ value: s, label: s }))]}
        />
        <CustomSelect
          value={typeId}
          onChange={setTypeId}
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
                <th>Company</th><th>Contact</th><th>Kind</th><th>Value</th><th>Lead Date</th><th>Types</th><th>Stage</th><th>Follow-up</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={9} />}
              {!loading && opportunities.length === 0 && (
                <tr><td colSpan={9}>
                  <div className="empty">
                    <div className="empty-icon"><IconInbox size={30} /></div>
                    No opportunities match these filters yet.
                  </div>
                </td></tr>
              )}
              {opportunities.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 550, color: "var(--text)" }}>{o.company}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{o.client_name ?? "-"}</div>
                    {o.client && (
                      <Link to={`/clients?q=${encodeURIComponent(o.client.company)}`} style={{ fontSize: 10.5, color: "var(--success)", fontWeight: 600, textDecoration: "none" }}>
                        ↳ linked client
                      </Link>
                    )}
                    {!o.client && o.lead && (
                      <Link to={`/leads?q=${encodeURIComponent(o.lead.company)}`} style={{ fontSize: 10.5, color: "var(--info)", fontWeight: 600, textDecoration: "none" }}>
                        ↳ linked lead
                      </Link>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{o.contact ?? "-"}</td>
                  <td style={{ fontSize: 12, textTransform: "capitalize" }}>{o.kind}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{o.value ? formatMoney(Number(o.value)) : "-"}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(o.lead_date)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 220 }}>
                      {o.opportunity_types.length === 0 && <span style={{ fontSize: 11, color: "var(--text3)" }}>-</span>}
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
        <InfiniteScrollSentinel onLoadMore={loadMore} hasMore={hasMore} loading={loadingMore} />
      </div>

      {modalOpen && (
        <Modal
          title={editing ? "Edit Opportunity" : "Add Opportunity"}
          onClose={() => setModalOpen(false)}
          wide
          footer={<>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save Opportunity"}</button>
          </>}
        >
          {saveError && <div className="banner banner-error">{saveError}</div>}
          <div className={`form-grid${shaking ? " shake-on-invalid" : ""}`}>
            <div className="form-group">
              <label className="form-label">Kind *</label>
              <CustomSelect
                value={kindValue}
                onChange={(v) => setValue("kind", v as (typeof KINDS)[number])}
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
              {(linkedClientId || linkedLeadId) && (
                <div style={{ fontSize: 11, color: "var(--success)" }}>Linked to an existing {linkedClientId ? "client" : "lead"}</div>
              )}
              {errors.company && <div className="form-error">{errors.company.message}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Client Name</label>
              <input className="form-input" {...register("client_name")} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact</label>
              <input className="form-input" {...register("contact")} />
            </div>
            <div className="form-group">
              <label className="form-label">Stage</label>
              <CustomSelect
                value={stageValue}
                onChange={(v) => setValue("stage", v as (typeof STAGES)[number], { shouldValidate: true })}
                options={STAGES.map((s) => ({ value: s, label: s }))}
              />
            </div>
            {stageValue === "Lost" && (
              <div className="form-group">
                <label className="form-label">Lost Reason *</label>
                <input className="form-input" {...register("lost_reason")} />
                {errors.lost_reason && <div className="form-error">{errors.lost_reason.message}</div>}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Value (₹)</label>
              <input className="form-input" type="number" {...register("value")} />
              {errors.value && <div className="form-error">{errors.value.message}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Lead Date</label>
              <CustomDatePicker value={watch("lead_date") ?? ""} onChange={(v) => setValue("lead_date", v)} placeholder="When this lead came in…" />
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Date</label>
              <CustomDatePicker value={watch("follow_up_date") ?? ""} onChange={(v) => setValue("follow_up_date", v)} />
            </div>
            <div className="form-group">
              <label className="form-label">PDF/PG &amp; URL</label>
              <input className="form-input" {...register("pdf_pg_url")} />
            </div>
            <div className="form-group full">
              <label className="form-label">Opportunity Types</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0" }}>
                {types?.map((t) => {
                  const selected = typeIds.includes(t.id);
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
              <textarea className="form-textarea" {...register("description")} />
            </div>
            <div className="form-group full">
              <label className="form-label">Remarks</label>
              <textarea className="form-textarea" {...register("remarks")} />
            </div>
          </div>
          <CustomFieldsSection entityType="opportunity" values={customFields} onChange={setCustomFields} />
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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => downloadFile("/opportunities/import-template", "opportunities-import-template.xlsx")}
                style={{ display: "inline-flex" }}
              >
                <IconDownload size={13} /> Download Template
              </button>
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
                  {importResult.duplicates > 0 && ` ${importResult.duplicates} duplicate(s) skipped - already in the system.`}
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
