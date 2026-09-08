import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconSparkle, IconInbox } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { automationRuleFormSchema, emptyAutomationRuleForm, ENTITY_TYPES as ENTITY_TYPE_VALUES, type AutomationRuleFormValues } from "../lib/schemas/automationRule";

type Rule = {
  id: string; name: string; entity_type: string; trigger_status: string;
  notify_role: string | null; notify_user_id: string | null; notify_user_name: string | null;
  message_template: string; is_active: boolean;
};
type User = { id: string; name: string; role: string };

const ENTITY_TYPES = ENTITY_TYPE_VALUES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
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

export function AutomationRules() {
  const queryClient = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ["automation-rules"], queryFn: () => api.get<Rule[]>("/automation-rules") });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });
  const { push } = useToast();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const {
    register, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<AutomationRuleFormValues>({ resolver: zodResolver(automationRuleFormSchema), defaultValues: emptyAutomationRuleForm });

  const notifyOptions = [
    ...ROLES.map((r) => ({ value: `role:${r.value}`, label: `Role - ${r.label}` })),
    ...(users?.map((u) => ({ value: `user:${u.id}`, label: `Person - ${u.name}` })) ?? []),
  ];

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; entity_type: string; trigger_status: string; notify_role?: string; notify_user_id?: string; message_template: string }) =>
      api.post("/automation-rules", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      reset(emptyAutomationRuleForm);
      push("Rule created", "success");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create rule"),
  });

  const createRule = handleSubmit(
    (values) => {
      setError(null);
      const [kind, value] = values.notify_target.split(":");
      createMutation.mutate({
        name: values.name,
        entity_type: values.entity_type,
        trigger_status: values.trigger_status,
        notify_role: kind === "role" ? value : undefined,
        notify_user_id: kind === "user" ? value : undefined,
        message_template: values.message_template,
      });
    },
    () => {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    }
  );

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
        <div className={`form-grid${shaking ? " shake-on-invalid" : ""}`} style={{ marginBottom: 12 }}>
          <div className="form-group full">
            <label className="form-label">Rule Name *</label>
            <input className="form-input" {...register("name")} placeholder="Notify Finance when a lead is Won" />
            {errors.name && <div className="form-error">{errors.name.message}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">When this record type…</label>
            <CustomSelect
              ariaLabel="When this record type…"
              value={watch("entity_type")}
              onChange={(v) => { setValue("entity_type", v as AutomationRuleFormValues["entity_type"]); setValue("trigger_status", ""); }}
              options={ENTITY_TYPES}
            />
          </div>
          <div className="form-group">
            <label className="form-label">…reaches this status</label>
            <CustomSelect
              ariaLabel="…reaches this status"
              value={watch("trigger_status")}
              onChange={(v) => setValue("trigger_status", v, { shouldValidate: true })}
              placeholder="Select status…"
              options={(STATUS_OPTIONS[watch("entity_type")] ?? []).map((s) => ({ value: s, label: s }))}
            />
            {errors.trigger_status && <div className="form-error">{errors.trigger_status.message}</div>}
          </div>
          <div className="form-group full">
            <label className="form-label">Notify</label>
            <CustomSelect
              ariaLabel="Notify"
              value={watch("notify_target")}
              onChange={(v) => setValue("notify_target", v, { shouldValidate: true })}
              placeholder="Select a role or person…"
              options={notifyOptions}
            />
            {errors.notify_target && <div className="form-error">{errors.notify_target.message}</div>}
          </div>
          <div className="form-group full">
            <label className="form-label" htmlFor="rule-message-template">Message ({"{company}"} and {"{status}"} get filled in)</label>
            <input id="rule-message-template" className="form-input" {...register("message_template")} />
            {errors.message_template && <div className="form-error">{errors.message_template.message}</div>}
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={createRule}>
          + Create Rule
        </button>
      </div>
    </div>
  );
}
