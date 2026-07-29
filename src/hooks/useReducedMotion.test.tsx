// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "@/hooks/useReducedMotion";

describe("useReducedMotion", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the initial preference and reacts to live changes", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const query = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn((_name, next) => { listener = next as (event: MediaQueryListEvent) => void; }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(query);

    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    act(() => listener?.({ matches: false } as MediaQueryListEvent));
    expect(result.current).toBe(false);
    unmount();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
