import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconSettings, IconInbox } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { customFieldFormSchema, emptyCustomFieldForm, ENTITY_TYPES as ENTITY_TYPE_VALUES, FIELD_TYPES as FIELD_TYPE_VALUES, type CustomFieldFormValues } from "../lib/schemas/customField";

export type FieldDefinition = {
  id: string; entity_type: string; key: string; label: string; field_type: string;
  select_options: string[] | null; is_active: boolean;
};

const ENTITY_TYPES = ENTITY_TYPE_VALUES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Dropdown" },
] satisfies { value: (typeof FIELD_TYPE_VALUES)[number]; label: string }[];

export function CustomFields() {
  const queryClient = useQueryClient();
  const { data: fields } = useQuery({ queryKey: ["custom-fields"], queryFn: () => api.get<FieldDefinition[]>("/custom-fields") });
  const { push } = useToast();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const {
    register, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<CustomFieldFormValues>({ resolver: zodResolver(customFieldFormSchema), defaultValues: emptyCustomFieldForm });

  const createMutation = useMutation({
    mutationFn: (payload: { entity_type: string; key: string; label: string; field_type: string; select_options?: string[] }) =>
      api.post("/custom-fields", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      reset(emptyCustomFieldForm);
      push("Field added", "success");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to add field"),
  });

  const createField = handleSubmit(
    (values) => {
      setError(null);
      createMutation.mutate({
        entity_type: values.entity_type,
        key: values.key,
        label: values.label,
        field_type: values.field_type,
        select_options: values.field_type === "select" ? (values.select_options ?? "").split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
    },
    () => {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    }
  );

  const toggleMutation = useMutation({
    mutationFn: (f: FieldDefinition) => api.patch(`/custom-fields/${f.id}`, { is_active: !f.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-fields"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      push("Field deleted", "success");
    },
    onError: (err) => push(err instanceof Error ? err.message : "Failed to delete field", "error"),
  });

  function toggleActive(f: FieldDefinition) {
    toggleMutation.mutate(f);
  }

  async function removeField(f: FieldDefinition) {
    if (!(await confirm({ message: `Delete field "${f.label}"? Values already recorded on records stay, but this stops collecting new ones.`, confirmLabel: "Delete", danger: true }))) return;
    deleteMutation.mutate(f.id);
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
        <div className={`form-grid${shaking ? " shake-on-invalid" : ""}`} style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">Applies To</label>
            <CustomSelect value={watch("entity_type")} onChange={(v) => setValue("entity_type", v as CustomFieldFormValues["entity_type"])} options={ENTITY_TYPES} />
          </div>
          <div className="form-group">
            <label className="form-label">Field Type</label>
            <CustomSelect value={watch("field_type")} onChange={(v) => setValue("field_type", v as CustomFieldFormValues["field_type"], { shouldValidate: true })} options={FIELD_TYPES} />
          </div>
          <div className="form-group">
            <label className="form-label">Label *</label>
            <input className="form-input" {...register("label")} placeholder="Renewal Month" />
            {errors.label && <div className="form-error">{errors.label.message}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Key * (lowercase, no spaces)</label>
            <input
              className="form-input"
              value={watch("key")}
              onChange={(e) => setValue("key", e.target.value.toLowerCase().replace(/\s+/g, "_"), { shouldValidate: true })}
              placeholder="renewal_month"
            />
            {errors.key && <div className="form-error">{errors.key.message}</div>}
          </div>
          {watch("field_type") === "select" && (
            <div className="form-group full">
              <label className="form-label">Options (comma-separated)</label>
              <input className="form-input" {...register("select_options")} placeholder="January, February, March…" />
              {errors.select_options && <div className="form-error">{errors.select_options.message}</div>}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={createField}>
          + Add Field
        </button>
      </div>
    </div>
  );
}
