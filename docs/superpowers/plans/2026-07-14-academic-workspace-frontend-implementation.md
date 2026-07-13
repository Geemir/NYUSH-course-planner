# Academic Workspace Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the planner as an English-only Academic Workspace with one-column semesters, larger proportions, responsive supporting tools, first-visit onboarding, a visible Guide, an original academic background asset, and rotating inspirational aphorisms.

**Architecture:** `PlannerApp` remains the interactive client composition root, but catalog and derived-plan state move into focused providers. Wide screens use sticky catalog/progress rails around a single chronological timeline; narrower screens move supporting tools into accessible sheets. Small pure helpers own onboarding persistence, quote selection, dynamic degree options, and responsive state so behavior is testable before component implementation.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, Base UI/shadcn, dnd-kit, TanStack Virtual, Zustand, Vitest 4, React Testing Library/jsdom, Next Image.

## Global Constraints

- The approved backend plan and active `CatalogResponse` contract are prerequisites.
- Read relevant bundled Next.js guides before changing Next components.
- Keep all product copy in English.
- Eight semesters must render in one chronological column at every breakpoint.
- Preserve drag/drop and provide complete menu/keyboard alternatives.
- Keep `Guide` directly visible in the header.
- Use NYU violet for actions/selection, not as decorative surface fill.
- Meet WCAG AA contrast, 44px primary targets, focus visibility, and reduced-motion behavior.
- Use a project-owned generated raster asset via static `next/image` import.
- Follow red-green-refactor for every behavior change.
- Preserve unrelated worktree changes and stage only task-owned files.

---

## File Structure

### New behavior/design modules

- `src/components/planner/PlanDerivedProvider.tsx` — one shared derivation per state change.
- `src/lib/derivePlan.ts` — pure derivation function.
- `src/components/onboarding/OnboardingDialog.tsx` — four-step Guide dialog.
- `src/hooks/useOnboarding.ts` — versioned first-visit persistence.
- `src/lib/onboarding.ts` — pure storage contract.
- `src/components/inspiration/InspirationStrip.tsx` — asset and quote presentation.
- `src/lib/inspirationQuotes.ts` — original quotes and session-stable selection.
- `src/components/layout/PlannerHeader.tsx` — product header and visible Guide.
- `src/components/layout/PlannerWorkspace.tsx` — responsive rail/timeline composition.
- `src/components/layout/WorkspaceTools.tsx` — mobile/tablet course/progress sheets.
- `src/components/ui/sheet.tsx` — Base UI dialog sheet variant.
- `src/assets/academic-workspace.webp` — generated local background asset.

### Existing components changed

- `src/components/PlannerApp.tsx` — orchestration only.
- `src/components/CatalogProvider.tsx` — dynamic programs/snapshot.
- `src/hooks/useCourseData.ts` — program-aware catalog data.
- `src/hooks/usePlanDerived.ts` — context selector rather than repeated computation.
- `src/components/planner/PlannerBoard.tsx` — chronological single column.
- `src/components/planner/SemesterColumn.tsx` — wide semester surface.
- `src/components/planner/CourseChip.tsx` — larger course row and selected credits.
- `src/components/catalog/CourseCatalog.tsx` — dynamic filters and virtual list.
- `src/components/progress/*` — dynamic programs/manual facts/guidance wording.
- `src/components/dialogs/AddCourseDialog.tsx` — custom-course wording, no Albert-first framing.
- `src/app/globals.css`, `src/app/layout.tsx` — design tokens, metadata, motion.

---

### Task 1: Add Client Component test harness and virtualization dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/render.tsx`
- Create: `src/components/ui/button.test.tsx`

**Interfaces:**
- Produces: jsdom-capable `.test.tsx` support while preserving node tests.

- [ ] **Step 1: Install frontend test and virtual-list packages**

Run:

```powershell
npm.cmd install @tanstack/react-virtual
npm.cmd install -D @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event
```

Expected: dependencies install and lockfile updates.

- [ ] **Step 2: Write a failing JSX test before changing Vitest**

Create `src/components/ui/button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Button } from "@/components/ui/button";

it("renders an accessible button name", () => {
  render(<Button>Guide</Button>);
  expect(screen.getByRole("button", { name: "Guide" })).toBeDefined();
});
```

- [ ] **Step 3: Run RED**

