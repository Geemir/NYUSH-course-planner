# NYU Academic Glass Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the English NYUSH planner into a mature, Apple-inspired SaaS interface using platform typography, deliberate controls, restrained liquid-glass motion, and excellent accessibility while retaining NYU violet, Lucide icons, the one-column semester workspace, and the uploaded New York skyline.

**Architecture:** A repaired token layer defines system typography, NYU semantic colors, dimensions, radii, shadows, opaque content surfaces, and one reusable functional-glass primitive. A development-only interactive prototype validates material, motion, contrast, drag behavior, browser fallbacks, and reduced-preference modes before rollout. Accepted styling then moves through shared primitives into the shell, transient surfaces, planner timeline, onboarding, and new v0.2 workflows without changing domain behavior.

**Tech Stack:** React 19, Next.js 16.2.9, Tailwind CSS 4, CSS custom properties, existing Base UI/Radix-style primitives, Lucide React, dnd-kit, Vitest 4, React Testing Library.

## Global Constraints

- Execute after all v0.2 data/workflow plans and before release integration.
- Read `node_modules/next/dist/docs/01-app/02-guides/fonts.md` before changing fonts.
- Apply the approved Impeccable/Apple reference principles without copying Apple branding, proprietary fonts, assets, component names, or marketing language.
- Retain NYU violet as the primary accent, supported by plum, lavender, warm neutral, and deep-violet-black values. Do not replace NYU identity with monochrome gray.
- Use the legal platform stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. Retain a self-hosted mono face only for course codes/numeric diagnostics.
- Keep Lucide as the only product icon set. Icons support labels and hierarchy; ambiguous actions retain visible text.
- Restrict glass to floating or transient chrome: header, workspace tools, menus, popovers, sheets, and dialog chrome. Semester, course, form, table, and long-reading content surfaces remain opaque.
- Keep the current one-column semester timeline and uploaded New York skyline image. Preserve its attribution in README/about metadata.
- Prefer CSS and existing primitives. Add a motion dependency only if the prototype proves a requirement cannot be met accessibly with CSS/dnd-kit.
- Support `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast: more`, forced colors, keyboard navigation, 200% zoom, and coarse pointers.
- All interactive targets are at least 44 by 44 CSS pixels on touch layouts. Never communicate state by color alone.
- Prototype acceptance is a hard checkpoint. Do not roll the visual system through the full app until the interactive prototype is reviewed and accepted.
- Follow red-green-refactor for shared primitives and behavior; visual QA supplements, not replaces, automated checks.

---

## File Structure

### New visual-system files

- `src/lib/designTokens.ts`
- `src/lib/designTokens.test.ts`
- `src/components/ui/glass-surface.tsx`
- `src/components/ui/glass-surface.test.tsx`
- `src/components/design/AcademicGlassPrototype.tsx`
- `src/components/design/AcademicGlassPrototype.test.tsx`
- `src/app/design-preview/page.tsx`

### Existing foundations changed

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/ui/button.tsx`
- `src/components/ui/button.test.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/tooltip.tsx`
- `src/lib/designRules.test.ts`

### Existing product surfaces changed

- `src/components/layout/PlannerHeader.tsx`
- `src/components/layout/WorkspaceTools.tsx`
- `src/components/layout/PlanSyncStatus.tsx`
- `src/components/layout/UndoButton.tsx`
- `src/components/PlannerApp.tsx`
- `src/components/catalog/CourseCatalog.tsx`
- `src/components/dialogs/CourseDetailDialog.tsx`
- `src/components/planner/SemesterColumn.tsx`
- `src/components/planner/CourseChip.tsx`
- `src/components/progress/ProgressRings.tsx`
- `src/components/progress/RequirementChecklist.tsx`
- `src/components/programs/ProgramProfileSheet.tsx`
- `src/components/corrections/ReportIssueDialog.tsx`
- `src/components/corrections/MyReportsSheet.tsx`
- `src/components/corrections/NotificationMenu.tsx`
- `src/components/onboarding/OnboardingDialog.tsx`
- `README.md`

---

### Task 1: Repair typography, color, spacing, radius, and motion tokens

**Files:**
- Create: `src/lib/designTokens.ts`
- Create: `src/lib/designTokens.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/designRules.test.ts`

**Token contract:**

```ts
export const CONTROL_HEIGHT = { compact: 36, default: 44, prominent: 52 } as const;
export const MOTION_DURATION_MS = { instant: 0, control: 160, surface: 260 } as const;
export const GLASS_BLUR_PX = { subtle: 12, strong: 20 } as const;
export const CONTENT_MAX_WIDTH_PX = 1180;
```

CSS semantic groups:

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: var(--font-geist-mono), "SFMono-Regular", Consolas, monospace;
  --nyu-violet: #57068c;
  --nyu-plum: #330662;
  --nyu-lavender: #e6d9f2;
  --surface-canvas: #f7f5f8;
  --surface-content: #ffffff;
  --surface-raised: #fbfafc;
  --surface-glass: rgb(255 255 255 / 78%);
  --text-primary: #1f1824;
  --text-secondary: #665e6b;
  --border-subtle: rgb(87 6 140 / 14%);
  --focus-ring: #7b2cbf;
}

.dark {
  --nyu-violet: #b58ad3;
  --nyu-plum: #e2ccef;
  --nyu-lavender: #5e3976;
  --surface-canvas: #141017;
  --surface-content: #201923;
  --surface-raised: #2a2130;
  --surface-glass: rgb(29 22 33 / 82%);
  --text-primary: #f8f4fa;
  --text-secondary: #cbbfce;
  --border-subtle: rgb(230 217 242 / 18%);
  --focus-ring: #d0a6eb;
}
```

