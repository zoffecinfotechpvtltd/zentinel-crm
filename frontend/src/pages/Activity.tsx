import { useInfiniteFetch } from "../lib/useFetch";
import { PageHeader } from "../components/PageHeader";
import { InfiniteScrollSentinel } from "../components/InfiniteScrollSentinel";
import { TableSkeleton } from "../components/Skeleton";
import { formatDateTime } from "../lib/format";
import { IconActivity, IconInbox } from "../components/Icons";
import { describeEvent } from "../lib/describeEvent";

type ActivityRow = {
  id: string; entity_type: string; entity_id: string; action: string;
  detail: Record<string, unknown>; created_at: string; actor_name: string | null;
};

export function Activity() {
  const { items, total, loading, loadingMore, hasMore, loadMore } = useInfiniteFetch<ActivityRow>(
    (p) => `/dashboard/activity?page=${p}&per_page=25`
  );

  return (
    <div>
      <PageHeader
        icon={<IconActivity size={19} />}
        title="Activity"
        subtitle="What's changed recently - status moves, new records, conversions"
      />
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Event</th></tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={8} cols={2} />}
              {!loading && items.length === 0 && (
                <tr><td colSpan={2}><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing yet.</div></td></tr>
              )}
              {items.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap", color: "var(--text3)" }}>{formatDateTime(row.created_at)}</td>
                  <td style={{ fontSize: 13 }}>{describeEvent(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InfiniteScrollSentinel onLoadMore={loadMore} hasMore={hasMore} loading={loadingMore} loadedCount={items.length} totalCount={total} />
      </div>
    </div>
  );
}