Run: `npm.cmd test -- src/components/ui/button.test.tsx`

Expected: FAIL because `.test.tsx` is excluded and React transform/setup is missing.

- [ ] **Step 4: Configure dual node/jsdom testing**

Update `vitest.config.ts`:

```ts
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

`setup.ts` imports `@testing-library/dom` cleanup support and defines `window.matchMedia` only when `window` exists. `render.tsx` exports provider wrappers needed by component tests without importing database/server modules.

- [ ] **Step 5: Run GREEN and node regression**

Run:

```powershell
npm.cmd test -- src/components/ui/button.test.tsx
npm.cmd test -- src/lib/engines.test.ts
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts src/test src/components/ui/button.test.tsx
git commit -m "test: add client component harness"
```

---

### Task 2: Make catalog programs and degree choices dynamic

**Files:**
- Modify: `src/components/CatalogProvider.tsx`
- Modify: `src/hooks/useCourseData.ts`
- Modify: `src/lib/degreePlans.ts`
- Create: `src/lib/degreePlans.test.ts`
- Modify: `src/store/plannerStore.ts`

**Interfaces:**
- Consumes: backend `CatalogResponseSchema`.
- Produces: catalog context `{ snapshot, courses, programs, programsById, rules, loaded }` and `degreeOptionsFromPrograms(programs)`.

- [ ] **Step 1: Write failing dynamic degree-option tests**

```ts
it("creates one option for every imported major", () => {
  const options = degreeOptionsFromPrograms([CORE, CS, HUMANITIES]);
  expect(options).toEqual([
    { id: "cs", label: "Computer Science (BS)", programs: ["core", "cs"] },
    { id: "humanities", label: "Humanities (BA)", programs: ["core", "humanities"] },
  ]);
});
```

Also test that an active double-major set returns the `custom` label without losing either program.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/degreePlans.test.ts`

Expected: FAIL because options are hard-coded.

- [ ] **Step 3: Implement dynamic catalog context and choices**

Validate the whole API response before replacing fallback data. Build `programsById` with `useMemo`. Derive single-major options from programs where `type === "major"`, always prepending Core when available. Keep the Programs menu for additional majors/minors.

- [ ] **Step 4: Sanitize active programs after catalog replacement**

Add a store action `reconcilePrograms(validIds, defaultIds)` that removes unknown IDs and chooses Core plus the first major only when no valid active major remains. It must not overwrite a valid custom/double-major selection.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
npm.cmd test -- src/lib/degreePlans.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/CatalogProvider.tsx src/hooks/useCourseData.ts src/lib/degreePlans.ts src/lib/degreePlans.test.ts src/store/plannerStore.ts
git commit -m "feat: support every imported major"
```

---

### Task 3: Compute plan-derived state once and feasibility lazily

**Files:**
- Create: `src/lib/derivePlan.ts`
- Create: `src/lib/derivePlan.test.ts`
- Create: `src/components/planner/PlanDerivedProvider.tsx`
- Modify: `src/hooks/usePlanDerived.ts`
- Modify: `src/components/PlannerApp.tsx`
- Modify: `src/components/progress/FeasibilityDialog.tsx`

**Interfaces:**
- Produces: `derivePlan(input): PlanDerivedValue`, `usePlanDerived()`, `useFeasibility()`.

- [ ] **Step 1: Write a failing call-count/behavior test**

Test the pure function for dynamic programs, selected credits, warnings, and no feasibility result by default. Test `deriveFeasibility(input, derived)` separately.

```ts
const derived = derivePlan(FIXTURE_INPUT);
expect(derived.creditsBySemester.get("Y1F")).toBe(16);
expect("feasibility" in derived).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/derivePlan.test.ts`

Expected: FAIL because pure derivation module is absent.

- [ ] **Step 3: Extract pure derivation and provider**

Move the current allocation/progress/warning/lookups into `derivePlan`. `PlanDerivedProvider` reads store/catalog once, memoizes once, and supplies context. `usePlanDerived` becomes a context guard:

```ts
export function usePlanDerived(): PlanDerivedValue {
  const value = useContext(PlanDerivedContext);
  if (!value) throw new Error("usePlanDerived requires PlanDerivedProvider");
  return value;
}
```

- [ ] **Step 4: Make feasibility on-demand**

`FeasibilityDialog` calls `useFeasibility()` only while open; the hook memoizes `analyzeFeasibility` from shared base data. Update copy to “Heuristic planning guidance” and explain that an unsuccessful search is not proof of impossibility.

- [ ] **Step 5: Run GREEN and regression**

Run:

```powershell
npm.cmd test -- src/lib/derivePlan.test.ts src/lib/feasibility.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/derivePlan.ts src/lib/derivePlan.test.ts src/components/planner/PlanDerivedProvider.tsx src/hooks/usePlanDerived.ts src/components/PlannerApp.tsx src/components/progress/FeasibilityDialog.tsx
git commit -m "perf: share planner derivations"
```

---

### Task 4: Add versioned first-visit onboarding and reusable Guide

**Files:**
- Create: `src/lib/onboarding.ts`
- Create: `src/lib/onboarding.test.ts`
- Create: `src/hooks/useOnboarding.ts`
- Create: `src/components/onboarding/OnboardingDialog.tsx`
- Create: `src/components/onboarding/OnboardingDialog.test.tsx`

**Interfaces:**
- Produces: `ONBOARDING_KEY`, `readOnboardingState`, `completeOnboarding`, `useOnboarding`, controlled `OnboardingDialog`.

- [ ] **Step 1: Write failing persistence tests**

```ts
expect(readOnboardingState(storage)).toEqual({ shouldOpen: true });
completeOnboarding(storage);
expect(readOnboardingState(storage)).toEqual({ shouldOpen: false });
```

Use the exact key `nyush-planner:onboarding:v1`. Invalid storage values behave like first visit.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/onboarding.test.ts`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement storage contract and hook**

