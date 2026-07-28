export type GuideMotionDirection = "enter" | "forward" | "backward";

const offsets: Record<GuideMotionDirection, string> = {
  enter: "translate3d(0, 8px, 0)",
  forward: "translate3d(12px, 0, 0)",
  backward: "translate3d(-12px, 0, 0)",
};

export function animateGuideStep(
  element: HTMLElement,
  direction: GuideMotionDirection,
  reduceMotion: boolean,
): Animation | null {
  if (reduceMotion || typeof element.animate !== "function") return null;

  return element.animate(
    [
      { opacity: 0, transform: offsets[direction] },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ],
    {
      duration: 240,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );
}
