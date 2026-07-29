export const PROGRESS_GUIDE_VERSION = 1;
export const PROGRESS_GUIDE_KEY = "nyush-progress-guide";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

export function shouldOpenProgressGuide(storage: ReadStorage): boolean {
  try {
    const value = storage.getItem(PROGRESS_GUIDE_KEY);
    if (!value) return true;
    const parsed = JSON.parse(value) as { version?: number };
    return parsed.version !== PROGRESS_GUIDE_VERSION;
  } catch {
    return true;
  }
}

export function completeProgressGuide(storage: WriteStorage): void {
  storage.setItem(PROGRESS_GUIDE_KEY, JSON.stringify({
    version: PROGRESS_GUIDE_VERSION,
    completedAt: new Date().toISOString(),
  }));
}