The hook does not read `localStorage` during server render. It exposes `{ open, setOpen, complete, restart }`; first-visit opening happens after mount.

- [ ] **Step 4: Write failing dialog interaction tests**

Render the controlled dialog in jsdom and verify the four approved titles in order, Back/Next behavior, Skip completion, Done completion, and focus restoration to the Guide trigger.

- [ ] **Step 5: Run RED, implement dialog, run GREEN**

Run: `npm.cmd test -- src/components/onboarding/OnboardingDialog.test.tsx`

Expected before implementation: FAIL. Implement with existing Base UI Dialog, visible progress text `Step 1 of 4`, 44px buttons, and approved English copy. Re-run and expect PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/onboarding.ts src/lib/onboarding.test.ts src/hooks/useOnboarding.ts src/components/onboarding
git commit -m "feat: add first-visit planner guide"
```

---

### Task 5: Add original session-stable aphorisms and academic asset

**Files:**
- Create: `src/lib/inspirationQuotes.ts`
- Create: `src/lib/inspirationQuotes.test.ts`
- Create: `src/components/inspiration/InspirationStrip.tsx`
- Create: `src/components/inspiration/InspirationStrip.test.tsx`
- Create: `src/assets/academic-workspace.webp`

**Interfaces:**
- Produces: `selectSessionQuote(storage, random)`, `nextQuote(currentId)`, `InspirationStrip`.

- [ ] **Step 1: Write failing quote-selection tests**

```ts
it("reuses the quote selected for the current session", () => {
  const first = selectSessionQuote(storage, () => 0.4);
  const second = selectSessionQuote(storage, () => 0.9);
  expect(second).toEqual(first);
});
```

Test invalid stored IDs and deterministic next-quote cycling.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/inspirationQuotes.test.ts`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement original quote set**

Store 10–14 original, unattributed English aphorisms, including:

```ts
export const INSPIRATION_QUOTES = [
  { id: "questions", text: "Make room in your plan for the questions you cannot stop asking." },
  { id: "curiosity", text: "Choose the courses that keep your curiosity awake." },
  { id: "crossroads", text: "The most interesting path may begin where two disciplines meet." },
] as const;
```

Persist only the selected ID in `sessionStorage` after hydration.

- [ ] **Step 4: Generate the project-owned raster asset**

Use the image-generation skill with this production prompt:

