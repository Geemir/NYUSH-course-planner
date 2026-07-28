# Guide Motion and Core IPC Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible JavaScript-driven Guide step transitions and a dry-run-first, compare-and-swap operator command that repairs only the five stale Core IPC requirement trees in the active Neon release.

**Architecture:** Guide motion is isolated in a dependency-free Web Animations API helper invoked after React commits each step. IPC repair is split into pure catalog transformation/verification logic and a narrow database CLI that guards one JSONB row by active release, snapshot, program ID, and its previously read value.

**Tech Stack:** Next.js 16.2.9, React 19.2.4, TypeScript 5, Base UI, Tailwind CSS 4, Vitest 4, Drizzle ORM 0.45, PostgreSQL/Neon.

## Global Constraints

- Keep the interface English and preserve the NYU color system and existing Guide copy.
- Add no animation dependency; use the browser Web Animations API.
- Guide motion lasts 240 ms with `cubic-bezier(0.22, 1, 0.36, 1)` and animates only transform and opacity.
- `prefers-reduced-motion: reduce` must skip directional Guide motion.
- The repair command is dry-run by default and writes only with `--apply` plus an exact expected release ID.
- Preserve Core provenance and every non-target field.
- Never modify New York catalog data, courses, release membership, users, plans, or unrelated programs.
- Do not write Neon or deploy Vercel without separate production authorization.

---

### Task 1: Accessible Guide step motion

**Files:**
- Create: `src/lib/guideMotion.ts`
- Create: `src/lib/guideMotion.test.ts`
- Modify: `src/components/onboarding/OnboardingDialog.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.test.tsx`

**Interfaces:**
- Produces: `GuideMotionDirection = "enter" | "forward" | "backward"`.
- Produces: `animateGuideStep(element: HTMLElement, direction: GuideMotionDirection, reduceMotion: boolean): Animation | null`.
- Consumes: `window.matchMedia("(prefers-reduced-motion: reduce)")` in `OnboardingDialog`.

- [ ] **Step 1: Add failing unit tests for direction, timing, unsupported browsers, and reduced motion**

```ts
// src/lib/guideMotion.test.ts
import { describe, expect, it, vi } from "vitest";
import { animateGuideStep } from "@/lib/guideMotion";

describe("animateGuideStep", () => {
  it("moves forward content in from the right", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    const element = { animate } as unknown as HTMLElement;
    animateGuideStep(element, "forward", false);
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0, transform: "translate3d(12px, 0, 0)" }, { opacity: 1, transform: "translate3d(0, 0, 0)" }],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
    );
  });

  it("reverses the spatial direction for Back", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    animateGuideStep({ animate } as unknown as HTMLElement, "backward", false);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0, transform: "translate3d(-12px, 0, 0)" },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ]);
  });

  it("skips Web Animations for reduced motion", () => {
    const animate = vi.fn();
    expect(animateGuideStep({ animate } as unknown as HTMLElement, "enter", true)).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `npm test -- src/lib/guideMotion.test.ts`

Expected: FAIL because `@/lib/guideMotion` does not exist.

- [ ] **Step 3: Implement the minimal Web Animations helper**

```ts
// src/lib/guideMotion.ts
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
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `npm test -- src/lib/guideMotion.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing component assertions for forward, backward, and reduced-motion behavior**

Extend `OnboardingDialog.test.tsx` with an `HTMLElement.prototype.animate` spy and a `window.matchMedia` stub. Open the Guide, clear the entrance call, click Next, and assert the first keyframe uses `translate3d(12px, 0, 0)`; click Back and assert `translate3d(-12px, 0, 0)`. In a separate test return `{ matches: true }` from `matchMedia` and assert no animation call occurs.

- [ ] **Step 6: Run the component tests and verify RED**

Run: `npm test -- src/components/onboarding/OnboardingDialog.test.tsx`

Expected: FAIL because step changes do not call `HTMLElement.animate`.

- [ ] **Step 7: Connect motion to committed Guide state**

Modify `OnboardingDialog.tsx` to import `useEffect`, `useRef`, `animateGuideStep`, and `GuideMotionDirection`. Add a content ref and direction ref, animate after `open` or `stepIndex` changes, and set direction immediately before each step update:

```tsx
const contentRef = useRef<HTMLDivElement>(null);
const directionRef = useRef<GuideMotionDirection>("enter");

useEffect(() => {
  if (!open || !contentRef.current) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animation = animateGuideStep(contentRef.current, directionRef.current, reduceMotion);
  return () => animation?.cancel();
}, [open, stepIndex]);

