import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

// An empty path is used throughout the app as a "nothing selected yet"
// sentinel (e.g. a detail modal that isn't open) — skip fetching entirely
// rather than firing a request to the bare /api root.
export function useFetch<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api.get<T>(path)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

type ListResponse<T> = { data: T[]; total: number };

// Infinite-scroll counterpart to useFetch, for the paginated list screens
// (Leads, Clients, Projects, Invoices, Opportunities, Activity, Audit Log) —
// accumulates pages into one growing array instead of swapping pages out,
// paired with <InfiniteScrollSentinel> at the bottom of the list.
// pathBuilder(page) must build the same list endpoint with only the page
// number varying; any other filter belongs in `deps` so changing it resets
// back to page 1 instead of appending onto a now-stale filtered set.
export function useInfiniteFetch<T>(pathBuilder: (page: number) => string, deps: unknown[] = []) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pathBuilder is a fresh closure every render (it's usually written
  // inline at the call site) — reading it through a ref instead of a
  // useCallback dependency keeps reload()/the effect below stable across
  // renders, so it only actually re-fetches when `deps` changes, not on
  // every re-render.
  const pathBuilderRef = useRef(pathBuilder);
  pathBuilderRef.current = pathBuilder;

  const fetchPage = useCallback((p: number, append: boolean) => {
    const setBusy = append ? setLoadingMore : setLoading;
    setBusy(true);
    setError(null);
    api.get<ListResponse<T>>(pathBuilderRef.current(p))
      .then((res) => {
        setItems((prev) => (append ? [...prev, ...res.data] : res.data));
        setTotal(res.total);
        setPage(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setBusy(false));
  }, []);

  const reload = useCallback(() => fetchPage(1, false), [fetchPage]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  const hasMore = items.length < total;
  function loadMore() {
    if (loadingMore || loading || !hasMore) return;
    fetchPage(page + 1, true);
  }

  return { items, total, loading, loadingMore, hasMore, loadMore, reload, error };
}
