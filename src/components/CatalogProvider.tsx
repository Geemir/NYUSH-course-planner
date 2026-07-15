"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  catalogValueFromResponse,
  type ClientCatalogValue,
} from "@/lib/catalogClient";
import { CATALOG_FALLBACK } from "@/lib/data";

interface CatalogValue extends ClientCatalogValue {
  /** True once the DB catalog has replaced the bundled fallback. */
  loaded: boolean;
}

const fallbackCatalog = catalogValueFromResponse(CATALOG_FALLBACK);

const CatalogContext = createContext<CatalogValue>({
  ...fallbackCatalog,
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
    <CatalogContext.Provider value={{ ...catalog, loaded }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogValue {
  return useContext(CatalogContext);
}
