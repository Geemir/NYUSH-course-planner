"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PROGRAMS as FALLBACK_PROGRAMS,
  SITES as FALLBACK_SITES,
} from "@/lib/clientReferenceData";
import { CatalogCourseCache } from "@/lib/catalogCache";
import {
  CatalogClientError,
  createCatalogClient,
  type CatalogClient,
} from "@/lib/catalogClient";
import type { CatalogBootstrapResponse } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { degreeOptionsFromPrograms } from "@/lib/degreePlans";
import type { PlannerProgram } from "@/lib/requirements";
import type { Site, SpecialRule } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

type CatalogStatus = "loading" | "ready" | "stale" | "error";

interface CatalogValue {
  bootstrap: CatalogBootstrapResponse;
  recordsByStableId: ReadonlyMap<string, CatalogCourseRecord>;
  getRecord(stableId: string): CatalogCourseRecord | undefined;
  ensureCourses(stableIds: string[]): Promise<void>;
  upsertRecords(records: CatalogCourseRecord[]): void;
  status: CatalogStatus;
  error: CatalogClientError | null;
  programs: PlannerProgram[];
  programsById: ReadonlyMap<string, PlannerProgram>;
  rules: SpecialRule[];
  sites: Site[];
  snapshot: {
    id: string;
    kind: "bulletin-release";
    sourceHash: string;
    publishedAt?: string;
  };
  loaded: boolean;
}

const FALLBACK_BOOTSTRAP: CatalogBootstrapResponse = {
  release: {
    id: "offline-bootstrap",
    sourceSnapshotIds: { "nyu-shanghai": "offline-bootstrap" },
    publishedAt: "1970-01-01T00:00:00.000Z",
  },
  programs: [],
  rules: [],
  sources: [],
  sites: FALLBACK_SITES,
  filters: { subjects: [], catalogTerms: [], creditBounds: [0, 0] },
};

const NOOP = async () => undefined;
const CatalogContext = createContext<CatalogValue>({
  bootstrap: FALLBACK_BOOTSTRAP,
  recordsByStableId: new Map(),
  getRecord: () => undefined,
  ensureCourses: NOOP,
  upsertRecords: () => undefined,
  status: "loading",
  error: null,
  programs: FALLBACK_PROGRAMS,
  programsById: new Map(FALLBACK_PROGRAMS.map((program) => [program.id, program])),
  rules: [],
  sites: FALLBACK_SITES,
  snapshot: {
    id: FALLBACK_BOOTSTRAP.release.id,
    kind: "bulletin-release",
    sourceHash: FALLBACK_BOOTSTRAP.release.id,
  },
  loaded: false,
});

type CatalogProviderProps = {
  children: React.ReactNode;
  client?: CatalogClient;
  cache?: CatalogCourseCache;
};

function asCatalogError(error: unknown): CatalogClientError {
  return error instanceof CatalogClientError
    ? error
    : new CatalogClientError("network", "Catalog is temporarily unavailable.");
}

function placementCatalogIds(placements: readonly unknown[]): string[] {
  return [...new Set(placements.flatMap((placement) => {
    if (
      typeof placement === "object" &&
      placement !== null &&
      "catalogCourseId" in placement &&
      typeof placement.catalogCourseId === "string"
    ) {
      return [placement.catalogCourseId];
    }
    return [];
  }))];
}