```text
Use case: photorealistic-natural
Asset type: wide background image for an academic course-planning workspace
Primary request: an original contemporary university architecture scene that suggests intellectual possibility and global study
Scene/backdrop: modern colonnades and layered campus geometry with a subtle Shanghai urban atmosphere in the distance
Style/medium: refined editorial architectural photography, realistic materials, no illustration
Composition/framing: wide landscape composition, strong usable negative space through the center-left for short interface copy, architectural detail concentrated toward the edges
Lighting/mood: early morning natural light, calm, optimistic, intellectually energizing
Color palette: neutral stone, soft sky, restrained hints compatible with NYU violet overlays
Constraints: no logos, no university trademarks, no readable signage, no text, no watermark, no identifiable people
Avoid: purple-drenched scene, glassmorphism, fantasy campus, oversaturated sunset, stock-photo students
```

Inspect the output, select one asset, copy it to `src/assets/academic-workspace.webp`, and validate its dimensions/file size. The image-generation turn must end immediately after generation per the skill; resume integration in the next turn.

- [ ] **Step 5: Implement and test InspirationStrip**

Use a static import with `next/image`, `fill`, `sizes="100vw"`, decorative `alt=""`, and real HTML quote text. Add a labeled refresh button. Test quote visibility and refresh behavior.

- [ ] **Step 6: Run GREEN**

Run:

```powershell
npm.cmd test -- src/lib/inspirationQuotes.test.ts src/components/inspiration/InspirationStrip.test.tsx
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/inspirationQuotes.ts src/lib/inspirationQuotes.test.ts src/components/inspiration src/assets/academic-workspace.webp
git commit -m "feat: add academic inspiration strip"
```

---

### Task 6: Rebuild the header with visible Guide and focused plan actions

**Files:**
- Create: `src/components/layout/PlannerHeader.tsx`
- Create: `src/components/layout/PlannerHeader.test.tsx`
- Modify: `src/components/PlannerApp.tsx`

**Interfaces:**
- Consumes: dynamic programs, `onGuide`, `onImportFile`.
- Produces: 68px sticky product header.

- [ ] **Step 1: Write failing header tests**

Test visible `Guide`, degree selector options for imported majors, entry year, credit summary, Plan actions menu containing Import/Export/Reset, theme, and account affordance. Assert Guide is not inside the menu.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/components/layout/PlannerHeader.test.tsx`

Expected: FAIL because header component is absent.

- [ ] **Step 3: Extract and implement header**

Use semantic `<header>`/`<nav>`, dynamic degree options, a directly visible outline/ghost Guide button, and one `Plan actions` dropdown. Keep reset confirmation and import input behavior. Preserve admin/account controls.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- src/components/layout/PlannerHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/layout/PlannerHeader.tsx src/components/layout/PlannerHeader.test.tsx src/components/PlannerApp.tsx
git commit -m "feat: simplify planner header"
```

---

### Task 7: Convert the semester board to one chronological column

**Files:**
- Modify: `src/components/planner/PlannerBoard.tsx`
- Modify: `src/components/planner/SemesterColumn.tsx`
- Modify: `src/components/planner/CourseChip.tsx`
- Create: `src/components/planner/PlannerBoard.test.tsx`
- Modify: `src/store/plannerStore.ts`

**Interfaces:**
- Guarantees: DOM order `Y1F, Y1S, Y2F, Y2S, Y3F, Y3S, Y4F, Y4S` and no responsive semester columns.

- [ ] **Step 1: Write failing one-column semantic test**

