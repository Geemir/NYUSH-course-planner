export const PLAN_HISTORY_LIMIT = 30;

export interface PlanHistory<T> {
  past: Array<{ label: string; snapshot: T }>;
  present: T;
  future: Array<{ label: string; snapshot: T }>;
}

function equal<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createHistory<T>(present: T): PlanHistory<T> {
  return { past: [], present: structuredClone(present), future: [] };
}

export function recordHistory<T>(
  history: PlanHistory<T>,
  label: string,
  next: T,
): PlanHistory<T> {
  if (equal(history.present, next)) return history;
  return {
    past: [
      ...history.past,
      { label, snapshot: structuredClone(history.present) },
    ].slice(-PLAN_HISTORY_LIMIT),
    present: structuredClone(next),
    future: [],
  };
}

export function undoHistory<T>(history: PlanHistory<T>): PlanHistory<T> {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: structuredClone(previous.snapshot),
    future: [
      { label: previous.label, snapshot: structuredClone(history.present) },
      ...history.future,
    ],
  };
}

export function redoHistory<T>(history: PlanHistory<T>): PlanHistory<T> {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [
      ...history.past,
      { label: next.label, snapshot: structuredClone(history.present) },
    ].slice(-PLAN_HISTORY_LIMIT),
    present: structuredClone(next.snapshot),
    future: history.future.slice(1),
  };
}
