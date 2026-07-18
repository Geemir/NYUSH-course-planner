// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlanSync } from "@/hooks/usePlanSync";
import type { PlanSnapshotV2 } from "@/lib/types";

const plan = (year: number): PlanSnapshotV2 => ({
  version: 2, catalogReleaseId: "release", placements: [], studyAway: {}, completedSemesters: [],
  programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
  unresolvedProgramIds: [], customCourses: [], fulfillmentFacts: [], dismissedWarnings: [], startYear: year,
});
const saved = (snapshot: PlanSnapshotV2, revision: number) => Response.json({
  status: "saved",
  plan: { snapshot, revision, updatedAt: "2026-07-18T00:00:00.000Z" },
});

describe("usePlanSync", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces saves and acknowledges the next revision", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => saved(plan(2026), 1));
    const { result } = renderHook(() => usePlanSync({ snapshot: plan(2026), authenticated: true, enabled: true, fetcher: fetcher as typeof fetch }));
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(fetcher).toHaveBeenCalledOnce();
    vi.useRealTimers();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "saved", revision: 1 }));
  });

  it("aborts an older write and saves only the latest snapshot", async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (!firstSignal) {
        firstSignal = init?.signal as AbortSignal;
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(saved(plan(2027), 1));
    });
    const { result, rerender } = renderHook(({ snapshot }) => usePlanSync({ snapshot, authenticated: true, enabled: true, fetcher: fetcher as typeof fetch }), { initialProps: { snapshot: plan(2026) } });
    await act(async () => vi.advanceTimersByTimeAsync(800));
    rerender({ snapshot: plan(2027) });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    vi.useRealTimers();
    await waitFor(() => expect(result.current.state.status).toBe("saved"));
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).snapshot.startYear).toBe(2027);
  });

  it("surfaces conflict without discarding either snapshot", async () => {
    vi.useFakeTimers();
    const server = { snapshot: plan(2025), revision: 2, updatedAt: "2026-07-18T00:00:00.000Z" };
    const fetcher = vi.fn(async () => Response.json({ error: "revision_conflict", server }, { status: 409 }));
    const { result, rerender } = renderHook(({ snapshot }) => usePlanSync({ snapshot, authenticated: true, enabled: true, initialRevision: 1, fetcher: fetcher as typeof fetch }), { initialProps: { snapshot: plan(2025) } });
    rerender({ snapshot: plan(2026) });
    await act(async () => vi.advanceTimersByTimeAsync(800));
    vi.useRealTimers();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "conflict", local: { startYear: 2026 }, server: { revision: 2 } }));
  });

  it("marks network failures offline and retries on the online event", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(saved(plan(2026), 1));
    const { result } = renderHook(() => usePlanSync({ snapshot: plan(2026), authenticated: true, enabled: true, fetcher: fetcher as typeof fetch }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    vi.useRealTimers();
    await waitFor(() => expect(result.current.state.status).toBe("offline"));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.state.status).toBe("saved"));
  });

  it("never saves while signed out or migration needs resolution", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    const { result, rerender } = renderHook(({ authenticated, enabled }) => usePlanSync({ snapshot: plan(2026), authenticated, enabled, fetcher: fetcher as typeof fetch }), { initialProps: { authenticated: false, enabled: true } });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.state.status).toBe("local-only");
    rerender({ authenticated: true, enabled: false });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not echo an acknowledged server snapshot on mount", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    const { result } = renderHook(() => usePlanSync({
      snapshot: plan(2026), authenticated: true, enabled: true,
      initialRevision: 4, initialSavedAt: "2026-07-18T00:00:00.000Z",
      fetcher: fetcher as typeof fetch,
    }));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ status: "saved", revision: 4 });
  });

  it("keeps a failed server write pending for explicit retry", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Response.json({ error: "failed" }, { status: 500 }));
    const { result } = renderHook(() => usePlanSync({
      snapshot: plan(2026), authenticated: true, enabled: true,
      fetcher: fetcher as typeof fetch,
    }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    vi.useRealTimers();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "error", pending: true }));
  });
});
