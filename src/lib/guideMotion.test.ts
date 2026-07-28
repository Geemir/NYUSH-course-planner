import { describe, expect, it, vi } from "vitest";
import { animateGuideStep } from "@/lib/guideMotion";

describe("animateGuideStep", () => {
  it("moves forward content in from the right", () => {
    const animate = vi.fn(
      (
        _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        _options?: number | KeyframeAnimationOptions,
      ) => ({ cancel: vi.fn() }) as unknown as Animation,
    );
    const element = { animate } as unknown as HTMLElement;

    animateGuideStep(element, "forward", false);

    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "translate3d(12px, 0, 0)" },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
  });

  it("reverses the spatial direction for Back", () => {
    const animate = vi.fn(
      (
        _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        _options?: number | KeyframeAnimationOptions,
      ) => ({ cancel: vi.fn() }) as unknown as Animation,
    );

    animateGuideStep(
      { animate } as unknown as HTMLElement,
      "backward",
      false,
    );

    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0, transform: "translate3d(-12px, 0, 0)" },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ]);
  });

  it("uses a restrained vertical entrance for the first step", () => {
    const animate = vi.fn(
      (
        _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        _options?: number | KeyframeAnimationOptions,
      ) => ({ cancel: vi.fn() }) as unknown as Animation,
    );

    animateGuideStep({ animate } as unknown as HTMLElement, "enter", false);

    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0, transform: "translate3d(0, 8px, 0)" },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ]);
  });

  it("skips Web Animations for reduced motion", () => {
    const animate = vi.fn();

    expect(
      animateGuideStep(
        { animate } as unknown as HTMLElement,
        "enter",
        true,
      ),
    ).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it("keeps content usable when Web Animations are unavailable", () => {
    expect(
      animateGuideStep({} as unknown as HTMLElement, "forward", false),
    ).toBeNull();
  });
});
