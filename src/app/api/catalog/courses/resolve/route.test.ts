import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/catalog/searchRepository", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/catalog/searchRepository")
  >();
  return { ...actual, resolveActiveCourseCodes: stubs.resolve };
});

import { POST } from "@/app/api/catalog/courses/resolve/route";
import { CatalogUnavailableError } from "@/lib/catalog/searchRepository";

describe("POST /api/catalog/courses/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.resolve.mockResolvedValue({
      releaseId: "release",
      matches: [{ code: "MATH-SHU 131", records: [] }],
    });
  });

  it("canonicalizes exact codes and disables caching", async () => {
    const response = await POST(
      new Request("http://localhost/api/catalog/courses/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: [" math-shu   131 ", "MATH-SHU 131"] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(stubs.resolve).toHaveBeenCalledWith({}, ["MATH-SHU 131"]);
  });

  it("returns 400 for invalid JSON and invalid code collections", async () => {
    const invalidJson = await POST(
      new Request("http://localhost/api/catalog/courses/resolve", {
        method: "POST",
        body: "not-json",
      }),
    );
    const empty = await POST(
      new Request("http://localhost/api/catalog/courses/resolve", {
        method: "POST",
        body: JSON.stringify({ codes: [] }),
      }),
    );

    expect(invalidJson.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(stubs.resolve).not.toHaveBeenCalled();
  });

  it("returns 503 when there is no active release", async () => {
    stubs.resolve.mockRejectedValue(new CatalogUnavailableError());

    const response = await POST(
      new Request("http://localhost/api/catalog/courses/resolve", {
        method: "POST",
        body: JSON.stringify({ codes: ["MATH-SHU 131"] }),
      }),
    );

    expect(response.status).toBe(503);
  });
});
