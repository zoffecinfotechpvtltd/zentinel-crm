import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";

type Notification = { id: string; type: string; title: string; body: string | null; read_at: string | null; created_at: string };
type ListResponse<T> = { data: T[]; total: number };

export function Notifications() {
  const { data, reload } = useFetch<ListResponse<Notification>>("/notifications?per_page=50");

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    reload();
  }
  async function markAllRead() {
    await api.post("/notifications/mark-all-read");
    reload();
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Notifications</div>
        <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
      </div>
      {data?.data.length === 0 && <div className="empty">No notifications</div>}
      {data?.data.map((n) => (
        <div key={n.id} className={`notif${!n.read_at ? " unread" : ""}`} onClick={() => !n.read_at && markRead(n.id)}>
          <div>
            <div className="notif-title">{n.title}</div>
            {n.body && <div className="notif-sub">{n.body}</div>}
            <div className="notif-sub">{formatDateTime(n.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
