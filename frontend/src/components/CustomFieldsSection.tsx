import { useFetch } from "../lib/useFetch";
import { CustomSelect } from "./CustomSelect";
import { CustomDatePicker } from "./CustomDatePicker";
import type { FieldDefinition } from "../pages/CustomFields";

// Renders whatever custom fields an admin has defined for this entity type,
// reading/writing a plain { key: value } object on the parent form — no
// server-side validation of the value shape beyond what each input type
// naturally produces, same trust level as the rest of this feature.
export function CustomFieldsSection({
  entityType, values, onChange,
}: {
  entityType: "lead" | "opportunity" | "client";
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const { data: definitions } = useFetch<FieldDefinition[]>(`/custom-fields?entity_type=${entityType}`);
  const active = definitions?.filter((d) => d.is_active) ?? [];
  if (active.length === 0) return null;

  function setField(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <div className="form-label" style={{ marginBottom: 8 }}>Additional Fields</div>
      <div className="form-grid">
        {active.map((d) => (
          <div className="form-group" key={d.id}>
            <label className="form-label">{d.label}</label>
            {d.field_type === "text" && (
              <input className="form-input" value={(values[d.key] as string) ?? ""} onChange={(e) => setField(d.key, e.target.value)} />
            )}
            {d.field_type === "number" && (
              <input className="form-input" type="number" value={(values[d.key] as string) ?? ""} onChange={(e) => setField(d.key, e.target.value ? Number(e.target.value) : "")} />
            )}
            {d.field_type === "date" && (
              <CustomDatePicker value={(values[d.key] as string) ?? ""} onChange={(v) => setField(d.key, v)} />
            )}
            {d.field_type === "boolean" && (
              <CustomSelect
                value={values[d.key] === true ? "yes" : values[d.key] === false ? "no" : ""}
                onChange={(v) => setField(d.key, v === "yes")}
                placeholder="Select…"
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
              />
            )}
            {d.field_type === "select" && (
              <CustomSelect
                value={(values[d.key] as string) ?? ""}
                onChange={(v) => setField(d.key, v)}
                placeholder="Select…"
                options={(d.select_options ?? []).map((o) => ({ value: o, label: o }))}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
