import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { formatDateTime } from "../lib/format";
import { IconPaperclip, IconTrash, IconPlus } from "./Icons";

type EntityType = "lead" | "client" | "project" | "invoice";
type Note = { id: string; body: string; created_at: string; created_by: string | null; author_name: string | null };
type Attachment = {
  id: string; filename: string; mime_type: string; size_bytes: number; document_type: string | null;
  created_at: string; uploaded_by: string | null; uploader_name: string | null;
  signature_status: "pending" | "signed" | "cancelled" | null; signer_name: string | null; signed_at: string | null;
};

const DOCUMENT_TYPES = ["Engagement Letter", "PO", "Proposal", "Other"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NotesAndFiles({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();
  const base = `/${entityType}s`;
  const { data: notes, reload: reloadNotes } = useFetch<Note[]>(`${base}/${entityId}/notes`, [entityId]);
  const { data: attachments, reload: reloadAttachments } = useFetch<Attachment[]>(`${base}/${entityId}/attachments`, [entityId]);

  const [noteBody, setNoteBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);

  const canManage = (ownerId: string | null) => user?.role === "admin" || (!!ownerId && ownerId === user?.id);

  async function addNote() {
    if (!noteBody.trim()) return;
    setSaving(true);
    try {
      await api.post(`${base}/${entityId}/notes`, { body: noteBody.trim() });
      setNoteBody("");
      reloadNotes();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't add note", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    if (!(await confirm({ message: "Delete this note?", confirmLabel: "Delete", danger: true }))) return;
    await api.delete(`${base}/${entityId}/notes/${id}`);
    reloadNotes();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("document_type", docType);
      await api.postForm(`${base}/${entityId}/attachments`, form);
      push("File attached", "success");
      reloadAttachments();
    } catch (err) {
      push(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function deleteAttachment(id: string) {
    if (!(await confirm({ message: "Delete this file?", confirmLabel: "Delete", danger: true }))) return;
    await api.delete(`${base}/${entityId}/attachments/${id}`);
    reloadAttachments();
  }

  async function requestSignature(id: string) {
    try {
      const result = await api.post<{ link: string }>(`${base}/${entityId}/attachments/${id}/signature-request`);
      await navigator.clipboard.writeText(result.link);
      push("Signing link copied — send it to the client", "success");
      reloadAttachments();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't create a signing link", "error");
    }
  }

  return (
    <div className="grid2" style={{ marginTop: 4 }}>
      <div className="card">
        <div className="card-title">Activity Notes</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <textarea
            className="form-textarea"
            style={{ minHeight: 44, flex: 1 }}
            placeholder="Add a note…"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addNote} disabled={saving || !noteBody.trim()}>Add</button>
        </div>
        {(notes?.length ?? 0) === 0 && <div className="empty" style={{ padding: 16 }}>No notes yet</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes?.map((n) => (
            <div key={n.id} style={{ padding: 10, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, color: "var(--text2)", whiteSpace: "pre-wrap" }}>{n.body}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text3)" }}>
                <span>{n.author_name ?? "Someone"} — {formatDateTime(n.created_at)}</span>
                {canManage(n.created_by) && (
                  <button type="button" className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => deleteNote(n.id)} title="Delete"><IconTrash size={11} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Files
          <div style={{ display: "flex", gap: 6 }}>
            <select className="filter-select" style={{ padding: "4px 8px", fontSize: 11.5 }} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="btn btn-ghost btn-sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
              <IconPlus size={12} /> {uploading ? "Uploading…" : "Attach"}
              <input type="file" style={{ display: "none" }} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        {(attachments?.length ?? 0) === 0 && <div className="empty" style={{ padding: 16 }}>No files yet</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attachments?.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <IconPaperclip size={14} style={{ color: "var(--text3)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <a
                  href={`${API_BASE}/api${base}/${entityId}/attachments/${a.id}/file`}
                  style={{ fontSize: 13, color: "var(--text)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={a.filename}
                >
                  {a.filename}
                </a>
                <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                  {a.document_type && <span className="badge badge-draft">{a.document_type}</span>}
                  {a.signature_status === "signed" && (
                    <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)" }} title={a.signed_at ? new Date(a.signed_at).toLocaleString() : undefined}>
                      Signed by {a.signer_name}
                    </span>
                  )}
                  {a.signature_status === "pending" && <span className="badge badge-draft">Signature requested</span>}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>{formatSize(a.size_bytes)}</span>
              {!a.signature_status && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => requestSignature(a.id)}>Request signature</button>
              )}
              {canManage(a.uploaded_by) && (
                <button type="button" className="icon-btn" style={{ width: 20, height: 20, flexShrink: 0 }} onClick={() => deleteAttachment(a.id)} title="Delete"><IconTrash size={11} /></button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