const moveToStep = (direction: "forward" | "backward") => {
  directionRef.current = direction;
  setStepIndex((current) => current + (direction === "forward" ? 1 : -1));
};
```

Attach `contentRef` to the icon/title/description/detail wrapper. Use `moveToStep("forward")` and `moveToStep("backward")` from the buttons. Reset `directionRef.current = "enter"` whenever the dialog closes or completes.

- [ ] **Step 8: Run Guide regression tests and verify GREEN**

Run: `npm test -- src/lib/guideMotion.test.ts src/components/onboarding/OnboardingDialog.test.tsx src/components/PlannerApp.test.tsx`

Expected: PASS, including flow, Skip, Done, and focus restoration.

- [ ] **Step 9: Commit the Guide motion deliverable**

```powershell
git add -- src/lib/guideMotion.ts src/lib/guideMotion.test.ts src/components/onboarding/OnboardingDialog.tsx src/components/onboarding/OnboardingDialog.test.tsx
git commit -m "feat(onboarding): animate guide step transitions"
```

### Task 2: Pure Core IPC repair planning

**Files:**
- Create: `src/lib/catalog/coreIpcRepair.ts`
- Create: `src/lib/catalog/coreIpcRepair.test.ts`

**Interfaces:**
- Produces: `CoreIpcSummary = { id: string; kind: string; count: number | null; childCount: number }`.
- Produces: `planCoreIpcRepair(current: CatalogProgram, target: CatalogProgram): { candidate: CatalogProgram; changed: boolean; before: CoreIpcSummary[]; after: CoreIpcSummary[] }`.
- Produces: `assertCoreIpcTarget(program: CatalogProgram): CoreIpcSummary[]`.

- [ ] **Step 1: Add failing tests using the real checked-in Core definition**

Parse `fallback.programs.find(({ id }) => id === "core")` through `CatalogProgramSchema`. Build a stale copy by changing the five target requirement roots to `{ ...requirement, kind: "all" }` and removing `count`. Assert:

```ts
const repair = planCoreIpcRepair(stale, target);
expect(repair.changed).toBe(true);
expect(repair.after.map(({ kind, count, childCount }) => ({ kind, count, childCount }))).toEqual([
  { kind: "choose", count: 2, childCount: 62 },
  { kind: "choose", count: 1, childCount: 3 },
  { kind: "choose", count: 1, childCount: 22 },
  { kind: "choose", count: 1, childCount: 42 },
  { kind: "choose", count: 1, childCount: 11 },
]);
expect(repair.candidate.provenance).toEqual(stale.provenance);
```

Also assert an already-correct program is a no-op and that changing/removing a target child makes planning throw before producing a candidate.

- [ ] **Step 2: Run the repair tests and verify RED**

Run: `npm test -- src/lib/catalog/coreIpcRepair.test.ts`

Expected: FAIL because the repair module does not exist.

- [ ] **Step 3: Implement strict five-node planning**

Implement the exact target ID/count contract:

```ts
const TARGETS = [
  ["course-list-per-attribute", 2, 62],
  ["course-list-per-attribute-2", 1, 3],
  ["course-list-per-attribute-3", 1, 22],
  ["course-list-per-attribute-4", 1, 42],
  ["course-list-per-attribute-5", 1, 11],
] as const;
```

For each ID, require exactly one category in both programs, require equal serialized `children`, require the target root to be `choose` with the expected count and child count, and replace only `category.requirement`. Parse the result with `CatalogProgramSchema`, summarize it, and set `changed` from serialized equality between current and candidate.

- [ ] **Step 4: Run repair tests and verify GREEN**

Run: `npm test -- src/lib/catalog/coreIpcRepair.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure repair deliverable**

```powershell
git add -- src/lib/catalog/coreIpcRepair.ts src/lib/catalog/coreIpcRepair.test.ts
git commit -m "fix(catalog): plan guarded Core IPC repair"
```

### Task 3: Dry-run-first Neon operator command

**Files:**
- Create: `scripts/repair-core-ipc.ts`
- Create: `scripts/repair-core-ipc.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `planCoreIpcRepair` and `assertCoreIpcTarget` from Task 2.
- Consumes: `withDbRetry` from `scripts/lib/db-retry.ts` and `getActiveCatalogRelease` from `src/lib/catalogRepository.ts`.
- Produces: package command `catalog:repair-core-ipc`.
- CLI contract: dry-run by default; write requires `--apply --expected-release=<release-id>`.

- [ ] **Step 1: Add failing tests for argument safety and output planning**

Export and test a pure parser:

```ts
expect(parseRepairArgs([])).toEqual({ apply: false, expectedReleaseId: null });
expect(() => parseRepairArgs(["--apply"])).toThrow(/expected-release/);
expect(parseRepairArgs(["--apply", "--expected-release=release-123"])).toEqual({
  apply: true,
  expectedReleaseId: "release-123",
});
expect(() => parseRepairArgs(["--unknown"])).toThrow(/Unknown option/);
```

Keep database orchestration behind an exported `runCoreIpcRepair(options, dependencies)` function so tests can supply in-memory read, compare-and-swap, and readback functions. Assert dry-run never calls compare-and-swap; apply calls it once; a zero-row update succeeds only if readback is already correct; and release drift throws.

- [ ] **Step 2: Run CLI tests and verify RED**

Run: `npm test -- scripts/repair-core-ipc.test.ts`

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Implement the operator orchestration and guarded SQL adapter**

The real adapter must:

```ts
const [row] = await db
  .select({ data: schema.catalogProgram.data })
  .from(schema.catalogProgram)
  .where(and(
    eq(schema.catalogProgram.snapshotId, snapshotId),
    eq(schema.catalogProgram.programId, "core"),
  ))
  .limit(1);
