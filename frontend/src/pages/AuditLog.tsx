import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { TableSkeleton } from "../components/Skeleton";
import { formatDateTime } from "../lib/format";
import { IconFollowups, IconInbox } from "../components/Icons";

type LogRow = {
  id: string; entity_type: string; entity_id: string; action: string;
  detail: Record<string, unknown>; created_at: string; actor_name: string | null; actor_email: string | null;
};
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

const ENTITY_TYPES = ["lead", "client", "project", "invoice"];

function describe(row: LogRow): string {
  const who = row.actor_name ?? "System";
  const article = /^[aeiou]/i.test(row.entity_type) ? "an" : "a";
  if (row.action === "status_changed") {
    const d = row.detail as { from?: string; to?: string };
    return `${who} changed ${row.entity_type} status from "${d.from}" to "${d.to}"`;
  }
  if (row.action === "created") return `${who} created ${article} ${row.entity_type}`;
  if (row.action === "reassigned") return `${who} reassigned ${article} ${row.entity_type}`;
  if (row.action === "note_added") return `${who} logged a note on ${article} ${row.entity_type}`;
  if (row.action === "contact_added") return `${who} added a contact to ${article} ${row.entity_type}`;
  if (row.action === "contract_added") return `${who} added a contract to ${article} ${row.entity_type}`;
  return `${who} — ${row.action} on ${row.entity_type}`;
}

export function AuditLog() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "40" });
  if (entityType) query.set("entity_type", entityType);

  const { data, loading } = useFetch<ListResponse<LogRow>>(`/system/audit-log?${query.toString()}`, [page, entityType]);

  return (
    <div>
      <PageHeader icon={<IconFollowups size={19} />} title="Audit Log" subtitle="Every status change and record creation, company-wide" />
      <div className="filter-bar">
        <select className="filter-select" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          <option value="">All record types</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Event</th><th>Actor</th></tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={8} cols={3} />}
              {!loading && data?.data.length === 0 && (
                <tr><td colSpan={3}><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing logged yet.</div></td></tr>
              )}
              {data?.data.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDateTime(row.created_at)}</td>
                  <td>{describe(row)}</td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>{row.actor_email ?? "—"}</td>
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
