import { useEffect, useRef } from "react";

// Sits at the bottom of an infinite-scroll list — fires onLoadMore as soon as
// it scrolls into view, 200px early so the next page is already in flight by
// the time the user reaches the actual bottom. loadedCount/totalCount are
// optional - when passed, they render a "Showing X of Y" hint so a list that
// only ever loads a page at a time still tells the user how much of the
// total they're actually looking at.
export function InfiniteScrollSentinel({
  onLoadMore, hasMore, loading, loadedCount, totalCount,
}: { onLoadMore: () => void; hasMore: boolean; loading: boolean; loadedCount?: number; totalCount?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  const hasCounts = loadedCount != null && totalCount != null && totalCount > 0;

  if (!hasMore) {
    if (!hasCounts) return null;
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>Showing all {totalCount}</span>
      </div>
    );
  }
  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
      {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>Loading more…</span>}
      {!loading && hasCounts && <span style={{ fontSize: 12, color: "var(--text3)" }}>Showing {loadedCount} of {totalCount}</span>}
    </div>
  );
}