```

For apply, update with a JSONB compare-and-swap predicate and return the affected program ID:

```ts
const updated = await db
  .update(schema.catalogProgram)
  .set({ data: candidate })
  .where(and(
    eq(schema.catalogProgram.snapshotId, snapshotId),
    eq(schema.catalogProgram.programId, "core"),
    sql`${schema.catalogProgram.data} = ${JSON.stringify(current)}::jsonb`,
  ))
  .returning({ programId: schema.catalogProgram.programId });
```

Read the active release before planning, immediately before the compare-and-swap, and after readback. All three IDs must match the requested expected release. Use bounded retry for reads. Do not retry a blind write; if the write result is ambiguous, reread and accept only the verified target.

Print release, snapshot, before/after summaries, and `DRY RUN: no database changes` or `APPLIED AND VERIFIED` without printing connection strings or full program JSON.

- [ ] **Step 4: Add the package command**

```json
"catalog:repair-core-ipc": "node --conditions=react-server --import tsx scripts/repair-core-ipc.ts"
```

- [ ] **Step 5: Run CLI and repair tests and verify GREEN**

Run: `npm test -- scripts/repair-core-ipc.test.ts src/lib/catalog/coreIpcRepair.test.ts`

Expected: PASS.

- [ ] **Step 6: Exercise the command against local PGlite in dry-run mode**

Run: `npm run catalog:repair-core-ipc`

Expected: a concise report ending in `DRY RUN: no database changes`; if local PGlite has no active release, seed only the disposable local database and rerun.

- [ ] **Step 7: Commit the operator command**

```powershell
git add -- scripts/repair-core-ipc.ts scripts/repair-core-ipc.test.ts package.json
git commit -m "fix(catalog): add dry-run Core IPC repair command"
```

### Task 4: Verification and production handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-29-guide-motion-core-ipc-repair.md` (check completed steps)
- Modify: `.planning/2026-07-18-v0-2-implementation/findings.md`
- Modify: `.planning/2026-07-18-v0-2-implementation/progress.md`

**Interfaces:**
- Consumes: all Task 1-3 deliverables.
- Produces: local verification evidence and an exact, separately authorized Neon command.

- [ ] **Step 1: Run focused and full automated verification**

Run:

```powershell
npm test -- src/lib/guideMotion.test.ts src/components/onboarding/OnboardingDialog.test.tsx src/components/PlannerApp.test.tsx src/lib/catalog/coreIpcRepair.test.ts scripts/repair-core-ipc.test.ts
npm test
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: all commands exit 0 with no new warnings attributable to this change.

- [ ] **Step 2: Run a production build**

Run: `npm run build`

Expected: Next.js production compilation completes successfully.

- [ ] **Step 3: Browser-check the Guide locally**

Run the local app, open Guide, verify first entrance, Next direction, Back direction, rapid clicks, mobile layout, focus restoration, and reduced-motion emulation. Confirm the content is visible before and after every animation and controls remain operable.

- [ ] **Step 4: Prepare the Neon dry-run command without executing a write**

Once an operator supplies `DATABASE_URL` securely:

```powershell
$env:DATABASE_URL = '<Neon pooled connection string>'
npm run catalog:repair-core-ipc
```

Expected: release `release-f3d978de7589dbaf31f28153`, snapshot `recovery-fallback`, before `all/all/all/all/all`, after `choose 2/1/1/1/1`, and a dry-run confirmation.

- [ ] **Step 5: Stop at the production authorization gate**

The separately authorized write command will be:

```powershell
npm run catalog:repair-core-ipc -- --apply --expected-release=release-f3d978de7589dbaf31f28153
```

Do not run it until the user explicitly authorizes the Neon mutation after reviewing dry-run output. Do not deploy the Guide until the user separately authorizes Vercel deployment.

- [ ] **Step 6: Record evidence and commit documentation**

Update the planning findings/progress with the verified production root cause, local test/build results, and pending production gates. Stage only this task's documentation changes and commit:

```powershell
git add -- docs/superpowers/plans/2026-07-29-guide-motion-core-ipc-repair.md .planning/2026-07-18-v0-2-implementation/findings.md .planning/2026-07-18-v0-2-implementation/progress.md
git commit -m "docs: record Guide and IPC repair verification"
```
