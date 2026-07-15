import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COURSE_INDEX_URL,
  PROGRAM_INDEX_URL,
  SITEMAP_URL,
} from "@/lib/bulletin/constants";
import {
  BulletinDiscoveryError,
  discoverBulletinSources,
} from "@/lib/bulletin/discover";
import { createBulletinFetch } from "@/lib/bulletin/fetch";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    "utf8",
  );

const PROGRAM_INDEX = fixture("program-index.html");
const COURSE_INDEX = fixture("course-index.html");
const SITEMAP = fixture("sitemap.xml");

function fixtureFetcher(overrides: ReadonlyMap<string, string> = new Map()) {
  const pages = new Map<string, string>([
    [PROGRAM_INDEX_URL, PROGRAM_INDEX],
    [COURSE_INDEX_URL, COURSE_INDEX],
    [SITEMAP_URL, SITEMAP],
    ...overrides,
  ]);
  return vi.fn(async (url: string) => pages.get(url) ?? "");
}

describe("discoverBulletinSources", () => {
  it("classifies degree programs and subjects from authoritative indexes", async () => {
    const fetcher = fixtureFetcher();

    const result = await discoverBulletinSources(fetcher);

    expect(result.majors.map((source) => source.slug)).toEqual([
      "computer-science-bs",
    ]);
    expect(result.minors.map((source) => source.slug)).toEqual([
      "computer-science-minor",
    ]);
    expect(result.subjects.map((source) => source.slug)).toEqual([
      "csci-shu",
      "math-shu",
    ]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      PROGRAM_INDEX_URL,
      COURSE_INDEX_URL,
      SITEMAP_URL,
    ]);
  });

  it("canonicalizes discovered URLs and returns stable slug order", async () => {
    const programIndex = PROGRAM_INDEX.replace(
      "/undergraduate/shanghai/programs/computer-science-bs/",
      "HTTPS://BULLETINS.NYU.EDU/undergraduate/shanghai/programs/computer-science-bs?view=all#requirements",
    );

    const result = await discoverBulletinSources(
      fixtureFetcher(new Map([[PROGRAM_INDEX_URL, programIndex]])),
    );

    expect(result.majors[0]).toMatchObject({
      slug: "computer-science-bs",
      url: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-bs/",
    });
  });

  it("rejects a credential link outside the public NYU Bulletin allowlist", async () => {
    const programIndex = PROGRAM_INDEX.replace(
      "/undergraduate/shanghai/programs/computer-science-bs/",
      "https://example.com/undergraduate/shanghai/programs/computer-science-bs/",
    );

    await expect(
      discoverBulletinSources(
        fixtureFetcher(new Map([[PROGRAM_INDEX_URL, programIndex]])),
      ),
    ).rejects.toThrow(BulletinDiscoveryError);
  });

  it("rejects empty authoritative indexes", async () => {
    const emptyProgramIndex =
      "<!doctype html><html><body><main><h1>NYU Shanghai Programs</h1></main></body></html>";

    await expect(
      discoverBulletinSources(
        fixtureFetcher(new Map([[PROGRAM_INDEX_URL, emptyProgramIndex]])),
      ),
    ).rejects.toThrow("did not list any allowed sources");
  });

  it("rejects an index without its identity heading", async () => {
    const wrongIdentity = PROGRAM_INDEX.replace(
      "<h1>NYU Shanghai Programs</h1>",
      "<h1>Graduate Programs</h1>",
    );

    await expect(
      discoverBulletinSources(
        fixtureFetcher(new Map([[PROGRAM_INDEX_URL, wrongIdentity]])),
      ),
    ).rejects.toThrow("identity could not be verified");
  });

  it("accepts the official Course Inventory A-Z index heading", async () => {
    const liveCourseIndex = COURSE_INDEX.replace(
      "<h1>NYU Shanghai Courses</h1>",
      "<h1>Course Inventory A-Z</h1>",
    );

    const result = await discoverBulletinSources(
      fixtureFetcher(new Map([[COURSE_INDEX_URL, liveCourseIndex]])),
    );

    expect(result.subjects.map((source) => source.slug)).toEqual([
      "csci-shu",
      "math-shu",
    ]);
  });

  it("ignores the official course-index PDF utility link", async () => {
    const liveCourseIndex = COURSE_INDEX.replace(
      "</body>",
      '<a href="/undergraduate/shanghai/courses/courses.pdf">Download Page (PDF)</a></body>',
    );

    const result = await discoverBulletinSources(
      fixtureFetcher(new Map([[COURSE_INDEX_URL, liveCourseIndex]])),
    );

    expect(result.subjects.map((source) => source.slug)).toEqual([
      "csci-shu",
      "math-shu",
    ]);
  });

  it("rejects sources absent from the authoritative sitemap", async () => {
    const incompleteSitemap = SITEMAP.replace(
      /\s*<url><loc>https:\/\/bulletins\.nyu\.edu\/undergraduate\/shanghai\/courses\/math-shu\/<\/loc><\/url>/,
      "",
    );

    await expect(
      discoverBulletinSources(
        fixtureFetcher(new Map([[SITEMAP_URL, incompleteSitemap]])),
      ),
    ).rejects.toThrow("could not be verified in the Bulletin sitemap");
  });

  it("rejects a query-bearing sitemap entry for a canonical source", async () => {
    const noncanonicalSitemap = SITEMAP.replace(
      "/undergraduate/shanghai/courses/math-shu/</loc>",
      "/undergraduate/shanghai/courses/math-shu/?preview=1</loc>",
    );

    await expect(
      discoverBulletinSources(
        fixtureFetcher(new Map([[SITEMAP_URL, noncanonicalSitemap]])),
      ),
    ).rejects.toThrow("could not be verified in the Bulletin sitemap");
  });

  it("rejects a sitemap entry missing the canonical trailing slash", async () => {
    const noncanonicalSitemap = SITEMAP.replace(
      "/undergraduate/shanghai/courses/math-shu/</loc>",
      "/undergraduate/shanghai/courses/math-shu</loc>",
    );

    await expect(
      discoverBulletinSources(
        fixtureFetcher(new Map([[SITEMAP_URL, noncanonicalSitemap]])),
      ),
    ).rejects.toThrow("could not be verified in the Bulletin sitemap");
  });

  it("wraps fetch failures without exposing upstream details", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("secret upstream token");
    });

    const error = await discoverBulletinSources(fetcher).catch((cause) => cause);

    expect(error).toBeInstanceOf(BulletinDiscoveryError);
    expect(error.message).toBe("Unable to fetch NYU Shanghai Bulletin indexes.");
    expect(error.message).not.toContain("secret upstream token");
  });
});

