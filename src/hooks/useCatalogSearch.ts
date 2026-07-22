"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import {
  CatalogClientError,
  createCatalogClient,
  type CatalogClient,
} from "@/lib/catalogClient";
import {
  CatalogCourseQuerySchema,
  catalogCourseQueryToSearchParams,
  parseCatalogCourseSearchParams,
  type CatalogCourseQuery,
} from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";

export interface CatalogSearchState {
  query: CatalogCourseQuery;
  items: CatalogCourseRecord[];
  status: "idle" | "loading" | "loading-more" | "ready" | "empty" | "error";
  error: CatalogClientError | null;
  nextCursor: string | null;
  isStale: boolean;
  setQuery(patch: Partial<CatalogCourseQuery>): void;
  loadMore(): Promise<void>;
  retry(): Promise<void>;
}

function initialQuery(): CatalogCourseQuery {
  if (typeof window === "undefined") return CatalogCourseQuerySchema.parse({});
  try {
    return parseCatalogCourseSearchParams(new URLSearchParams(window.location.search));
  } catch {
    return CatalogCourseQuerySchema.parse({});
  }
}

function cachedMatches(
  records: Iterable<CatalogCourseRecord>,
  query: CatalogCourseQuery,
): CatalogCourseRecord[] {
  const text = query.q.trim().toLowerCase();
  return [...records].filter((record) => {
    const haystack = `${record.code} ${record.course.title} ${record.course.description ?? ""}`.toLowerCase();
    if (text && !haystack.includes(text)) return false;
    if (query.sourceIds.length && !query.sourceIds.includes(record.sourceId)) return false;
    if (query.subjects.length && !query.subjects.includes(record.subject)) return false;
    if (query.campuses.length) {
      const campus = record.sourceId === "nyu-shanghai" ? "shanghai" : "new-york";
      if (!query.campuses.includes(campus)) return false;
    }
    if (query.minCredits !== undefined && record.course.credits < query.minCredits) return false;
    if (query.maxCredits !== undefined && record.course.credits > query.maxCredits) return false;
    if (
      query.fulfillsProgramId &&
      !record.course.fulfills.some((item) => item.programId === query.fulfillsProgramId)
    ) return false;
    return true;
  }).sort((a, b) => a.code.localeCompare(b.code) || a.stableId.localeCompare(b.stableId));
}

export function useCatalogSearch(injectedClient?: CatalogClient): CatalogSearchState {
  const catalog = useCatalog();
  const releaseId = catalog.bootstrap.release.id;
  const { upsertRecords } = catalog;
  const cachedRecordsRef = useRef(catalog.recordsByStableId);
  const [client] = useState(() => injectedClient ?? createCatalogClient());
  const [query, setQueryState] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(query.q);
  const [items, setItems] = useState<CatalogCourseRecord[]>([]);
  const [status, setStatus] = useState<CatalogSearchState["status"]>("idle");
  const [error, setError] = useState<CatalogClientError | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const loadMoreRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    cachedRecordsRef.current = catalog.recordsByStableId;
  }, [catalog.recordsByStableId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(query.q), 200);
    return () => window.clearTimeout(timer);
  }, [query.q]);

  const requestQuery = useMemo(
    () => CatalogCourseQuerySchema.parse({ ...query, q: debouncedQ, cursor: undefined }),
    [debouncedQ, query],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = catalogCourseQueryToSearchParams({ ...query, cursor: undefined });
    const url = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [query]);

  const runSearch = useCallback(async (nextQuery: CatalogCourseQuery) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    setStatus("loading");
    setError(null);
    setIsStale(false);
    try {
      let page = await client.search(nextQuery, controller.signal);
      if (page.releaseId !== releaseId) {
        page = await client.search(
          CatalogCourseQuerySchema.parse({ ...nextQuery, cursor: undefined }),
          controller.signal,
        );
      }
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      upsertRecords(page.items);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setStatus(page.items.length ? "ready" : "empty");
    } catch (cause) {
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      const cached = cachedMatches(cachedRecordsRef.current.values(), nextQuery);
      const nextError = cause instanceof CatalogClientError
        ? cause
        : new CatalogClientError("network", "Course search is unavailable.");
      setError(nextError);
      setItems(cached);
      setNextCursor(null);
      setIsStale(cached.length > 0);
      setStatus(cached.length ? "ready" : "error");
    }
  }, [client, releaseId, upsertRecords]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void runSearch(requestQuery);
    });
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, [requestQuery, runSearch]);

  const setQuery = useCallback((patch: Partial<CatalogCourseQuery>) => {
    setQueryState((current) => {
      const parsed = CatalogCourseQuerySchema.parse({
        ...current,
        ...patch,
        cursor: undefined,
      });
      // The schema trims `q`, which would strip a space the moment it's typed
      // (the input is controlled) — so spaces become untypeable. Keep the user's
      // raw text for display; requestQuery/the server still trim before searching.
      if ("q" in patch) {
        return { ...parsed, q: (patch.q ?? "").slice(0, 120) };
      }
      return parsed;
    });
  }, []);

  const loadMore = useCallback((): Promise<void> => {
    if (loadMoreRef.current) return loadMoreRef.current;
    if (!nextCursor) return Promise.resolve();
    const task = (async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const sequence = sequenceRef.current;
      setStatus("loading-more");
      try {
        const page = await client.search(
          CatalogCourseQuerySchema.parse({ ...requestQuery, cursor: nextCursor }),
          controller.signal,
        );
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        if (page.releaseId !== releaseId) {
          await runSearch(requestQuery);
          return;
        }
        upsertRecords(page.items);
        setItems((current) => {
          const byId = new Map(current.map((item) => [item.stableId, item]));
          page.items.forEach((item) => byId.set(item.stableId, item));
          return [...byId.values()];
        });
        setNextCursor(page.nextCursor);
        setStatus("ready");
      } catch (cause) {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        setError(cause instanceof CatalogClientError
          ? cause
          : new CatalogClientError("network", "Could not load more courses."));
        setStatus("error");
      }
    })().finally(() => {
      loadMoreRef.current = null;
    });
    loadMoreRef.current = task;
    return task;
  }, [client, nextCursor, releaseId, requestQuery, runSearch, upsertRecords]);

  const retry = useCallback(() => runSearch(requestQuery), [requestQuery, runSearch]);

  return { query, items, status, error, nextCursor, isStale, setQuery, loadMore, retry };
}
