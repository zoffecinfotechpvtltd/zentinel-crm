import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconTemplate, IconPlus, IconTrash } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";

type Template = { id: string; name: string; channel: string; subject: string | null; body: string; category: string };

const CATEGORIES = ["proposal_followup", "payment_reminder", "checkin"];
const CATEGORY_LABELS: Record<string, string> = {
  proposal_followup: "Proposal Follow-up",
  payment_reminder: "Payment Reminder",
  checkin: "Check-in",
};
const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

const emptyForm = { name: "", channel: "email", subject: "", body: "", category: "proposal_followup" };

export function MessageTemplates() {
  const { data, reload } = useFetch<Template[]>("/message-templates");
  const { push } = useToast();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setForm({ name: t.name, channel: t.channel, subject: t.subject ?? "", body: t.body, category: t.category });
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    setError(null);
    try {
      const payload = { ...form, subject: form.subject || undefined };
      if (editingId) {
        await api.patch(`/message-templates/${editingId}`, payload);
        push("Template updated", "success");
      } else {
        await api.post("/message-templates", payload);
        push("Template added", "success");
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save template");
    }
  }

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
          <button type="button" className="btn btn-primary" onClick={save}>{editingId ? "Save Changes" : "Save"}</button>
        </>}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group">
              <label className="form-label">Channel</label>
              <CustomSelect
                value={form.channel}
                onChange={(v) => setForm({ ...form, channel: v })}
                options={[{ value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <CustomSelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
              />
            </div>
            {form.channel === "email" && (
              <div className="form-group full"><label className="form-label">Subject</label><input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            )}
            <div className="form-group full">
              <label className="form-label">Body * - use {"{{name}}"}, {"{{service}}"}, {"{{amount}}"}, {"{{date}}"}</label>
              <textarea className="form-textarea" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
