# Authentication, Plan Export, Announcements, and Motion Design

Date: 2026-07-29

## Scope

This release adds four coordinated product improvements while keeping the product an English-language NYUSH degree planner with New York study-away course discovery:

1. Make Google the only active sign-in provider and present Email sign-in as an unavailable work-in-progress.
2. Keep JSON plan backup and add polished Excel and PDF exports generated locally in the browser.
3. Let administrators author, publish, withdraw, and review global announcements that students can dismiss.
4. Use Anime.js for purposeful motion in the inspiration strip and announcement state changes.

The work preserves the NYU violet identity, the existing one-column semester planner, the current Guide behavior, and mobile usability down to a 390 px viewport.

## Non-goals

- Do not re-enable Microsoft Entra ID or Email authentication.
- Do not make Excel or PDF files importable; JSON remains the lossless interchange format.
- Do not add rich-text/HTML announcement authoring, audience segmentation, push notifications, or read receipts.
- Do not animate every page or replace the established component system.
- Do not apply the new database migration to production, push Git commits, or deploy Vercel as part of local implementation.

## Chosen approach and alternatives

### Recommended: client-local exports, database-backed announcements, scoped WAAPI motion

The planner builds one presentation-neutral `PlanExportModel` from the validated v2 snapshot and the existing derived-plan state. Separate renderers produce JSON, XLSX, and PDF. XLSX/PDF libraries are loaded only after the user chooses a format, keeping plan contents in the browser and outside the initial bundle.

Announcements use a dedicated PostgreSQL table and small public/admin Route Handlers. The public planner fetches only the latest currently published DTO. Dismissal is browser-local and keyed by announcement ID.

Anime.js 4.5.0 uses its WAAPI path for a small number of transform/opacity/filter animations. Every animation is ref-scoped, cancellable, and bypassed for reduced-motion users.

### Rejected: server-generated Excel/PDF

Server rendering would keep export libraries out of the browser and could centralize templates, but it would upload signed-out users' local plans, add Vercel function work, create an unnecessary privacy boundary, and require authenticated/anonymous rate handling.

### Rejected: print stylesheet plus CSV

Browser print and CSV would have the smallest dependency cost, but CSV is not a styled multi-sheet Excel workbook and print-to-PDF depends on browser dialogs and inconsistent pagination. It does not meet the requested export quality.

## Authentication

### Provider boundary

`buildProviders()` will register Google only when `AUTH_GOOGLE_ID` exists. Microsoft Entra ID and the development console magic-link provider will be removed. The existing `@nyu.edu` sign-in callback remains the hard identity gate, so a Google identity outside NYU still cannot create a session.

The Auth.js adapter keeps `verificationTokensTable` for schema compatibility; removing an unused table is unrelated and would create avoidable migration risk.

### Sign-in interface

The sign-in page remains a focused, responsive card. It contains:

- NYUSH Course Planner identity and a short sign-in explanation;
- one primary `Continue with Google` action;
- a disabled Email sign-in row labeled `Email sign-in - In development`;
- the existing signed-out/local-planning reassurance;
- a bounded configuration message if Google is unavailable in the current environment.

The Google action has loading/disabled/error states. On mobile it fills the available width, all touch targets remain at least 44 px high, and text wraps without horizontal scrolling.

## Export architecture

### Shared export model

`buildPlanExportModel()` consumes the current v2 snapshot plus `PlanDerivedValue`. It produces only serializable display data:

- generation time, catalog release, entry year, and class year;
- Core, primary major, optional second major, and minors with display names;
- planned/completed/required credit totals;
- eight ordered semesters with calendar label, study-away site, completion state, semester credits, and courses;
- each course's code, resolved title, selected credits, expected grade, and effective requirement allocations;
- per-program category progress with required/planned/completed units and gaps;
- active advisement warnings;
- a clear statement that Bulletin-derived requirements are planning guidance and require advisor confirmation.

Unresolved catalog records remain visible using `titleSnapshot` or the course code. No export renderer recomputes degree logic.

### JSON

The current validated v2 JSON remains unchanged and importable. The menu label becomes `Export JSON backup`, and the filename includes the entry year.