- [ ] **Step 1: Write failing token/design-rule tests**

Assert one non-recursive `--font-sans`, required semantic tokens, no use of proprietary `SF Pro` declarations, no more than the approved radius scale, control/motion constants in range, and NYU violet still mapped to primary/focus semantics.

Run:

```powershell
npm.cmd test -- src/lib/designTokens.test.ts src/lib/designRules.test.ts --maxWorkers=1
```

Expected: FAIL because tokens are missing and the current font variable is recursive.

- [ ] **Step 2: Remove Geist Sans and retain mono only**

In `src/app/layout.tsx`, remove Geist Sans import/configuration. Keep Geist Mono if currently self-hosted through `next/font/google` and expose only its mono variable. The body uses the CSS platform stack.

- [ ] **Step 3: Implement three-layer tokens**

Define primitive values, semantic aliases, and component aliases in `globals.css`; export only testable numeric constants from `designTokens.ts`. Preserve and polish the existing light and dark themes, and test both through the prototype and final preference matrix.

- [ ] **Step 4: Normalize type scale and content rhythm**

Use a compact product scale (12/13/15/17/20/24/32/40 where needed), line heights from 1.2 to 1.6, and restrained weights 400/500/600/700. Course codes use mono; prose, controls, and metrics use sans. Increase main workspace spacing and element scale without reducing information clarity.

- [ ] **Step 5: Add preference foundations**

In `globals.css`, define reduced motion, reduced transparency, more contrast, forced colors, coarse pointer, and 200% zoom-safe rules. Avoid `transition: all` and broad selectors that animate layout.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- src/lib/designTokens.test.ts src/lib/designRules.test.ts --maxWorkers=1
git add src/lib/designTokens.ts src/lib/designTokens.test.ts src/app/layout.tsx src/app/globals.css src/lib/designRules.test.ts
git commit -m "style(system): establish NYU Academic Glass tokens"
```

Expected: PASS; NYU violet remains primary and the recursive font token is gone.

---

### Task 2: Standardize buttons, icons, focus, press, and control sizing

**Files:**
- Modify: `src/components/ui/button.tsx`
- Create: `src/components/ui/button.test.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/lib/designRules.test.ts`

**Button contract:**

```ts
type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "compact" | "default" | "prominent" | "icon";
```

- [ ] **Step 1: Write failing Button behavior tests**

Test variant classes, semantic heights, minimum touch size for icon buttons, visible focus, disabled/loading state, icon spacing, `aria-busy`, no double activation while loading, and no scale animation under reduced motion.

- [ ] **Step 2: Refactor the Button primitive**

Map existing aliases to the new semantic variants temporarily, then migrate call sites in later tasks. Use a 0.98 press scale for enabled controls, 160 ms easing, and no hover-only information. Do not make every button violet; primary marks the one dominant action per region.

- [ ] **Step 3: Add icon rules**

Keep Lucide default stroke visually consistent. Decorative icons get `aria-hidden`; icon-only buttons require an accessible name and tooltip; destructive and unfamiliar actions keep text. Add static design-rule tests that reject new emoji-as-icon and inline SVG icon forks in product components.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd test -- src/components/ui/button.test.tsx src/lib/designRules.test.ts --maxWorkers=1
git add src/components/ui/button.tsx src/components/ui/button.test.tsx src/components/ui/tooltip.tsx src/lib/designRules.test.ts
git commit -m "style(controls): standardize buttons and icons"
```

