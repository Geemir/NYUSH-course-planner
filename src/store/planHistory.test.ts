import { describe, expect, it } from "vitest";
import {
  PLAN_HISTORY_LIMIT,
  createHistory,
  recordHistory,
  redoHistory,
  undoHistory,
} from "@/store/planHistory";

describe("planHistory", () => {
  it("pushes immutable labeled snapshots and supports undo/redo", () => {
    const initial = { value: 1 };
    const pushed = recordHistory(createHistory(initial), "Change value", { value: 2 });
    initial.value = 99;
    const undone = undoHistory(pushed);
    expect(undone.present).toEqual({ value: 1 });
    expect(undone.future[0].label).toBe("Change value");
    expect(redoHistory(undone).present).toEqual({ value: 2 });
  });

  it("suppresses no-ops and clears redo after a new mutation", () => {
    const initial = createHistory({ value: 1 });
    expect(recordHistory(initial, "No-op", { value: 1 })).toBe(initial);
    const undone = undoHistory(recordHistory(initial, "Two", { value: 2 }));
    const changed = recordHistory(undone, "Three", { value: 3 });
    expect(changed.future).toEqual([]);
  });

  it("caps past snapshots at 30", () => {
    let history = createHistory({ value: 0 });
    for (let value = 1; value <= 35; value += 1) {
      history = recordHistory(history, `Value ${value}`, { value });
    }
    expect(history.past).toHaveLength(PLAN_HISTORY_LIMIT);
    expect(history.past[0].snapshot).toEqual({ value: 5 });
  });
});
