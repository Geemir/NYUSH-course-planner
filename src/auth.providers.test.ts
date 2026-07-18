import { beforeEach, describe, expect, it, vi } from "vitest";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

async function loadAuthModule() {
  vi.resetModules();
  vi.doMock("@/db", () => ({ db: {} }));
  vi.doMock("@auth/drizzle-adapter", () => ({
    DrizzleAdapter: vi.fn(() => ({})),
  }));
  vi.doMock("next-auth", () => ({
    default: vi.fn(() => ({
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    })),
  }));
  return import("@/auth");
}

describe("auth providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits the console email provider in production", async () => {
    const { buildProviders } = await loadAuthModule();

    expect(
      buildProviders({
        NODE_ENV: "production",
        AUTH_MICROSOFT_ENTRA_ID_ID: "entra-client",
        AUTH_GOOGLE_ID: "google-client",
      }),
    ).not.toContainEqual(expect.objectContaining({ id: "nyu-email" }));
  });

  it("keeps configured production OAuth providers", async () => {
    const { buildProviders } = await loadAuthModule();

    expect(
      buildProviders({
        NODE_ENV: "production",
        AUTH_MICROSOFT_ENTRA_ID_ID: "entra-client",
        AUTH_GOOGLE_ID: "google-client",
      }),
    ).toEqual([MicrosoftEntraID, Google]);
  });

  it("includes the console email provider outside production", async () => {
    const { buildProviders } = await loadAuthModule();

    expect(buildProviders({ NODE_ENV: "development" })).toContainEqual(
      expect.objectContaining({ id: "nyu-email" }),
    );
    expect(buildProviders({ NODE_ENV: "test" })).toContainEqual(
      expect.objectContaining({ id: "nyu-email" }),
    );
  });

  it("ignores E2E-like environment variables when building providers", async () => {
    const { buildProviders } = await loadAuthModule();
    const providers = buildProviders({
      NODE_ENV: "production",
      E2E_AUTH_BYPASS: "true",
    } as Parameters<typeof buildProviders>[0]);

    expect(providers).toEqual([]);
  });

  it("accepts only NYU email identities", async () => {
    const { isNyuEmail } = await loadAuthModule();

    expect(isNyuEmail("student@nyu.edu")).toBe(true);
    expect(isNyuEmail("STUDENT@NYU.EDU")).toBe(true);
    expect(isNyuEmail("student@example.edu")).toBe(false);
    expect(isNyuEmail("attacker@nyu.edu.example.com")).toBe(false);
  });

  it("derives admin only from the stored role or explicit allowlist", async () => {
    const { resolveSessionRole } = await loadAuthModule();
    const allowlist = new Set(["maintainer@nyu.edu"]);

    expect(resolveSessionRole("student@nyu.edu", "student", allowlist)).toBe("student");
    expect(resolveSessionRole("maintainer@nyu.edu", "student", allowlist)).toBe("admin");
    expect(resolveSessionRole("student@nyu.edu", "admin", allowlist)).toBe("admin");
  });
});

async function loadParseCourseRoute() {
  vi.resetModules();
  const auth = vi.fn();
  const parseCourseListing = vi.fn();
  vi.doMock("@/auth", () => ({ auth }));
  vi.doMock("@/lib/courseParser", () => ({
    CourseParseError: class CourseParseError extends Error {
      status = 400;
    },
    parseCourseListing,
  }));
  const route = await import("@/app/api/parse-course/route");
  return { ...route, auth, parseCourseListing };
}

describe("personal paid course parsing", () => {
  it("returns 401 before reading the body or calling the parser without a session", async () => {
    const { POST, auth, parseCourseListing } = await loadParseCourseRoute();
    auth.mockResolvedValue(null);
    const json = vi.fn();

    const response = await POST({ json } as unknown as Request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(json).not.toHaveBeenCalled();
    expect(parseCourseListing).not.toHaveBeenCalled();
  });

  it("returns 401 before paid work for a non-NYU session", async () => {
    const { POST, auth, parseCourseListing } = await loadParseCourseRoute();
    auth.mockResolvedValue({
      expires: "2099-01-01T00:00:00.000Z",
      user: { id: "user-1", email: "outsider@example.com", role: "student" },
    });
    const json = vi.fn();

    const response = await POST({ json } as unknown as Request);

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(parseCourseListing).not.toHaveBeenCalled();
  });

  it("allows an authenticated NYU user to parse a preview", async () => {
    const { POST, auth, parseCourseListing } = await loadParseCourseRoute();
    auth.mockResolvedValue({
      expires: "2099-01-01T00:00:00.000Z",
      user: { id: "user-1", email: "student@nyu.edu", role: "student" },
    });
    const course = { id: "TEST-SHU 101", title: "Test Course" };
    parseCourseListing.mockResolvedValue(course);
    const json = vi.fn().mockResolvedValue({ text: "course listing" });

    const response = await POST({ json } as unknown as Request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ course });
    expect(parseCourseListing).toHaveBeenCalledWith("course listing");
  });
});

describe("admin course deletion", () => {
  it("maps referenced courses to a safe conflict response", async () => {
    vi.resetModules();
    class CourseReferencedError extends Error {
      constructor(readonly references: string[]) {
        super("internal course reference detail");
      }
    }
    vi.doMock("@/db", () => ({ db: {} }));
    vi.doMock("@/lib/adminAuth", () => ({
      requireAdmin: vi.fn().mockResolvedValue({ ok: true }),
    }));
    vi.doMock("@/lib/repository", () => ({
      CourseReferencedError,
      deleteCourse: vi
        .fn()
        .mockRejectedValue(new CourseReferencedError(["plan", "rule"])),
      upsertCourses: vi.fn(),
    }));
    vi.doMock("@/lib/courseParser", () => ({
      CourseParseError: class CourseParseError extends Error {},
      parseCourseListing: vi.fn(),
      splitListings: vi.fn(),
    }));
    const { DELETE } = await import("@/app/api/admin/courses/route");

    const response = await DELETE(
      new Request("http://localhost/api/admin/courses?id=TEST-SHU%20101", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "course referenced",
      references: ["plan", "rule"],
    });
  });
});