Render `PlannerBoard` with test providers. Query all `[data-testid^="semester-"]` and assert exact chronological order. Assert four year headings and eight semester sections. Assert each empty semester exposes “Add courses from the catalog or use Add to semester.”

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/components/planner/PlannerBoard.test.tsx`

Expected: FAIL because the board nests two semesters in multi-column year cards and has old empty copy.

- [ ] **Step 3: Implement year dividers and full-width semesters**

Replace the board grid with `flex flex-col`. Each year is a semantic section with a divider header and two full-width semester surfaces. Remove `md:grid-cols-2`/`2xl:grid-cols-4`. Increase semester padding/minimum height and use a single vertical course list.

- [ ] **Step 4: Add selected-credit controls for variable courses**

Add store action `setSelectedCredits(courseId, credits)` and expose a compact select in course details/row only when min and max differ. All displayed totals use the shared placement-credit helper.

- [ ] **Step 5: Make remove action keyboard-visible**

Use `group-focus-within` as well as hover, keep an accessible name, and maintain pointer-event separation from drag.

- [ ] **Step 6: Run GREEN**

Run:

```powershell
npm.cmd test -- src/components/planner/PlannerBoard.test.tsx src/lib/credits.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/planner/PlannerBoard.tsx src/components/planner/SemesterColumn.tsx src/components/planner/CourseChip.tsx src/components/planner/PlannerBoard.test.tsx src/store/plannerStore.ts
git commit -m "feat: use a one-column semester timeline"
```

---

### Task 8: Add responsive workspace rails and accessible sheets

**Files:**
- Create: `src/components/ui/sheet.tsx`
- Create: `src/components/layout/PlannerWorkspace.tsx`
- Create: `src/components/layout/WorkspaceTools.tsx`
- Create: `src/components/layout/PlannerWorkspace.test.tsx`
- Modify: `src/components/PlannerApp.tsx`

**Interfaces:**
- Produces: desktop three-column workspace and course/progress sheet triggers at narrower breakpoints.

- [ ] **Step 1: Write failing workspace tests**

Test landmark names `Course Catalog`, `Four-Year Plan`, and `Degree Progress`; test Courses/Progress buttons open sheets and Escape restores focus. Test the timeline exists once, never duplicated between desktop/mobile markup.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/components/layout/PlannerWorkspace.test.tsx`

Expected: FAIL because workspace/sheet components are absent.

- [ ] **Step 3: Implement Base UI sheet primitive**

Wrap Base UI Dialog with fixed right/left panels, backdrop, title/description, close control, `z-index` tokens, focus management, and reduced-motion classes. Do not render a dropdown inside an overflow-clipped rail.

- [ ] **Step 4: Implement responsive workspace**

Use CSS breakpoints:

- `2xl`: `340px minmax(620px,1fr) 360px`.
- `lg` through `xl`: catalog plus timeline; progress sheet trigger.
- below `lg`: timeline only; Courses and Progress tool actions.

Keep one semantic instance of each tool and use CSS/portal composition rather than rendering duplicate stateful planners.

- [ ] **Step 5: Run GREEN**

Run: `npm.cmd test -- src/components/layout/PlannerWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/ui/sheet.tsx src/components/layout/PlannerWorkspace.tsx src/components/layout/WorkspaceTools.tsx src/components/layout/PlannerWorkspace.test.tsx src/components/PlannerApp.tsx
git commit -m "feat: add responsive planner workspace"
```

---

### Task 9: Virtualize and expand the Bulletin course catalog

**Files:**
- Modify: `src/components/catalog/CourseCatalog.tsx`
- Create: `src/components/catalog/CourseCatalog.test.tsx`
- Modify: `src/components/dialogs/AddCourseDialog.tsx`

**Interfaces:**
- Uses: `useVirtualizer` from `@tanstack/react-virtual`.
- Supports: code/title/subject/description search and dynamic program/attribute/subject/term filters.

- [ ] **Step 1: Write failing filter/search tests**

Test a Humanities program imported at runtime, description keyword search, subject filter, Core attribute filter, unknown offering state, and unplanned filter. Verify result count text.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/components/catalog/CourseCatalog.test.tsx`

Expected: FAIL because filters are hard-coded to CS/IMA/Core and description is ignored.

- [ ] **Step 3: Implement dynamic filter model**

Build filter options from active programs, course subjects, attributes, and known terms. Keep filter state explicit and memoize results. Unknown offerings display “Schedule varies” and do not match Fall/Spring-only filters.

- [ ] **Step 4: Add virtual result list**

Use one scroll parent, estimated row height matching the larger card, measured elements, overscan, and an accessible result count. In jsdom tests, mock dimensions/virtualizer output at the adapter boundary rather than testing TanStack internals.

- [ ] **Step 5: Remove Albert-first student wording**

Rename Add Course copy to “Add custom course”; explain that official courses come from NYU Bulletin. Keep the authenticated parse preview only as a secondary optional paste helper.

- [ ] **Step 6: Run GREEN**

Run:

```powershell
npm.cmd test -- src/components/catalog/CourseCatalog.test.tsx
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/catalog/CourseCatalog.tsx src/components/catalog/CourseCatalog.test.tsx src/components/dialogs/AddCourseDialog.tsx
git commit -m "feat: scale catalog for bulletin courses"
```

---

### Task 10: Update degree progress for recursive/manual requirements

**Files:**
- Modify: `src/components/progress/ProgressRings.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Modify: `src/components/progress/SpecialRulesPanel.tsx`
- Modify: `src/components/progress/WarningCenter.tsx`
- Modify: `src/components/progress/FeasibilityDialog.tsx`
- Create: `src/components/progress/RequirementChecklist.test.tsx`

