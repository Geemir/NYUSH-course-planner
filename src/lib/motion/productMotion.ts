import { waapi } from "animejs/waapi";

export type MotionHandle = { cancel: () => void; finished: Promise<unknown> };

const completeMotion = (): MotionHandle => ({
  cancel: () => undefined,
  finished: Promise.resolve(),
});

type MotionElement = HTMLElement | SVGElement;

function animate(element: MotionElement, reduced: boolean, params: Parameters<typeof waapi.animate>[1]): MotionHandle {
  if (reduced) return completeMotion();
  const animation = waapi.animate(element, params);
  return { cancel: () => animation.revert(), finished: Promise.resolve(animation) };
}

export function startQuoteAmbient(element: MotionElement, reduced: boolean) {
  if (reduced) return null;
  return animate(element, false, { y: [0, -2, 0], opacity: [1, 0.96, 1], duration: 7500, ease: "inOutSine", loop: true });
}

export const animateQuoteExit = (element: MotionElement, reduced: boolean) =>
  animate(element, reduced, { opacity: [1, 0], y: [0, -4], duration: 140, ease: "inQuad" });
export const animateQuoteEnter = (element: MotionElement, reduced: boolean) =>
  animate(element, reduced, { opacity: [0, 1], y: [6, 0], duration: 260, ease: "outQuint" });
export const animateRefreshIcon = (element: MotionElement, reduced: boolean) =>
  animate(element, reduced, { rotate: [0, 180], duration: 220, ease: "outQuad" });
export const animateAnnouncementEnter = (element: MotionElement, reduced: boolean) =>
  animate(element, reduced, { opacity: [0, 1], y: [-6, 0], duration: 220, ease: "outQuint" });
export const animateAnnouncementExit = (element: MotionElement, reduced: boolean) =>
  animate(element, reduced, { opacity: [1, 0], y: [0, -4], duration: 160, ease: "inQuad" });