Expected: PASS.

---

### Task 3: Build one accessible functional-glass primitive and transient-surface motion

**Files:**
- Create: `src/components/ui/glass-surface.tsx`
- Create: `src/components/ui/glass-surface.test.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/app/globals.css`

**Primitive contract:**

```ts
interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  strength?: "subtle" | "strong";
  elevation?: "floating" | "overlay";
  asChild?: boolean;
}
```

- [ ] **Step 1: Write failing semantic/fallback tests**

Test ref forwarding, class composition, `asChild`, no nested interactive role, stable opaque fallback class, reduced-transparency class, contrast class, and no glass applied to an element marked `data-content-surface`.

- [ ] **Step 2: Implement the primitive**

Use layered translucent color, border highlight, restrained shadow, and `backdrop-filter` only under `@supports`. The base/fallback must be an opaque raised surface with equal readable contrast. Do not implement pointer-tracking glare or continuously animated gradients.

- [ ] **Step 3: Centralize transient-surface motion**

Dialogs/sheets use opacity plus a small translate/scale for 220-320 ms; menus/popovers use 120-180 ms. Exits are shorter and interruptible. Under reduced motion, use opacity only or no transition. Never animate blur radius or large box shadows continuously.

- [ ] **Step 4: Keep content bodies opaque**

Apply glass only to dialog/sheet chrome or container shell while forms, long text, tables, and scroll regions inside use `--surface-content`. Add a design-rule assertion for this boundary where it can be represented statically.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd test -- src/components/ui/glass-surface.test.tsx src/lib/designRules.test.ts --maxWorkers=1
git add src/components/ui/glass-surface.tsx src/components/ui/glass-surface.test.tsx src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/dropdown-menu.tsx src/app/globals.css src/lib/designRules.test.ts
git commit -m "style(surfaces): add accessible functional glass"
```

Expected: PASS; fallback remains readable without backdrop-filter.

---

### Task 4: Build and review the interactive Academic Glass prototype gate

**Files:**
- Create: `src/components/design/AcademicGlassPrototype.tsx`
- Create: `src/components/design/AcademicGlassPrototype.test.tsx`
- Create: `src/app/design-preview/page.tsx`

- [ ] **Step 1: Write failing production-guard and interaction tests**

Test that the preview page renders in development/test, calls `notFound()` in production, demonstrates header/tools/course/semester/dialog/filter/sync states, supports keyboard interaction, and exposes toggles for reduced motion/transparency/contrast simulation.

- [ ] **Step 2: Implement a development-only prototype**

The prototype uses representative fake data only and includes:

- skyline-backed hero/header band;
- floating header/workspace toolbar glass;
- opaque one-column semester and course content;
- primary/secondary/quiet/danger buttons;
- search/filter menu, Program Profile sheet, Course Detail dialog;
- drag preview, save/offline/conflict feedback;
- light/dense data conditions and long text.

It must import production tokens/primitives, not copy CSS into a mockup.

- [ ] **Step 3: Run automated prototype checks**

```powershell
npm.cmd test -- src/components/design/AcademicGlassPrototype.test.tsx --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Perform cross-browser and preference review**

Open `/design-preview` at desktop, tablet, and mobile widths in Chromium plus one non-Chromium engine available to the team. Check unsupported blur, reduced motion, reduced transparency, higher contrast, forced colors, 200% zoom, keyboard focus, drag preview, long course titles, and low-end-device frame behavior.

- [ ] **Step 5: Capture the explicit acceptance checkpoint**

Present screenshots/recording and the measured findings to the user. Record accepted token/material/motion adjustments in this plan or a dated design note. Do not start Task 5 until the user explicitly accepts the interactive prototype.

- [ ] **Step 6: Commit the accepted prototype**

```powershell
git add src/components/design/AcademicGlassPrototype.tsx src/components/design/AcademicGlassPrototype.test.tsx src/app/design-preview/page.tsx
git commit -m "feat(design): prototype NYU Academic Glass"
```