### Excel

ExcelJS 4.4.0 creates a real `.xlsx` workbook with three sheets:

1. `Overview`: Program Profile, credit totals, export metadata, warnings, and the advising disclaimer.
2. `Semester Plan`: one typed row per planned course with year, term, site, completion, code, title, credits, expected grade, and allocation.
3. `Requirement Progress`: program role/name, category, required/planned/completed values, unit type, status, and remaining gaps.

The workbook uses NYU violet sparingly for headings, frozen table headers, filters, readable column widths, wrapped long text, typed numeric cells, and high-contrast status styling. It contains no macros or external formulas.

### PDF

jsPDF 4.2.1 and jsPDF-AutoTable 5.0.8 create an A4 landscape PDF. It contains a compact overview, eight-semester schedule, requirement progress, warnings, disclaimer, repeated table headers, and page numbers. Built-in Helvetica covers the English interface without runtime font downloads. NYU violet is used for primary headings and table headers; the document remains legible in grayscale.

### Download UX and performance

The existing Plan actions menu lists three explicit items: JSON, Excel, and PDF. Excel/PDF renderers are dynamically imported only when selected. The chosen item reports a preparing state through an accessible toast, ignores duplicate clicks while running, downloads on success, and reports a concise error without mutating planner state.

On mobile, the items remain in the existing flat menu rather than a nested submenu. This keeps actions reachable and avoids hover-dependent navigation.

## Announcement architecture

### Data model

A new `announcement` table contains:

- `id` UUID text primary key;
- `title` and plain-text `body`;
- `tone`: `info`, `warning`, or `critical`;
- optional HTTPS `linkUrl` and bounded `linkLabel`;
- `status`: `draft`, `published`, or `archived`;
- nullable `publishedAt` and `expiresAt`;
- nullable `createdBy` user reference with `onDelete: set null`;
- `createdAt` and `updatedAt` timestamps.

A partial unique index permits at most one row with `status = published`. Publishing runs transactionally: archive the prior published row, then publish the selected draft. Expired rows remain auditable but are excluded from the public query. Withdrawing archives the published row and leaves no active announcement.

### Contracts and routes

Zod contracts strictly bound title/body/link lengths, tones, statuses, and valid future expiration dates. Announcement bodies are always rendered as text, never HTML.

- `GET /api/announcements/current`: public, no-store, returns the current public DTO or `{ announcement: null }`.
- `GET /api/admin/announcements`: admin-only history.
- `POST /api/admin/announcements`: admin-only draft creation.
- `PATCH /api/admin/announcements/[id]`: admin-only draft update, publish, or archive action.

Admin mutations use the existing `requireAdminUser()` gate. Error responses distinguish unauthorized, forbidden, invalid input, missing announcement, and publication conflict without exposing database details.

### Admin interface

`AdminAnnouncements` appears near the top of Catalog Admin. The editor provides title, body, tone, optional link, optional expiration, Save draft, and Publish controls. History shows status, publication/expiration time, creator-independent public content, and a Withdraw action for the active item.

At narrow widths, fields stack in one column, action buttons wrap, history switches from wide rows to vertical blocks, and all inputs/buttons retain 44 px touch targets.

### Student interface and dismissal

`AnnouncementBanner` is rendered immediately below the sticky planner header and before the inspiration strip. It fetches the current DTO after hydration. Information hierarchy is icon/tone, title/body, optional link, then dismissal.

Dismissal writes `nyush-planner:announcement-dismissed:<id>` to localStorage. Storage failure still dismisses for the current render. A new announcement has a new ID and appears normally. Fetch failure is silent because an announcement must never block planning.

The banner wraps into a vertical mobile layout, the close button has an explicit `Dismiss announcement` label, and critical color never replaces textual tone/status meaning.

## Motion design

### Inspiration signature motion

The quote block receives one subtle ambient loop: a 7.5-second opacity/vertical breathing cycle limited to approximately 2 px of travel. Text is fully visible before animation starts and never becomes unreadable.

Selecting `Another thought` performs:

1. 140 ms exit: slight upward movement, opacity reduction, and a bounded 2 px blur;
2. quote/state replacement and session persistence;
3. 260 ms entrance: settle from below with `outQuint` easing;
4. a one-time 220 ms refresh-icon rotation as action feedback.

The button is disabled only during the short content swap to avoid overlapping state transitions. `aria-live=polite` announces the final quote once.

### Announcement motion

Fetched announcements enter over 220 ms with a small upward offset and fade. Dismissal exits in 160 ms before local removal. Layout-driving properties are not animated.

### Reduced motion and cleanup

A shared reactive reduced-motion hook listens to `matchMedia('(prefers-reduced-motion: reduce)')`. Reduced-motion users receive immediate quote changes and announcement show/hide behavior without looping or directional movement. Every Anime.js instance is cancelled/reverted during state replacement and unmount. The existing Guide uses the same preference hook but retains its current timing and direction semantics.

## Accessibility, responsive behavior, and security

- English copy only; NYU violet remains the primary accent.
- All interactive controls are keyboard reachable and expose visible focus.
- Loading status uses text/ARIA, not motion alone.
- Mobile acceptance viewport is 390 x 844; no horizontal overflow is allowed at 320 px.
- Announcement links accept HTTPS only and render with `rel="noopener noreferrer"` when external.
- Public announcement DTOs never expose user IDs or internal lifecycle fields.
- Export filenames are deterministic and sanitized; exports never execute formulas from user-entered text.
- JSON remains the only accepted import format.

## Failure handling

- Missing Google configuration disables the Google button and shows a configuration message; no fallback provider appears.
- XLSX/PDF generation errors leave the plan unchanged and show a retryable toast.
- Missing catalog course detail falls back to snapshot title/code in exports.
- Announcement database/API failure hides the banner and leaves the planner usable.
- Stale Admin announcement actions reload history and show a bounded conflict error.
- Publication and withdrawal are transactional so the public endpoint never observes two active announcements.

## Testing and verification

### Automated

- Auth provider tests prove Google is the only registrable provider and the NYU email gate remains active.
- Sign-in component tests cover loading, Google action, missing configuration, disabled Email copy, keyboard access, and mobile-safe semantics.
- Export-model tests cover semester ordering, variable credits, unresolved courses, Program Profile roles, progress, warnings, and disclaimer.
- XLSX tests reopen generated bytes and inspect sheet names, typed representative cells, headers, and row counts.
- PDF tests verify a valid non-empty PDF payload and renderer input; final layout is visually rendered separately.
- Announcement repository tests cover draft, update, publish replacement, expiry, withdrawal, and public DTO privacy.
- Route tests cover public access, no-store headers, admin authorization, validation, and transition conflicts.
- Banner/Admin tests cover dismissal persistence, new-ID reappearance, storage/fetch failure, responsive structure, and actions.
- Motion tests cover loop parameters, ordered quote replacement, cancellation, and reduced motion.

### Visual/artifact QA

- Browser-check desktop and 390 x 844 mobile sign-in, announcement, export menu, Admin editor/history, and inspiration transitions.
- Emulate reduced motion and verify immediate readable state changes.
- Generate a representative XLSX, inspect all three worksheets, and render each sheet for clipping/contrast review.
- Generate a representative PDF, reopen it, render every page to PNG, and verify headers, tables, wrapping, page numbers, and grayscale legibility.
- Run focused tests, full tests with stable worker count, ESLint, TypeScript, `git diff --check`, and a Next.js production build.

## Production handoff

Implementation produces a generated Drizzle migration and documents the exact operator commands. It does not mutate Neon or deploy Vercel. The operator sequence after review is migration first, then application deployment, followed by Google sign-in, public announcement, dismissal, XLSX, PDF, mobile, and reduced-motion smoke tests.

## Success criteria

- Google is the only callable sign-in provider; Email is visibly but safely marked in development.
- JSON, Excel, and PDF downloads represent the same current plan without uploading local plan data.
- Admins can create/publish/withdraw announcements, and all users can dismiss the current banner without suppressing future announcements.
- Quote and announcement animations clarify state, remain subtle, clean up correctly, and disappear under reduced motion.
- All affected interfaces are comfortable at 390 px and usable without horizontal overflow at 320 px.
