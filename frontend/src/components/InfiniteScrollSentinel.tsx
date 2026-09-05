import { useEffect, useRef } from "react";

// Sits at the bottom of an infinite-scroll list — fires onLoadMore as soon as
// it scrolls into view, 200px early so the next page is already in flight by
// the time the user reaches the actual bottom.
export function InfiniteScrollSentinel({ onLoadMore, hasMore, loading }: { onLoadMore: () => void; hasMore: boolean; loading: boolean }) {
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

  if (!hasMore) return null;
  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
      {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>Loading more…</span>}
    </div>
  );
}