Expected: the commit is development-only and the production route is 404.

---

### Task 5: Roll accepted materials into the application shell and transient chrome

**Files:**
- Modify: `src/components/layout/PlannerHeader.tsx`
- Modify: `src/components/layout/PlannerHeader.test.tsx`
- Modify: `src/components/layout/WorkspaceTools.tsx`
- Modify: `src/components/layout/PlanSyncStatus.tsx`
- Modify: `src/components/layout/UndoButton.tsx`
- Modify: `src/components/PlannerApp.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing shell behavior tests**

Cover one dominant primary action, Help/Program Profile/My Reports/notifications/sync/undo availability, compact responsive labels, accessible mobile navigation, skyline fallback/alt treatment, sticky behavior, and 44-pixel touch targets.

- [ ] **Step 2: Apply functional glass to header and workspace tools**

Use one visual plane for desktop header and one compact plane for mobile tools. Avoid glass-on-glass nesting. Preserve the uploaded New York skyline as an atmospheric band with a dark violet-neutral overlay that maintains text contrast and a stable focal crop.

- [ ] **Step 3: Clarify hierarchy and status**

Course planning is the primary workspace. Program Profile, sync/undo, Help, and notifications remain visible but secondary. Sync states pair icon, label, and tooltip; errors remain actionable. Use sentence case in English.

- [ ] **Step 4: Run header/shell tests and commit**

```powershell
npm.cmd test -- src/components/layout/PlannerHeader.test.tsx src/components/layout/PlanSyncStatus.test.tsx --maxWorkers=1
git add src/components/layout src/components/PlannerApp.tsx src/app/globals.css
git commit -m "style(shell): apply accepted academic glass chrome"
```

Expected: PASS; content surfaces remain opaque.

---

### Task 6: Polish catalog, planner timeline, progress, onboarding, and v0.2 workflows

**Files:**
- Modify: `src/components/catalog/CourseCatalog.tsx`
- Modify: `src/components/catalog/CourseCatalog.test.tsx`
- Modify: `src/components/dialogs/CourseDetailDialog.tsx`
- Modify: `src/components/planner/SemesterColumn.tsx`
- Modify: `src/components/planner/CourseChip.tsx`
- Modify: `src/components/progress/ProgressRings.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Modify: `src/components/programs/ProgramProfileSheet.tsx`
- Modify: `src/components/corrections/ReportIssueDialog.tsx`
- Modify: `src/components/corrections/MyReportsSheet.tsx`
- Modify: `src/components/corrections/NotificationMenu.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.tsx`

- [ ] **Step 1: Add/extend behavior-preservation tests before styling**

For each surface, assert existing controls, labels, dialog focus, drag handles, query states, status copy, report actions, and onboarding completion still work. Snapshot tests may supplement but cannot replace semantic assertions.

- [ ] **Step 2: Refine Catalog information hierarchy**

Make search prominent, filters compact, source/school visible, course code/title/credits scan-friendly, and New York catalog-only copy quiet but unmistakable. Use opaque result rows/cards with subtle selected/drag states; no floating glass per course.

- [ ] **Step 3: Refine the one-column timeline**

Increase semester card scale and whitespace, clarify year/term/credits/study-away state, and keep drag targets predictable. Course chips use one strong course-code anchor, one title line, credit/status metadata, and restrained source color. Drag motion follows the object and settles quickly; it does not spring/bounce decoratively.

- [ ] **Step 4: Refine progress and requirement evidence**

Use violet for progress, semantic colors only for warnings/success, and text/icon labels alongside color. Make source vs reviewed-overlay evidence scannable. Keep long requirement prose on opaque content backgrounds.

- [ ] **Step 5: Refine sheets, dialogs, and correction workflows**

Use consistent title/body/footer spacing, sticky action footer only when necessary, destructive confirmation hierarchy, clear loading/error states, and visible focus restoration. Glass belongs to outer chrome; form fields and review diff content remain opaque.

- [ ] **Step 6: Update the existing four-step onboarding**

Keep one onboarding system. Update copy and focus targets to cover: Program Profile, finding/placing Shanghai and New York study-away courses, reading degree progress and catalog-only labels, and Help/My Reports/sync/Undo. First visit auto-opens once; Help can reopen it any time.

- [ ] **Step 7: Preserve inspiration content without distraction**

