import { beforeEach, describe, expect, it, vi } from "vitest";

const animate = vi.hoisted(() => vi.fn());
vi.mock("animejs/waapi", () => ({ waapi: { animate } }));

import {
  animateAnnouncementEnter,
  animateAnnouncementExit,
  animateQuoteEnter,
  animateQuoteExit,
  animateRefreshIcon,
  startQuoteAmbient,
} from "@/lib/motion/productMotion";

describe("product motion", () => {
  beforeEach(() => {
    animate.mockReset();
    animate.mockReturnValue({ cancel: vi.fn(), then: (resolve: (value: unknown) => void) => Promise.resolve(resolve(null)) });
  });

  it("uses the approved subtle ambient loop and skips it for reduced motion", () => {
    const element = {} as HTMLElement;
    expect(startQuoteAmbient(element, true)).toBeNull();
    startQuoteAmbient(element, false);
    expect(animate).toHaveBeenCalledWith(element, expect.objectContaining({
      y: [0, -2, 0], opacity: [1, 0.96, 1], duration: 7500, loop: true,
    }));
  });

  it("uses bounded quote and announcement transition durations", () => {
    const element = {} as HTMLElement;
    animateQuoteExit(element, false);
    animateQuoteEnter(element, false);
    animateRefreshIcon(element, false);
    animateAnnouncementEnter(element, false);
    animateAnnouncementExit(element, false);

    expect(animate.mock.calls.map(([, options]) => options.duration)).toEqual([140, 260, 220, 220, 160]);
    expect(animate.mock.calls[1][1]).toMatchObject({ ease: "outQuint", opacity: [0, 1], y: [6, 0] });
  });

  it("returns already-complete no-op motion for reduced transitions", async () => {
    const motion = animateQuoteExit({} as HTMLElement, true);
    expect(animate).not.toHaveBeenCalled();
    await expect(motion.finished).resolves.toBeUndefined();
    expect(() => motion.cancel()).not.toThrow();
  });
});
