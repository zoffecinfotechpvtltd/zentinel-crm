import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconSettings, IconInbox } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";

export type FieldDefinition = {
  id: string; entity_type: string; key: string; label: string; field_type: string;
  select_options: string[] | null; is_active: boolean;
};

const ENTITY_TYPES = [
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Opportunity" },
  { value: "client", label: "Client" },
];
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Dropdown" },
];

const emptyForm = { entity_type: "lead", key: "", label: "", field_type: "text", select_options: "" };

export function CustomFields() {
  const { data: fields, reload } = useFetch<FieldDefinition[]>("/custom-fields");
  const { push } = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  async function createField() {
    setError(null);
    try {
      await api.post("/custom-fields", {
        entity_type: form.entity_type,
        key: form.key,
        label: form.label,
        field_type: form.field_type,
        select_options: form.field_type === "select" ? form.select_options.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
      setForm(emptyForm);
      reload();
      push("Field added", "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add field");
    }
  }

  async function toggleActive(f: FieldDefinition) {
    await api.patch(`/custom-fields/${f.id}`, { is_active: !f.is_active });
    reload();
  }

  async function removeField(f: FieldDefinition) {
    if (!(await confirm({ message: `Delete field "${f.label}"? Values already recorded on records stay, but this stops collecting new ones.`, confirmLabel: "Delete", danger: true }))) return;
    await api.delete(`/custom-fields/${f.id}`);
    reload();
  }

  return (
    <div>
      <PageHeader
        icon={<IconSettings size={19} />}
        title="Custom Fields"
        subtitle="Add tracked attributes to Leads, Opportunities, and Clients without a code change"
      />

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Field</th><th>Applies To</th><th>Type</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(fields?.length ?? 0) === 0 && (
                <tr><td colSpan={5}><div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>No custom fields yet</div></td></tr>
              )}
              {fields?.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div style={{ fontWeight: 550 }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{f.key}</div>
                  </td>
                  <td style={{ fontSize: 12, textTransform: "capitalize" }}>{f.entity_type}</td>
                  <td style={{ fontSize: 12, textTransform: "capitalize" }}>{f.field_type}{f.select_options ? ` (${f.select_options.join(", ")})` : ""}</td>
                  <td><Badge status={f.is_active ? "Active" : "Inactive"} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(f)}>{f.is_active ? "Pause" : "Resume"}</button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removeField(f)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">New Field</div>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">Applies To</label>
            <CustomSelect value={form.entity_type} onChange={(v) => setForm({ ...form, entity_type: v })} options={ENTITY_TYPES} />
          </div>
          <div className="form-group">
            <label className="form-label">Field Type</label>
            <CustomSelect value={form.field_type} onChange={(v) => setForm({ ...form, field_type: v })} options={FIELD_TYPES} />
          </div>
          <div className="form-group">
            <label className="form-label">Label *</label>
            <input className="form-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Renewal Month" />
          </div>
          <div className="form-group">
            <label className="form-label">Key * (lowercase, no spaces)</label>
            <input className="form-input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder="renewal_month" />
          </div>
          {form.field_type === "select" && (
            <div className="form-group full">
              <label className="form-label">Options (comma-separated)</label>
              <input className="form-input" value={form.select_options} onChange={(e) => setForm({ ...form, select_options: e.target.value })} placeholder="January, February, March…" />
            </div>
          )}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={createField} disabled={!form.label || !form.key}>
          + Add Field
        </button>
      </div>
    </div>
  );
}