/** Supplies release metadata and an on-demand, bounded course record cache. */
export function CatalogProvider({
  children,
  client: injectedClient,
  cache: injectedCache,
}: CatalogProviderProps) {
  const [catalogClient] = useState(() => injectedClient ?? createCatalogClient());
  const [courseCache] = useState(
    () => injectedCache ?? new CatalogCourseCache(
      typeof window === "undefined" ? undefined : window.localStorage,
    ),
  );
  const initialCache = useMemo(() => courseCache.snapshot(), [courseCache]);
  const [bootstrap, setBootstrap] = useState(FALLBACK_BOOTSTRAP);
  const [programs, setPrograms] = useState<PlannerProgram[]>(FALLBACK_PROGRAMS);
  const [recordsByStableId, setRecordsByStableId] = useState<ReadonlyMap<string, CatalogCourseRecord>>(
    () => new Map(Object.entries(initialCache.byStableId)),
  );
  const recordsRef = useRef(recordsByStableId);
  const releaseIdRef = useRef(initialCache.releaseId);
  const requestControllers = useRef(new Set<AbortController>());
  const [status, setStatus] = useState<CatalogStatus>("loading");
  const [error, setError] = useState<CatalogClientError | null>(null);
  const reconcilePrograms = usePlannerStore((state) => state.reconcilePrograms);
  const placements = usePlannerStore((state) => state.placements);
  const pinnedStableIds = useMemo(() => placementCatalogIds(placements), [placements]);
  const pinnedStableIdsRef = useRef(pinnedStableIds);

  useEffect(() => {
    pinnedStableIdsRef.current = pinnedStableIds;
  }, [pinnedStableIds]);

  const publishCache = useCallback(() => {
    const next = new Map(Object.entries(courseCache.snapshot().byStableId));
    recordsRef.current = next;
    setRecordsByStableId(next);
  }, [courseCache]);

  const upsertRecords = useCallback((records: CatalogCourseRecord[]) => {
    courseCache.upsert(records);
    publishCache();
  }, [courseCache, publishCache]);

  const getRecord = useCallback(
    (stableId: string) => recordsRef.current.get(stableId),
    [],
  );

  const ensureCourses = useCallback(async (stableIds: string[]) => {
    const missing = [...new Set(stableIds)].filter((id) => !recordsRef.current.has(id));
    for (let index = 0; index < missing.length; index += 100) {
      const controller = new AbortController();
      requestControllers.current.add(controller);
      try {
        const response = await catalogClient.getCourses(
          missing.slice(index, index + 100),
          controller.signal,
        );
        if (releaseIdRef.current === null || response.releaseId === releaseIdRef.current) {
          upsertRecords(response.items);
        }
      } finally {
        requestControllers.current.delete(controller);
      }
    }
  }, [catalogClient, upsertRecords]);

  useEffect(() => {
    const controller = new AbortController();
    const controllers = requestControllers.current;
    controllers.add(controller);
    let active = true;
    (async () => {
      try {
        const next = await catalogClient.getBootstrap(controller.signal);
        if (!active) return;
        const pinnedAtBootstrap = pinnedStableIdsRef.current;
        courseCache.pin(pinnedAtBootstrap);
        courseCache.setRelease(next.release.id);
        releaseIdRef.current = next.release.id;
        publishCache();
        setBootstrap(next);
        setPrograms(next.programs);
        setError(null);
        await ensureCourses(pinnedAtBootstrap);
        if (active) setStatus("ready");
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setError(asCatalogError(cause));
        setStatus(recordsRef.current.size > 0 ? "stale" : "error");
      } finally {
        controllers.delete(controller);
      }
    })();
    return () => {
      active = false;
      controllers.forEach((request) => request.abort());
      controllers.clear();
    };
  }, [catalogClient, courseCache, ensureCourses, publishCache]);

  useEffect(() => {
    courseCache.pin(pinnedStableIds);
    if (status === "ready") void ensureCourses(pinnedStableIds);
  }, [courseCache, ensureCourses, pinnedStableIds, status]);

  const programsById = useMemo(
    () => new Map(programs.map((program) => [program.id, program])),
    [programs],
  );
  const defaultProgramIds = useMemo(
    () => degreeOptionsFromPrograms(programs)[0]?.programs ?? [],
    [programs],
  );
  useEffect(() => {
    reconcilePrograms([...programsById.keys()], defaultProgramIds);
  }, [defaultProgramIds, programsById, reconcilePrograms]);

  const value = useMemo<CatalogValue>(() => ({
    bootstrap,
    recordsByStableId,
    getRecord,
    ensureCourses,
    upsertRecords,
    status,
    error,
    programs,
    programsById,
    rules: bootstrap.rules,
    sites: bootstrap.sites,
    snapshot: {
      id: bootstrap.release.id,
      kind: "bulletin-release",
      sourceHash: bootstrap.release.id,
      publishedAt: bootstrap.release.publishedAt,
    },
    loaded: status === "ready",
  }), [
    bootstrap, ensureCourses, error, getRecord, programs, programsById,
    recordsByStableId, status, upsertRecords,
  ]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  return useContext(CatalogContext);
}