describe("createBulletinFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects off-domain URLs before issuing a request", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const fetcher = createBulletinFetch({
      timeoutMs: 100,
      retries: 0,
      userAgent: "course-planner-test",
    });

    await expect(fetcher("https://example.com/sitemap.xml")).rejects.toThrow(
      "not allowed",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the configured user agent and returns successful response text", async () => {
    const request = vi.fn(async () => new Response("fixture body"));
    vi.stubGlobal("fetch", request);
    const fetcher = createBulletinFetch({
      timeoutMs: 100,
      retries: 0,
      userAgent: "course-planner-test",
    });

    await expect(fetcher(PROGRAM_INDEX_URL)).resolves.toBe("fixture body");
    expect(request).toHaveBeenCalledWith(
      PROGRAM_INDEX_URL,
      expect.objectContaining({
        headers: { "user-agent": "course-planner-test" },
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("bounds failed requests to the initial attempt plus configured retries", async () => {
    const request = vi.fn(async () => new Response("upstream secret", { status: 503 }));
    vi.stubGlobal("fetch", request);
    const fetcher = createBulletinFetch({
      timeoutMs: 100,
      retries: 2,
      userAgent: "course-planner-test",
    });

    const error = await fetcher(PROGRAM_INDEX_URL).catch((cause) => cause);

    expect(request).toHaveBeenCalledTimes(3);
    expect(error.message).toBe("Unable to fetch an allowed NYU Bulletin page.");
    expect(error.message).not.toContain("upstream secret");
  });

  it("snapshots validated options before the caller can mutate them", async () => {
    const request = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const timeout = vi.spyOn(globalThis, "setTimeout");
    vi.stubGlobal("fetch", request);
    const options = {
      timeoutMs: 100,
      retries: 1,
      userAgent: "course-planner-original",
    };
    const fetcher = createBulletinFetch(options);
    options.timeoutMs = 9_999;
    options.retries = 0;
    options.userAgent = "course-planner-mutated";

    await expect(fetcher(PROGRAM_INDEX_URL)).rejects.toThrow(
      "Unable to fetch an allowed NYU Bulletin page.",
    );

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(
      1,
      PROGRAM_INDEX_URL,
      expect.objectContaining({
        headers: { "user-agent": "course-planner-original" },
      }),
    );
    expect(timeout).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
    expect(timeout).toHaveBeenNthCalledWith(2, expect.any(Function), 100);
  });
});
