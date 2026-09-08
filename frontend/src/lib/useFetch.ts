import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// Backed by TanStack Query (redesign spec, Data Fetching category) - same
// external shape ({data, loading, error, reload}) as the plain useState
// version this used to be, so none of this app's ~20 call sites needed to
// change, but every list fetch now goes through a real cache instead of
// local component state: shared/deduped across mounts, and reload() is a
// genuine invalidateQueries (matching the spec's "each create/update/
// delete calling invalidateQueries on its list's query key") rather than
// a component-local refetch. An empty path is used throughout the app as
// a "nothing selected yet" sentinel (e.g. a detail modal that isn't
// open) - skip fetching entirely rather than firing a request to the
// bare /api root.
export function useFetch<T>(path: string, deps: unknown[] = []) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["fetch", path, ...deps],
    queryFn: () => api.get<T>(path),
    enabled: !!path,
  });

  function reload() {
    // Invalidated by path alone (not the full deps-qualified key) - a
    // mutation on this resource should refresh every view of it, not
    // just whichever filter combination happened to trigger the reload.
    queryClient.invalidateQueries({ queryKey: ["fetch", path] });
  }

  return {
    data: (data ?? null) as T | null,
    loading: path ? isLoading : false,
    error: error ? (error instanceof Error ? error.message : "Failed to load") : null,
    reload,
  };
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
  const queryClient = useQueryClient();
  // pathBuilder(1) already fully encodes every filter (everything except
  // the page number itself varies through the page argument), so it's a
  // stable, sufficient cache key on its own - deps is included too, for
  // exact parity with the old hook's re-fetch-on-change contract even in
  // the rare case a caller's filter isn't reflected in the URL string.
  const baseKey = pathBuilder(1);
  const queryKey = ["infinite", baseKey, ...deps];

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api.get<ListResponse<T>>(pathBuilder(pageParam)),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.data.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });

  const items = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;

  function reload() {
    // resetQueries (not refetch) - old reload() discarded every
    // accumulated page and started over from page 1; refetch() on an
    // infinite query re-fetches every already-loaded page instead,
    // which isn't the same thing once more than one page is loaded.
    queryClient.resetQueries({ queryKey });
  }

  function loadMore() {
    if (isFetchingNextPage || isLoading || !hasNextPage) return;
    fetchNextPage();
  }

  return {
    items,
    total,
    loading: isLoading,
    loadingMore: isFetchingNextPage,
    hasMore: !!hasNextPage,
    loadMore,
    reload,
    error: error ? (error instanceof Error ? error.message : "Failed to load") : null,
  };
}
