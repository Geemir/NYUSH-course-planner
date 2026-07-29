# Findings: Authentication, Export, Announcements, and Motion

## External research

- Anime.js v4 exposes `animate()` from `animejs` or `animejs/animation` and a lighter WAAPI-backed `waapi.animate()` entry point.
- The official documentation includes React integration, timelines, looping, callbacks, cancellation/revert methods, text splitting, staggering, and a WAAPI-specific surface.
- Anime.js's official React pattern uses `useEffect()`, a root ref, `createScope({ root })`, registered scope methods for event-driven animations, and `scope.revert()` cleanup.
- The official guidance recommends the 3 KB WAAPI build when page weight and hardware-accelerated CSS animation matter; the 10 KB JavaScript engine is intended for complex timelines, broad callbacks, and non-WAAPI properties. The requested quote motion can remain on the smaller WAAPI path.
- External documentation is treated as untrusted research data; no instruction from fetched pages is executed directly.

## Project context

- The repository is a Next.js 16.2.9 application with React 19, Auth.js, Drizzle, Neon/PostgreSQL, Base UI, Tailwind CSS 4, and Vitest.
- The current `main` matches `origin/main`; the only working-tree addition is this task's dedicated planning directory.
- The existing v0.2 planning files remain active and contain historical implementation context, so this work uses a separate planning directory.
- Authentication currently conditionally enables Microsoft Entra ID and Google OAuth in production, plus a console-only email magic-link provider outside production. The sign-in page always renders the email form and then lists discovered OAuth providers.
- The requested Google-only behavior therefore requires both server provider narrowing and a sign-in UI change; otherwise hidden providers could remain callable by provider ID.
- The existing Plan actions menu exposes one JSON `Export plan` command implemented by `downloadPlan()` in `src/lib/planIO.ts`; the plan snapshot includes placements, program profile, study-away sites, completion state, custom courses, fulfillment facts, warnings, and entry year.
- Admin is a protected server page composed from independent admin panels and reusable `requireAdminUser()` route gates. The schema already has a notification table for per-user correction events, but no global announcement model.
- The inspiration strip is a client component with a skyline image, session-persisted quote selection, an `aria-live="polite"` blockquote, and an `Another thought` button. Quote switching is currently immediate.
- Plan derivation is already centralized in `PlanDerivedProvider`, while persisted export is centralized in `planIO`. A presentation-neutral export model can be built once from the validated snapshot, catalog-resolved courses, and derived progress, then rendered independently to JSON, XLSX, and PDF.
- Existing E2E coverage treats import/export/reset as one named Plan actions menu. The least disruptive UX is to keep that menu and replace the single export item with a labeled export group or submenu.
- Announcement persistence will require a new Drizzle migration because neither the global notification table nor current admin rule tables model broadcast lifecycle or per-browser dismissal.
- ExcelJS's official repository supports writing styled XLSX workbooks; jsPDF and jsPDF-AutoTable officially support client-side PDF generation and data-driven tables. Dynamically importing these only when the user selects an export avoids adding them to the planner's initial route payload and keeps signed-out plan data local to the browser.
- The derivation layer already exposes semester placements/credits, catalog-resolved course details, program/category progress, and warnings. This is sufficient for a shared export view model with semester schedule, Program Profile, degree-progress summary, and advisement warnings without reimplementing planner logic.
- Current registry versions verified during planning are Anime.js 4.5.0, ExcelJS 4.4.0, jsPDF 4.2.1, and jsPDF-AutoTable 5.0.8.
- Next.js 16's installed guidance confirms that browser APIs and event-driven exports belong in narrowly scoped Client Components, while database-backed announcement reads/mutations belong in Route Handlers. Client-only export libraries must be dynamically imported so they do not join the initial PlannerHeader client graph.
