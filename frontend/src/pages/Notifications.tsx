import { useNavigate } from "react-router-dom";
import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/PageHeader";
import { formatDateTime } from "../lib/format";
import {
  IconBell, IconInvoices, IconLeads, IconProjects, IconFollowups, IconX, IconInbox, IconCheck,
} from "../components/Icons";

type Notification = {
  id: string; type: string; title: string; body: string | null; read_at: string | null; created_at: string;
  entity_type: "lead" | "opportunity" | "client" | "project" | "invoice" | null;
  entity_id: string | null;
};
type ListResponse<T> = { data: T[]; total: number };

const ENTITY_TARGET: Record<string, string> = {
  lead: "/leads", opportunity: "/opportunities", client: "/clients", project: "/projects", invoice: "/invoices",
};

// Every notification should land you somewhere useful, not just mark itself
// read and do nothing — bundled reminders (multiple leads/invoices due) go
// to the pre-filtered Follow-ups view; single-entity ones go to that
// entity's list (no per-record deep-link yet, but far better than nowhere).
function targetFor(n: Notification): string | null {
  switch (n.type) {
    case "followup_due":
      return "/followups?section=sales&tab=today";
    case "opportunity_followup_due":
      return "/followups?section=sales&tab=today";
    case "invoice_followup_due":
      return "/followups?section=finance&tab=today";
    case "followup_escalated":
      return "/followups?section=sales&tab=overdue";
    case "invoice_overdue":
      return "/invoices";
    default:
      break;
  }
  if (n.entity_type && ENTITY_TARGET[n.entity_type]) return ENTITY_TARGET[n.entity_type];
  return null;
}

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
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch<ListResponse<Notification>>("/notifications?per_page=50");

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    reload();
  }

  function openNotification(n: Notification) {
    if (!n.read_at) markRead(n.id);
    const target = targetFor(n);
    if (target) navigate(target);
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
      {loading && (
        <div className="card"><div className="empty">Loading notifications…</div></div>
      )}
      {error && !loading && (
        <div className="banner banner-error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>Couldn't load notifications - {error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>Retry</button>
        </div>
      )}
      {!loading && !error && data?.data.length === 0 && (
        <div className="card"><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing to catch up on.</div></div>
      )}
      {!loading && data?.data.map((n) => (
        <div
          key={n.id}
          className={`notif${!n.read_at ? " unread" : ""}`}
          role="button"
          tabIndex={0}
          style={{ cursor: "pointer" }}
          onClick={() => openNotification(n)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNotification(n); } }}
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
