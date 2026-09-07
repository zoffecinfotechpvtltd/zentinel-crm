import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconSparkle, IconInbox } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";

type Rule = {
  id: string; name: string; entity_type: string; trigger_status: string;
  notify_role: string | null; notify_user_id: string | null; notify_user_name: string | null;
  message_template: string; is_active: boolean;
};
type User = { id: string; name: string; role: string };

const ENTITY_TYPES = [
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Opportunity" },
  { value: "invoice", label: "Invoice" },
  { value: "project", label: "Project" },
];
const STATUS_OPTIONS: Record<string, string[]> = {
  lead: ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"],
  opportunity: ["Open", "Proposal Sent", "Won", "Lost"],
  invoice: ["Draft", "Final", "Sent", "Partial", "Paid", "Overdue", "Cancelled"],
  project: ["Not Started", "In Progress", "Awaiting Client", "Completed", "On Hold"],
};
const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "finance", label: "Finance" },
  { value: "ops", label: "Ops" },
  { value: "superadmin", label: "Superadmin" },
];

const emptyForm = { name: "", entity_type: "lead", trigger_status: "", notify_target: "", message_template: "{company} moved to {status}" };

export function AutomationRules() {
  const queryClient = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ["automation-rules"], queryFn: () => api.get<Rule[]>("/automation-rules") });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });
  const { push } = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const notifyOptions = [
    ...ROLES.map((r) => ({ value: `role:${r.value}`, label: `Role - ${r.label}` })),
    ...(users?.map((u) => ({ value: `user:${u.id}`, label: `Person - ${u.name}` })) ?? []),
  ];

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; entity_type: string; trigger_status: string; notify_role?: string; notify_user_id?: string; message_template: string }) =>
      api.post("/automation-rules", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      setForm(emptyForm);
      push("Rule created", "success");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create rule"),
  });

  function createRule() {
    setError(null);
    if (!form.notify_target) {
      setError("Pick who gets notified");
      return;
    }
    const [kind, value] = form.notify_target.split(":");
    createMutation.mutate({
      name: form.name,
      entity_type: form.entity_type,
      trigger_status: form.trigger_status,
      notify_role: kind === "role" ? value : undefined,
      notify_user_id: kind === "user" ? value : undefined,
      message_template: form.message_template,
    });
  }

  const toggleMutation = useMutation({
    mutationFn: (r: Rule) => api.patch(`/automation-rules/${r.id}`, { is_active: !r.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/automation-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      push("Rule deleted", "success");
    },
    onError: (err) => push(err instanceof Error ? err.message : "Failed to delete rule", "error"),
  });

  function toggleActive(r: Rule) {
    toggleMutation.mutate(r);
  }

  async function removeRule(r: Rule) {
    if (!(await confirm({ message: `Delete rule "${r.name}"?`, confirmLabel: "Delete", danger: true }))) return;
    deleteMutation.mutate(r.id);
  }

  return (
    <div>
      <PageHeader
        icon={<IconSparkle size={19} />}
        title="Automation Rules"
        subtitle="When a record's status reaches a value, notify someone - automatically"
      />

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rule</th><th>When</th><th>Notify</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(rules?.length ?? 0) === 0 && (
                <tr><td colSpan={5}><div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>No rules yet</div></td></tr>
              )}
              {rules?.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 550 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{r.message_template}</div>
                  </td>
                  <td style={{ fontSize: 12, textTransform: "capitalize" }}>{r.entity_type} → {r.trigger_status}</td>
                  <td style={{ fontSize: 12 }}>{r.notify_user_name ?? `Role: ${ROLES.find((role) => role.value === r.notify_role)?.label ?? r.notify_role}`}</td>
                  <td>
                    <Badge status={r.is_active ? "Active" : "Inactive"} />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(r)}>{r.is_active ? "Pause" : "Resume"}</button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removeRule(r)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">New Rule</div>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="form-group full">
            <label className="form-label">Rule Name *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Notify Finance when a lead is Won" />
          </div>
          <div className="form-group">
            <label className="form-label">When this record type…</label>
            <CustomSelect
              value={form.entity_type}
              onChange={(v) => setForm({ ...form, entity_type: v, trigger_status: "" })}
              options={ENTITY_TYPES}
            />
          </div>
          <div className="form-group">
            <label className="form-label">…reaches this status</label>
            <CustomSelect
              value={form.trigger_status}
              onChange={(v) => setForm({ ...form, trigger_status: v })}
              placeholder="Select status…"
              options={(STATUS_OPTIONS[form.entity_type] ?? []).map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div className="form-group full">
            <label className="form-label">Notify</label>
            <CustomSelect
              value={form.notify_target}
              onChange={(v) => setForm({ ...form, notify_target: v })}
              placeholder="Select a role or person…"
              options={notifyOptions}
            />
          </div>
          <div className="form-group full">
            <label className="form-label">Message ({"{company}"} and {"{status}"} get filled in)</label>
            <input className="form-input" value={form.message_template} onChange={(e) => setForm({ ...form, message_template: e.target.value })} />
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={createRule} disabled={!form.name || !form.trigger_status || !form.notify_target}>
          + Create Rule
        </button>
      </div>
    </div>
  );
}