**Interfaces:**
- Displays: automatic progress, waiver facts, manual confirmations, exact source text, source links.

- [ ] **Step 1: Write failing manual-requirement tests**

Render checklist fixtures containing automatic course requirements, waiver, and manual confirmation. Assert manual items are labeled “Confirmation required”, expose source policy text, and can record/remove a fulfillment fact without awarding course credits.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/components/progress/RequirementChecklist.test.tsx`

Expected: FAIL because current checklist understands only legacy categories.

- [ ] **Step 3: Implement progressive disclosure and facts**

Use Accordion for program requirement groups. Show planned/earned values, missing deterministic courses, waiver controls, and manual-confirmation actions. Link to Bulletin source in the detail area. Preserve program colors only in restrained indicators/rings.

- [ ] **Step 4: Clarify feasibility and warnings**

Use copy: “This is a greedy planning check, not proof that no valid schedule exists.” Unknown offerings become informational metadata, not a warning. Keep warning restore behavior.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
npm.cmd test -- src/components/progress/RequirementChecklist.test.tsx
npm.cmd test -- src/lib/engines.test.ts src/lib/feasibility.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/progress
git commit -m "feat: explain bulletin degree progress"
```

---

### Task 11: Apply the Academic Workspace visual system and metadata

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/layout/PlannerHeader.tsx`
- Modify: `src/components/layout/PlannerWorkspace.tsx`
- Modify: `src/components/layout/WorkspaceTools.tsx`
- Modify: `src/components/inspiration/InspirationStrip.tsx`
- Modify: `src/components/planner/PlannerBoard.tsx`
- Modify: `src/components/planner/SemesterColumn.tsx`
- Modify: `src/components/planner/CourseChip.tsx`
- Modify: `src/components/catalog/CourseCatalog.tsx`
- Modify: `src/components/progress/ProgressRings.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Modify: `src/components/progress/SpecialRulesPanel.tsx`
- Modify: `src/components/progress/WarningCenter.tsx`
- Modify: `src/components/progress/FeasibilityDialog.tsx`
- Create: `src/lib/designRules.test.ts`

**Interfaces:**
- Produces: restrained light/dark token system, semantic z-index/motion scales, larger targets.

- [ ] **Step 1: Add a failing static design-rule test**

Create `src/lib/designRules.test.ts` that reads the exact UI source files listed for this task and rejects the agreed anti-patterns: gradient text, card radius above 32px, arbitrary `z-[999...]`, side accent borders over 1px, and a missing reduced-motion block in global CSS.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/designRules.test.ts`

Expected: FAIL at least for missing Academic Workspace tokens/reduced-motion marker.

- [ ] **Step 3: Implement OKLCH tokens and typography**

Keep NYU violet as primary. Use neutral near-white canvas, opaque white surfaces, graphite ink, and tested semantic colors. Define `--z-dropdown`, `--z-sticky`, `--z-backdrop`, `--z-modal`, `--z-toast`, `--z-tooltip`; define 150/220ms motion tokens. Keep Geist Sans/Mono and update metadata to serve all NYUSH majors.

- [ ] **Step 4: Normalize component proportions**

Raise body/UI type toward 15–16px, primary targets to 44px, semester/course padding, and card radii to 12–16px. Remove uppercase tracked section labels as default scaffolding. Do not pair wide shadows with borders.

- [ ] **Step 5: Add reduced motion and focus-visible behavior**

Disable transform/zoom transitions under `prefers-reduced-motion: reduce`; keep state changes instant or crossfade. Ensure buttons, course rows, dialogs, sheets, and remove controls have visible focus.

- [ ] **Step 6: Run GREEN, lint, and type check**

Run:

```powershell
npm.cmd test -- src/lib/designRules.test.ts
npm.cmd run lint
npx.cmd tsc --noEmit
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```powershell
git add src/app/globals.css src/app/layout.tsx src/components src/lib/designRules.test.ts
git commit -m "style: apply academic workspace system"
```

---

### Task 12: Integrate Guide, inspiration, workspace, and planner composition

