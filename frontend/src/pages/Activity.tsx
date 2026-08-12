import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { TableSkeleton } from "../components/Skeleton";
import { formatDateTime } from "../lib/format";
import { IconActivity, IconInbox } from "../components/Icons";

type ActivityRow = {
  id: string; entity_type: string; entity_id: string; action: string;
  detail: Record<string, unknown>; created_at: string; actor_name: string | null;
};
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

function describe(row: ActivityRow): string {
  const who = row.actor_name ?? "Someone";
  if (row.action === "status_changed") {
    const d = row.detail as { from?: string; to?: string; invoice_number?: string };
    return `${who} changed ${row.entity_type} status from "${d.from}" to "${d.to}"${d.invoice_number ? ` (${d.invoice_number})` : ""}`;
  }
  if (row.action === "created") return `${who} created a new ${row.entity_type}`;
  if (row.action === "reassigned") return `${who} reassigned a ${row.entity_type}`;
  if (row.action === "note_added") return `${who} logged an interaction`;
  if (row.action === "contact_added") return `${who} added a contact`;
  if (row.action === "contract_added") return `${who} added a contract`;
  if (row.action === "converted_to_client") return `${who} converted an opportunity to a client`;
  return `${who} — ${row.action} on ${row.entity_type}`;
}

export function Activity() {
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch<ListResponse<ActivityRow>>(`/dashboard/activity?page=${page}&per_page=25`, [page]);

  return (
    <div>
      <PageHeader
        icon={<IconActivity size={19} />}
        title="Activity"
        subtitle="What's changed recently — status moves, new records, conversions"
      />
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Event</th></tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={8} cols={2} />}
              {!loading && data?.data.length === 0 && (
                <tr><td colSpan={2}><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing yet.</div></td></tr>
              )}
              {data?.data.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap", color: "var(--text3)" }}>{formatDateTime(row.created_at)}</td>
                  <td style={{ fontSize: 13 }}>{describe(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          {data && <Pagination page={page} perPage={data.per_page} total={data.total} onChange={setPage} />}
        </div>
      </div>
    </div>
  );
}
