import { useState } from "react";
import { useInfiniteFetch } from "../lib/useFetch";
import { PageHeader } from "../components/PageHeader";
import { InfiniteScrollSentinel } from "../components/InfiniteScrollSentinel";
import { TableSkeleton } from "../components/Skeleton";
import { formatDateTime } from "../lib/format";
import { IconFollowups, IconInbox } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { describeEvent } from "../lib/describeEvent";

type LogRow = {
  id: string; entity_type: string; entity_id: string; action: string;
  detail: Record<string, unknown>; created_at: string; actor_name: string | null; actor_email: string | null;
};

const ENTITY_TYPES = ["lead", "client", "project", "invoice", "opportunity"];

export function AuditLog() {
  const [entityType, setEntityType] = useState("");

  const { items, total, loading, loadingMore, hasMore, loadMore } = useInfiniteFetch<LogRow>(
    (p) => {
      const query = new URLSearchParams({ page: String(p), per_page: "40" });
      if (entityType) query.set("entity_type", entityType);
      return `/system/audit-log?${query.toString()}`;
    },
    [entityType]
  );

  return (
    <div>
      <PageHeader icon={<IconFollowups size={19} />} title="Audit Log" subtitle="Every status change and record creation, company-wide" />
      <div className="filter-bar">
        <CustomSelect
          value={entityType}
          onChange={setEntityType}
          placeholder="All record types"
          options={[{ value: "", label: "All record types" }, ...ENTITY_TYPES.map((t) => ({ value: t, label: t }))]}
        />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Event</th><th>Actor</th></tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={8} cols={3} />}
              {!loading && items.length === 0 && (
                <tr><td colSpan={3}><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing logged yet.</div></td></tr>
              )}
              {items.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDateTime(row.created_at)}</td>
                  <td>{describeEvent(row, "System")}</td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>{row.actor_email ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InfiniteScrollSentinel onLoadMore={loadMore} hasMore={hasMore} loading={loadingMore} loadedCount={items.length} totalCount={total} />
        {!loading && items.length > 0 && (
          <div style={{ padding: "8px 14px", fontSize: 11.5, color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
            Showing {items.length} of {total}
          </div>
        )}
      </div>
    </div>
  );
}