**Files:**
- Modify: `src/components/PlannerApp.tsx`
- Create: `src/components/PlannerApp.test.tsx`
- Inspect: `src/app/page.tsx` to confirm its existing server/client boundary remains valid

**Interfaces:**
- Final composition order: `CatalogProvider -> PlanDerivedProvider -> header -> inspiration -> workspace -> dialogs`.

- [ ] **Step 1: Write failing composition tests**

Test that a first visit opens onboarding after hydration, Guide reopens it after completion, quote strip precedes the workspace, the header contains Guide, and eight semester surfaces render once.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/components/PlannerApp.test.tsx`

Expected: FAIL because new components are not integrated.

- [ ] **Step 3: Integrate focused providers**

Keep server modules out of the client graph. Mount `PlanDerivedProvider` inside `CatalogProvider` and around only planner consumers. Connect Guide to onboarding `restart`, retain PlanSync, DnD overlay, course detail dialog, import/export, and click-suppression behavior.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
npm.cmd test -- src/components/PlannerApp.test.tsx
npm.cmd test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/PlannerApp.tsx src/components/PlannerApp.test.tsx
git commit -m "feat: integrate academic planner workspace"
```

---

### Task 13: Browser, accessibility, responsive, and production verification

**Files:**
- Update: `.planning/2026-07-14-bulletin-data-ui-redesign/progress.md` with evidence.

**Interfaces:**
- Validates the final user experience in a real browser.

- [ ] **Step 1: Run automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit
```

Expected: all commands exit 0 with no unhandled warnings.

- [ ] **Step 2: Start the application and inspect wide desktop**

Run: `npm.cmd run dev` and use the in-app browser at a viewport at least 1440px wide.

Verify:

- catalog/timeline/progress three-column relationship;
- eight semester surfaces in one chronological column;
- sticky rails without clipped dropdowns;
- larger targets/type/spacing;
- inspiration image crop and quote contrast;
- dynamic major options and catalog search.

- [ ] **Step 3: Inspect tablet and mobile**

At 1280px, verify progress sheet. Below 1024px, verify Courses and Progress sheets, focus return, no horizontal overflow, and complete Add-to-semester flow without dragging. At mobile width, verify header/Guide, stacked course rows, dialogs, and safe-area behavior.

- [ ] **Step 4: Inspect onboarding and accessibility**

Clear `nyush-planner:onboarding:v1`, reload, complete all four steps, reload again, and verify no automatic reopen. Reopen via Guide. Navigate header, catalog, semesters, sheets, dialogs, and course removal by keyboard. Verify focus, accessible names, escape behavior, color-independent warnings, and reduced-motion emulation.

- [ ] **Step 5: Capture visual evidence and route verified defects back to their owning task**

Take screenshots at wide desktop, tablet, and mobile. Compare against the approved Academic Workspace spec. This verification task does not make ad hoc source edits. For each defect, return to the task that owns the exact component, add or update a failing regression test there, implement the fix, rerun that task's checks, and amend that task's commit before resuming this checklist.

- [ ] **Step 6: Run production build**

Run: `npm.cmd run build` using the clean node-postgres build path documented for this repository.

Expected: compilation, TypeScript, and route generation succeed without the known PGlite worker noise.

- [ ] **Step 7: Record verification evidence**

Update `.planning/2026-07-14-bulletin-data-ui-redesign/progress.md` with command results, tested viewport widths, keyboard/accessibility checks, screenshot paths, and any owning tasks revisited for regression fixes. Do not create an empty verification-only commit.

---

## Frontend Plan Self-review Checklist

- One-column semesters are enforced by DOM order and browser verification.
- Guide is visible and onboarding is automatic once, versioned, reopenable, keyboard accessible, and English-only.
- The image is project-owned, statically imported, optimized, decorative, and readable under overlays.
- Quotes are original, session-stable, refreshable, and hydration-safe.
- Course and progress tools convert to sheets without duplicating planner state.
- The expanded Bulletin catalog uses dynamic filters and virtualization.
- Derived engines run once per relevant state change; feasibility is lazy and honestly described.
- Every interactive path has keyboard/non-drag support.
- Visual rules reject the approved anti-patterns and enforce reduced motion.
- Final verification covers tests, lint, types, build, three viewport classes, keyboard use, and visual screenshots.
