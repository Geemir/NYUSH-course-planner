import { z } from "zod";
import { CatalogCourseRecordSchema, type CatalogCourseRecord } from "@/lib/catalog/types";

export const CATALOG_CACHE_KEY = "nyush-catalog-course-cache-v2";
const MAX_PERSISTED_RECORDS = 500;

export interface CatalogCourseCacheState {
  releaseId: string | null;
  byStableId: Record<string, CatalogCourseRecord>;
  stableIdByOfficialCode: Record<string, string[]>;
  lastAccessedAt: Record<string, number>;
  staleStableIds: string[];
}

const PersistedSchema = z.object({
  version: z.literal(2),
  releaseId: z.string().nullable(),
  records: z.array(CatalogCourseRecordSchema).max(MAX_PERSISTED_RECORDS),
  lastAccessedAt: z.record(z.string(), z.number()),
  staleStableIds: z.array(z.string()),
}).strict();

export class CatalogCourseCache {
  private pinned = new Set<string>();
  private state: CatalogCourseCacheState;

  constructor(
    private readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    private readonly now: () => number = Date.now,
  ) {
    this.state = this.restore();
  }

  snapshot(): CatalogCourseCacheState {
    return structuredClone(this.state);
  }

  pin(stableIds: readonly string[]) {
    this.pinned = new Set(stableIds);
  }

  setRelease(releaseId: string) {
    if (this.state.releaseId === releaseId) return;
    const retained = Object.fromEntries(
      Object.entries(this.state.byStableId).filter(([id]) => this.pinned.has(id)),
    );
    this.state = {
      releaseId,
      byStableId: retained,
      stableIdByOfficialCode: this.codeIndex(retained),
      lastAccessedAt: Object.fromEntries(
        Object.keys(retained).map((id) => [id, this.state.lastAccessedAt[id] ?? this.now()]),
      ),
      staleStableIds: Object.keys(retained),
    };
    this.persist();
  }

  upsert(records: readonly CatalogCourseRecord[]) {
    records.forEach((record) => {
      const parsed = CatalogCourseRecordSchema.parse(record);
      this.state.byStableId[parsed.stableId] = parsed;
      this.state.lastAccessedAt[parsed.stableId] = this.now();
      this.state.staleStableIds = this.state.staleStableIds.filter((id) => id !== parsed.stableId);
    });
    this.evict();
    this.state.stableIdByOfficialCode = this.codeIndex(this.state.byStableId);
    this.persist();
  }

  get(stableId: string): CatalogCourseRecord | undefined {
    const record = this.state.byStableId[stableId];
    if (record) this.state.lastAccessedAt[stableId] = this.now();
    return record;
  }

  byOfficialCode(code: string): CatalogCourseRecord[] {
    return (this.state.stableIdByOfficialCode[code] ?? []).flatMap((id) =>
      this.state.byStableId[id] ? [this.state.byStableId[id]] : [],
    );
  }

  private codeIndex(records: Record<string, CatalogCourseRecord>) {
    const index: Record<string, string[]> = {};
    Object.values(records).forEach((record) => {
      (index[record.code] ??= []).push(record.stableId);
    });
    Object.values(index).forEach((ids) => ids.sort());
    return index;
  }

  private evict() {
    const ids = Object.keys(this.state.byStableId);
    if (ids.length <= MAX_PERSISTED_RECORDS) return;
    ids
      .filter((id) => !this.pinned.has(id))
      .sort((a, b) => (this.state.lastAccessedAt[a] ?? 0) - (this.state.lastAccessedAt[b] ?? 0))
      .slice(0, ids.length - MAX_PERSISTED_RECORDS)
      .forEach((id) => {
        delete this.state.byStableId[id];
        delete this.state.lastAccessedAt[id];
      });
  }

  private restore(): CatalogCourseCacheState {
    try {
      const raw = this.storage?.getItem(CATALOG_CACHE_KEY);
      if (!raw) throw new Error("empty");
      const parsed = PersistedSchema.parse(JSON.parse(raw));
      const byStableId = Object.fromEntries(parsed.records.map((record) => [record.stableId, record]));
      return {
        releaseId: parsed.releaseId,
        byStableId,
        stableIdByOfficialCode: this.codeIndex(byStableId),
        lastAccessedAt: parsed.lastAccessedAt,
        staleStableIds: parsed.staleStableIds,
      };
    } catch {
      this.storage?.removeItem(CATALOG_CACHE_KEY);
      return { releaseId: null, byStableId: {}, stableIdByOfficialCode: {}, lastAccessedAt: {}, staleStableIds: [] };
    }
  }

  private persist() {
    if (!this.storage) return;
    const records = Object.values(this.state.byStableId)
      .sort((a, b) => (this.state.lastAccessedAt[b.stableId] ?? 0) - (this.state.lastAccessedAt[a.stableId] ?? 0))
      .slice(0, MAX_PERSISTED_RECORDS);
    this.storage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      version: 2,
      releaseId: this.state.releaseId,
      records,
      lastAccessedAt: this.state.lastAccessedAt,
      staleStableIds: this.state.staleStableIds,
    }));
  }
}
