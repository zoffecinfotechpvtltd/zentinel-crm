import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, ApiError } from "../lib/api";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { IconKey, IconPlus, IconInbox } from "../components/Icons";
import { formatDateTime } from "../lib/format";

type ApiKey = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; is_active: boolean };

export function ApiKeys() {
  const { data: keys, reload } = useFetch<ApiKey[]>("/api-keys");
  const { push } = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function createKey() {
    setError(null);
    try {
      const result = await api.post<ApiKey & { key: string }>("/api-keys", { name });
      setName("");
      reload();
      setNewKey(result.key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create key");
    }
  }

  async function toggleActive(k: ApiKey) {
    await api.patch(`/api-keys/${k.id}`, { is_active: !k.is_active });
    reload();
  }

  async function revokeKey(k: ApiKey) {
    if (!(await confirm({ message: `Delete API key "${k.name}"? Any tool using it will stop working immediately.`, confirmLabel: "Delete", danger: true }))) return;
    await api.delete(`/api-keys/${k.id}`);
    reload();
  }

  return (
    <div>
      <PageHeader
        icon={<IconKey size={19} />}
        title="API Keys"
        subtitle="Read-only access for external tools — GET /api/v1/leads, /clients, /invoices"
      />

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Key</th><th>Last Used</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(keys?.length ?? 0) === 0 && (
                <tr><td colSpan={5}><div className="empty"><div className="empty-icon"><IconInbox size={26} /></div>No API keys yet</div></td></tr>
              )}
              {keys?.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 550 }}>{k.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{k.key_prefix}…</td>
                  <td style={{ fontSize: 12 }}>{k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}</td>
                  <td><Badge status={k.is_active ? "Active" : "Inactive"} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(k)}>{k.is_active ? "Pause" : "Resume"}</button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => revokeKey(k)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">New API Key</div>
        {error && <div className="banner banner-error">{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <input className="form-input" placeholder="What's this key for? (e.g. Zapier integration)" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm" onClick={createKey} disabled={!name.trim()}>
            <IconPlus size={12} /> Create
          </button>
        </div>
      </div>

      {newKey && (
        <Modal title="API Key Created" onClose={() => setNewKey(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setNewKey(null)}>Done</button>}>
          <div className="banner banner-error" style={{ marginBottom: 12 }}>
            Copy this now — it won't be shown again. If you lose it, delete this key and create a new one.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code className="mono" style={{ flex: 1, padding: 10, background: "var(--bg3)", borderRadius: 8, fontSize: 12.5, wordBreak: "break-all" }}>{newKey}</code>
            <button
              type="button" className="btn btn-ghost btn-sm"
              onClick={() => { navigator.clipboard.writeText(newKey); push("Copied", "success"); }}
            >
              Copy
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