Keep the random quote about boldly pursuing interests in a prominent but non-blocking workspace position. Avoid auto-rotating animation; choose on load/session and provide accessible text contrast over an opaque or stable image treatment.

- [ ] **Step 8: Run component suites and commit**

```powershell
npm.cmd test -- src/components/catalog/CourseCatalog.test.tsx src/components/dialogs/CourseDetailDialog.test.tsx src/components/progress src/components/programs src/components/corrections src/components/onboarding/OnboardingDialog.test.tsx --maxWorkers=1
git add src/components
git commit -m "style(product): polish the v0.2 planning experience"
```

Expected: PASS; no domain behavior changes are hidden inside the styling commit.

---

### Task 7: Verify accessibility, fallbacks, motion, performance, and design consistency

**Files:**
- Modify: `README.md`
- Remove after accepted rollout: `src/app/design-preview/page.tsx`
- Remove after accepted rollout: `src/components/design/AcademicGlassPrototype.tsx`
- Remove after accepted rollout: `src/components/design/AcademicGlassPrototype.test.tsx`
- Modify only if verification finds a defect: visual files owned by Tasks 1-6.

- [ ] **Step 1: Run automated design and regression gates**

```powershell
npm.cmd test -- src/lib/designTokens.test.ts src/lib/designRules.test.ts src/components/ui src/components/layout src/components/onboarding/OnboardingDialog.test.tsx --maxWorkers=1
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Expected: all exit 0.

- [ ] **Step 2: Run the viewport matrix**

Review at 320, 390, 768, 1024, 1440, and 1920 CSS-pixel widths; at 200% zoom; and with long English course/program names. Confirm no clipped controls, horizontal page scroll, inaccessible drag target, or detached floating tool.

- [ ] **Step 3: Run the preference/fallback matrix**

Verify reduced motion, reduced transparency, more contrast, forced colors, keyboard-only use, screen-reader landmark/dialog names, and coarse pointer. Disable backdrop-filter in dev tools; all text and controls must remain legible and visually grouped.

- [ ] **Step 4: Measure motion and rendering**

Use browser performance tools on header scrolling, catalog filter open, sheet/dialog transitions, and course drag across a populated 8-semester plan. Record frame drops/long tasks in the Plan 6 release report. Remove costly blur/shadow layers before considering a dependency.

- [ ] **Step 5: Audit visual consistency**

Search for rogue fonts, emoji icons, `transition-all`, arbitrary violet hexes outside tokens, glass on content cards, sub-44 touch controls, and unlabeled icon buttons:

```powershell
rg -n "SF Pro|transition-all|backdrop-blur|#[0-9A-Fa-f]{6}|<svg|emoji" src/app src/components
```

Expected: every match is an approved token/primitive/asset or is corrected.

- [ ] **Step 6: Remove the preview route after rollout acceptance**

Once the same accepted design is live and verified, delete the development preview route/component/tests so it cannot drift. If the team wants a permanent design-system gallery, replace it in a later separately scoped plan with protected documentation rather than leaving a product mock route.

- [ ] **Step 7: Update attribution and commit**

Document the system font stack, NYU Academic Glass principles, preference fallbacks, and the uploaded Unsplash image attribution in README. Then:

```powershell
git add src/app/design-preview src/components/design README.md
git commit -m "docs(design): finalize Academic Glass rollout"
```

Expected: preview files are removed and production build remains green.

---

## Completion Criteria

- The UI uses a platform system font stack, consistent Lucide icons, semantic NYU tokens, and centralized control sizes.
- NYU violet remains the brand anchor; Apple influence appears as craft and behavior, not imitation.
- Functional glass is limited to floating/transient chrome and has opaque, reduced-transparency, higher-contrast, and forced-color fallbacks.
- The interactive prototype is explicitly accepted before system-wide rollout.
- The one-column timeline, larger proportions, New York skyline, random interest-focused quote, English interface, onboarding, Help, sync, Undo, Program Profile, and Correction Hub remain present and usable.
- Keyboard, screen reader, touch, zoom, reduced-preference, cross-browser, and performance checks pass.
- All automated tests, lint, typecheck, and production build pass.

## Handoff to the Next Plan

After this plan is complete, execute `2026-07-17-v0-2-release-integration-ga.md`. That plan rehearses real source coverage, migrations, end-to-end journeys, rollback, documentation, and v0.2 launch gates.
