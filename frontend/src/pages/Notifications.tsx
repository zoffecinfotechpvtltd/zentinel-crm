import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/PageHeader";
import { formatDateTime } from "../lib/format";
import {
  IconBell, IconInvoices, IconLeads, IconProjects, IconFollowups, IconX, IconInbox, IconCheck,
} from "../components/Icons";

type Notification = { id: string; type: string; title: string; body: string | null; read_at: string | null; created_at: string };
type ListResponse<T> = { data: T[]; total: number };

const TYPE_ICON: Record<string, React.ReactNode> = {
  followup_due: <IconFollowups size={16} />,
  followup_escalated: <IconFollowups size={16} />,
  invoice_overdue: <IconInvoices size={16} />,
  lead_assigned: <IconLeads size={16} />,
  project_assigned: <IconProjects size={16} />,
};
const TYPE_TONE: Record<string, string> = {
  followup_escalated: "var(--danger)", invoice_overdue: "var(--danger)",
  followup_due: "var(--warning)", lead_assigned: "var(--info)", project_assigned: "var(--purple)",
};

export function Notifications() {
  const { push } = useToast();
  const { data, reload } = useFetch<ListResponse<Notification>>("/notifications?per_page=50");

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    reload();
  }
  async function markAllRead() {
    await api.post("/notifications/mark-all-read");
    reload();
  }
  async function dismiss(id: string) {
    await api.post(`/notifications/${id}/dismiss`);
    push("Notification dismissed", "info");
    reload();
  }

  return (
    <div>
      <PageHeader
        icon={<IconBell size={19} />}
        title="Notifications"
        subtitle={data ? `${data.data.filter((n) => !n.read_at).length} unread` : undefined}
        actions={<button type="button" className="btn btn-ghost btn-sm" onClick={markAllRead}><IconCheck size={14} /> Mark all read</button>}
      />
      {data?.data.length === 0 && (
        <div className="card"><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing to catch up on.</div></div>
      )}
      {data?.data.map((n) => (
        <div
          key={n.id}
          className={`notif${!n.read_at ? " unread" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !n.read_at && markRead(n.id)}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !n.read_at) { e.preventDefault(); markRead(n.id); } }}
        >
          <div style={{ color: TYPE_TONE[n.type] ?? "var(--text3)", marginTop: 1 }}>{TYPE_ICON[n.type] ?? <IconBell size={16} />}</div>
          <div style={{ flex: 1 }}>
            <div className="notif-title">{n.title}</div>
            {n.body && <div className="notif-sub">{n.body}</div>}
            <div className="notif-sub">{formatDateTime(n.created_at)}</div>
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 24, height: 24, flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
            title="Dismiss"
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
