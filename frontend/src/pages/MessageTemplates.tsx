import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconTemplate, IconPlus, IconTrash } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { messageTemplateFormSchema, emptyMessageTemplateForm, CATEGORIES, type MessageTemplateFormValues } from "../lib/schemas/messageTemplate";

type Template = { id: string; name: string; channel: string; subject: string | null; body: string; category: string };

const CATEGORY_LABELS: Record<string, string> = {
  proposal_followup: "Proposal Follow-up",
  payment_reminder: "Payment Reminder",
  checkin: "Check-in",
};
const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

export function MessageTemplates() {
  const { data, reload } = useFetch<Template[]>("/message-templates");
  const { push } = useToast();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const {
    register, handleSubmit, watch, setValue, reset,
    formState: { errors, isSubmitting },
  } = useForm<MessageTemplateFormValues>({ resolver: zodResolver(messageTemplateFormSchema), defaultValues: emptyMessageTemplateForm });

  function openAdd() {
    setEditingId(null);
    reset(emptyMessageTemplateForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    reset({ name: t.name, channel: t.channel as MessageTemplateFormValues["channel"], subject: t.subject ?? "", body: t.body, category: t.category as MessageTemplateFormValues["category"] });
    setError(null);
    setModalOpen(true);
  }

  const save = handleSubmit(
    async (values) => {
      setError(null);
      try {
        const payload = { ...values, subject: values.subject || undefined };
        if (editingId) {
          await api.patch(`/message-templates/${editingId}`, payload);
          push("Template updated", "success");
        } else {
          await api.post("/message-templates", payload);
          push("Template added", "success");
        }
        setModalOpen(false);
        reset(emptyMessageTemplateForm);
        setEditingId(null);
        reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save template");
      }
    },
    () => {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    }
  );

  async function removeTemplate(t: Template) {
    if (!(await confirm({ message: `Delete template "${t.name}"? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.delete(`/message-templates/${t.id}`);
      push("Template deleted", "success");
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete template", "error");
    }
  }

  return (
    <div>
      <PageHeader
        icon={<IconTemplate size={19} />}
        title="Message Templates"
        subtitle="Reusable email and WhatsApp copy for follow-ups"
        actions={<button type="button" className="btn btn-primary" onClick={openAdd}><IconPlus size={14} /> Add Template</button>}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data?.map((t) => (
          <div key={t.id} className="card">
            <div className="card-title">
              <span>{t.name} <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>{t.channel === "whatsapp" ? "WhatsApp" : "Email"} · {categoryLabel(t.category)}</span></span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>Edit</button>
                <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => removeTemplate(t)} title="Delete"><IconTrash size={12} /></button>
              </div>
            </div>
            {t.subject && <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>Subject: {t.subject}</div>}
            <div style={{ fontSize: 13, color: "var(--text2)" }}>{t.body}</div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <Modal title={editingId ? "Edit Template" : "Add Template"} onClose={() => setModalOpen(false)} footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={isSubmitting}>{isSubmitting ? "Saving…" : editingId ? "Save Changes" : "Save"}</button>
        </>}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className={`form-grid${shaking ? " shake-on-invalid" : ""}`}>
            <div className="form-group full">
              <label className="form-label">Name *</label>
              <input className="form-input" {...register("name")} />
              {errors.name && <div className="form-error">{errors.name.message}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Channel</label>
              <CustomSelect
                ariaLabel="Channel"
                value={watch("channel")}
                onChange={(v) => setValue("channel", v as MessageTemplateFormValues["channel"])}
                options={[{ value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <CustomSelect
                ariaLabel="Category"
                value={watch("category")}
                onChange={(v) => setValue("category", v as MessageTemplateFormValues["category"])}
                options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
              />
            </div>
            {watch("channel") === "email" && (
              <div className="form-group full">
                <label className="form-label">Subject</label>
                <input className="form-input" {...register("subject")} />
              </div>
            )}
            <div className="form-group full">
              <label className="form-label">Body * - use {"{{name}}"}, {"{{service}}"}, {"{{amount}}"}, {"{{date}}"}</label>
              <textarea className="form-textarea" {...register("body")} />
              {errors.body && <div className="form-error">{errors.body.message}</div>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
