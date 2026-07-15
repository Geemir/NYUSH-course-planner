"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  catalogValueFromResponse,
  type ClientCatalogValue,
} from "@/lib/catalogClient";
import { CATALOG_FALLBACK } from "@/lib/data";
import { degreeOptionsFromPrograms } from "@/lib/degreePlans";
import type { PlannerProgram } from "@/lib/requirements";
import { usePlannerStore } from "@/store/plannerStore";

interface CatalogValue extends ClientCatalogValue {
  programsById: ReadonlyMap<string, PlannerProgram>;
  /** True once the DB catalog has replaced the bundled fallback. */
  loaded: boolean;
}

const fallbackCatalog = catalogValueFromResponse(CATALOG_FALLBACK);
const fallbackProgramsById = new Map(
  fallbackCatalog.programs.map((program) => [program.id, program]),
);

const CatalogContext = createContext<CatalogValue>({
  ...fallbackCatalog,
  programsById: fallbackProgramsById,
  loaded: false,
});

/**
 * Supplies the shared course catalog to the client. Renders immediately with
 * the bundled JSON (so the planner works offline / before the fetch), then
 * swaps in the DB catalog from /api/catalog. Per-user custom courses are still
 * merged on top in useCourseData.
 */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<ClientCatalogValue>(fallbackCatalog);
  const [loaded, setLoaded] = useState(false);
  const reconcilePrograms = usePlannerStore((state) => state.reconcilePrograms);
  const programsById = useMemo(
    () => new Map(catalog.programs.map((program) => [program.id, program])),
    [catalog.programs],
  );
  const defaultProgramIds = useMemo(
    () => degreeOptionsFromPrograms(catalog.programs)[0]?.programs ?? [],
    [catalog.programs],
  );

  useEffect(() => {
    reconcilePrograms([...programsById.keys()], defaultProgramIds);
  }, [defaultProgramIds, programsById, reconcilePrograms]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/catalog");
        if (!res.ok || !active) return;
        const parsed = catalogValueFromResponse(await res.json());
        if (active) {
          setCatalog(parsed);
          setLoaded(true);
        }
      } catch {
        /* keep bundled fallback */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <CatalogContext.Provider value={{ ...catalog, programsById, loaded }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogValue {
  return useContext(CatalogContext);
}
