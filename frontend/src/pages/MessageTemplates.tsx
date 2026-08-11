import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { IconTemplate, IconPlus } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";

type Template = { id: string; name: string; channel: string; subject: string | null; body: string; category: string };

const CATEGORIES = ["proposal_followup", "payment_reminder", "checkin"];

export function MessageTemplates() {
  const { data, reload } = useFetch<Template[]>("/message-templates");
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", channel: "email", subject: "", body: "", category: "proposal_followup" });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await api.post("/message-templates", { ...form, subject: form.subject || undefined });
      setModalOpen(false);
      setForm({ name: "", channel: "email", subject: "", body: "", category: "proposal_followup" });
      push("Template added", "success");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save template");
    }
  }

  return (
    <div>
      <PageHeader
        icon={<IconTemplate size={19} />}
        title="Message Templates"
        subtitle="Reusable email and WhatsApp copy for follow-ups"
        actions={<button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}><IconPlus size={14} /> Add Template</button>}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data?.map((t) => (
          <div key={t.id} className="card">
            <div className="card-title">{t.name} <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>{t.channel} · {t.category}</span></div>
            {t.subject && <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>Subject: {t.subject}</div>}
            <div style={{ fontSize: 13, color: "var(--text2)" }}>{t.body}</div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <Modal title="Add Template" onClose={() => setModalOpen(false)} footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
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
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            {form.channel === "email" && (
              <div className="form-group full"><label className="form-label">Subject</label><input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            )}
            <div className="form-group full">
              <label className="form-label">Body * — use {"{{name}}"}, {"{{service}}"}, {"{{amount}}"}, {"{{date}}"}</label>
              <textarea className="form-textarea" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
