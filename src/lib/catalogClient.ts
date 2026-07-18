import {
  PublicCatalogResponseSchema,
} from "@/lib/data";
import type { PlannerProgram } from "@/lib/requirements";
import type { Course, SpecialRule } from "@/lib/types";
import {
  CatalogBootstrapResponseSchema,
  CatalogCourseBatchRequestSchema,
  CatalogCourseBatchResponseSchema,
  CatalogCourseDetailResponseSchema,
  CatalogCoursePageSchema,
  catalogCourseQueryToSearchParams,
  type CatalogBootstrapResponse,
  type CatalogCourseBatchResponse,
  type CatalogCoursePage,
  type CatalogCourseQuery,
} from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";

const PROGRAM_COLORS = [
  "#57068c",
  "#2563eb",
  "#047857",
  "#b45309",
  "#be123c",
  "#6d28d9",
] as const;

export type ClientPlannerProgram = PlannerProgram & { color: string };

export interface ClientCatalogValue {
  snapshot: {
    id: string;
    kind: "bootstrap-legacy" | "bulletin" | "bulletin-release";
    sourceHash: string;
    publishedAt?: string;
  };
  courses: Course[];
  programs: PlannerProgram[];
  rules: SpecialRule[];
}

/** Parse one coherent API/fallback response before exposing it to client engines. */
export function catalogValueFromResponse(input: unknown): ClientCatalogValue {
  const response = PublicCatalogResponseSchema.parse(input);
  if ("release" in response) {
    return {
      snapshot: {
        id: response.release.id,
        kind: "bulletin-release",
        sourceHash: response.release.id,
        publishedAt: response.release.publishedAt,
      },
      courses: response.courses.map((record) => record.course),
      programs: response.programs,
      rules: response.rules,
    };
  }
  return response.snapshot.kind === "bulletin"
    ? {
        snapshot: response.snapshot,
        courses: response.courses,
        programs: response.programs,
        rules: response.rules,
      }
    : {
        snapshot: response.snapshot,
        courses: response.courses,
        programs: response.programs,
        rules: response.rules,
      };
}

export function selectActiveCatalogPrograms(
  programs: readonly PlannerProgram[],
  activeProgramIds: readonly string[],
): ClientPlannerProgram[] {
  const active = new Set(activeProgramIds);
  return programs
    .filter((program) => active.has(program.id))
    .map((program) => {
      if ("color" in program) return program;
      const hash = [...program.id].reduce(
        (total, character) => total + character.codePointAt(0)!,
        0,
      );
      return { ...program, color: PROGRAM_COLORS[hash % PROGRAM_COLORS.length] };
    });
}

export type CatalogClientErrorCode =
  | "invalid-request"
  | "not-found"
  | "unavailable"
  | "network"
  | "invalid-response";

export class CatalogClientError extends Error {
  constructor(
    readonly code: CatalogClientErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CatalogClientError";
  }
}

export interface CatalogClient {
  getBootstrap(signal?: AbortSignal): Promise<CatalogBootstrapResponse>;
  search(query: CatalogCourseQuery, signal?: AbortSignal): Promise<CatalogCoursePage>;
  getCourse(stableId: string, signal?: AbortSignal): Promise<CatalogCourseRecord>;
  getCourses(stableIds: string[], signal?: AbortSignal): Promise<CatalogCourseBatchResponse>;
}

async function catalogRequest<T>(
  fetcher: typeof fetch,
  url: string,
  schema: { parse(value: unknown): T },
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new CatalogClientError("network", "Catalog network request failed.");
  }
  if (!response.ok) {
    const code: CatalogClientErrorCode =
      response.status === 400
        ? "invalid-request"
        : response.status === 404
          ? "not-found"
          : "unavailable";
    throw new CatalogClientError(code, `Catalog request failed (${response.status}).`, response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CatalogClientError("invalid-response", "Catalog response was not valid JSON.");
  }
  try {
    return schema.parse(body);
  } catch {
    throw new CatalogClientError("invalid-response", "Catalog response did not match its contract.");
  }
}

export function createCatalogClient(fetcher: typeof fetch = fetch): CatalogClient {
  return {
    getBootstrap: (signal) =>
      catalogRequest(fetcher, "/api/catalog/bootstrap", CatalogBootstrapResponseSchema, { signal }),
    search: (query, signal) => {
      const params = catalogCourseQueryToSearchParams(query);
      return catalogRequest(
        fetcher,
        `/api/catalog/courses${params.size ? `?${params}` : ""}`,
        CatalogCoursePageSchema,
        { signal },
      );
    },
    getCourse: (stableId, signal) =>
      catalogRequest(
        fetcher,
        `/api/catalog/courses/${encodeURIComponent(stableId)}`,
        CatalogCourseDetailResponseSchema,
        { signal },
      ),
    getCourses: (stableIds, signal) => {
      const body = CatalogCourseBatchRequestSchema.parse({ stableIds });
      return catalogRequest(fetcher, "/api/catalog/courses/batch", CatalogCourseBatchResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    },
  };
}
