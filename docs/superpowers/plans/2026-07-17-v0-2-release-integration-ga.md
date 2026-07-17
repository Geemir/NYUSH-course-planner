# v0.2 Release Integration and GA Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the completed v0.2 workstreams, verify all 13 New York source inventories and student/maintainer journeys against production-like infrastructure, rehearse migration and rollback, and publish accurate v0.2 documentation and quick-start commands only when every launch gate is evidenced.

**Architecture:** A traceable acceptance matrix maps the approved product specification to automated and manual evidence. Vitest/PGlite continue to cover pure, repository, migration, privacy, and failure behavior; Playwright adds a small production-build browser layer for critical user journeys. Staging source sync, migration rehearsal, rollback rehearsal, accessibility, performance, and security checks produce a dated release report. Version/docs change to 0.2.0 only after the report contains no unresolved blocker.

**Tech Stack:** Next.js 16.2.9 production build, TypeScript 5, Vitest 4, PGlite/PostgreSQL, Playwright, Chromium plus one secondary browser where available, ESLint, Drizzle migrations.

## Global Constraints

- Execute only after the five preceding v0.2 plans are complete and their focused checks pass.
- Do not weaken authentication, admin authorization, source validation, overlay policy, or revision conflict behavior to make browser tests easier.
- Browser authentication fixtures may insert test users/sessions directly into an isolated test database; no production test-login route or bypass flag may be added.
- Run Playwright against `next build` + `next start`, not only the development server.
- Run real Bulletin synchronization first against a staging/disposable database. Do not point a rehearsal at production or replace the active production release.
- Treat source data as automatically publishable only after all source-specific validation gates pass. Preserve last-known-good membership on anomalies.
- Record measured payload, query, sync, animation, and accessibility findings; do not declare performance from visual impression.
- Rollback means restoring the previous app build and active catalog release pointer without deleting immutable snapshots, correction events, overlays, or user plans.
- Keep release documentation in English to match the product.
- Follow evidence-before-claims: do not mark an acceptance row complete from code inspection alone when the row requires a runtime check.

---

## File Structure

### New release evidence and scripts

- `docs/releases/v0.2-acceptance.md`
- `docs/releases/v0.2-verification-report.md`
- `docs/releases/v0.2-rollback.md`
- `scripts/verify-v0-2-sources.ts`
- `scripts/verify-v0-2-sources.test.ts`
- `scripts/rehearse-v0-2-migration.ts`
- `scripts/rehearse-v0-2-migration.test.ts`

### New browser-test files

- `playwright.config.ts`
- `tests/e2e/support/database.ts`
- `tests/e2e/support/auth.ts`
- `tests/e2e/support/fixtures.ts`
- `tests/e2e/onboarding-profile.spec.ts`
- `tests/e2e/catalog-study-away.spec.ts`
- `tests/e2e/plan-safety.spec.ts`
- `tests/e2e/correction-hub.spec.ts`
- `tests/e2e/accessibility-responsive.spec.ts`

### Existing release files changed

- `package.json`
- `package-lock.json`
- `.gitignore`
- `README.md`
- `.env.example`
- `src/auth.providers.test.ts`

---

### Task 1: Create a traceable v0.2 acceptance matrix before final testing

**Files:**
- Create: `docs/releases/v0.2-acceptance.md`
- Create: `docs/releases/v0.2-verification-report.md`
- Create: `docs/releases/v0.2-rollback.md`

- [ ] **Step 1: Map every approved specification section to evidence**

Create `docs/releases/v0.2-acceptance.md` with one row per requirement from `docs/superpowers/specs/2026-07-17-nyush-v0-2-product-design.md`. Required columns:

```text
ID | Requirement | Automated evidence | Manual evidence | Rollback signal | Status
```

Rows must cover product boundary, 13 source inventories, last-known-good behavior, query payload, Program Profile/double major/minors, plan migration/sync/Undo, Correction Hub/privacy/overlays, Academic Glass/preferences, onboarding/Help/quote/skyline, accessibility, performance, security, documentation, and rollback.

- [ ] **Step 2: Create the verification-report template**

Include environment/commit/database identifiers, command outputs, source counts/hashes/diagnostics, migration row checks, endpoint payload timings/sizes, browser matrix, accessibility findings, security probes, known limitations, and final blocker decision. Use `Pending` rather than a pre-filled pass.

- [ ] **Step 3: Define rollback triggers and procedure**

`docs/releases/v0.2-rollback.md` must specify:

1. triggers: catalog corruption/incompleteness, data-loss migration, auth/privacy breach, unusable critical flow, or sustained error/performance regression;
2. application rollback to prior build;
3. catalog rollback by activating the previous composed release pointer in a transaction;
4. plan compatibility: v2 rows remain stored, and the v1 backup/export path is retained;
5. correction/overlay retention: never delete audit data;
6. verification after rollback and incident evidence collection.

- [ ] **Step 4: Self-review traceability and commit**

Run:

```powershell
rg -n "Pending|NYUSH|New York|Program Profile|Correction Hub|Academic Glass|rollback" docs/releases/v0.2-*.md
git add docs/releases
git commit -m "docs(release): define v0.2 launch evidence"
```

Expected: every approved spec section maps to at least one acceptance row; no row is prematurely marked Pass.

---

### Task 2: Add production-build Playwright infrastructure without an auth bypass

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `playwright.config.ts`
- Create: `tests/e2e/support/database.ts`
- Create: `tests/e2e/support/auth.ts`
- Create: `tests/e2e/support/fixtures.ts`
- Modify: `src/auth.providers.test.ts`

- [ ] **Step 1: Install Playwright test tooling**

Run:

```powershell
npm.cmd install -D @playwright/test
npx.cmd playwright install chromium
```

Expected: package/lock update and Chromium installation succeeds. Browser binaries remain outside the repository.

- [ ] **Step 2: Add scripts and production web server config**

Add:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "verify:v0.2:sources": "node --conditions=react-server --import tsx scripts/verify-v0-2-sources.ts",
    "verify:v0.2:migration": "node --conditions=react-server --import tsx scripts/rehearse-v0-2-migration.ts"
  }
}
```

Configure Playwright with `testDir: "tests/e2e"`, retries only in CI, trace on first retry, screenshots on failure, and `webServer.command: "npm run build && npm run start"`. Set isolated `DATABASE_URL`, `AUTH_SECRET`, and `ADMIN_EMAILS` through the test environment. Reuse an existing server only outside CI.

- [ ] **Step 3: Implement direct database test sessions**

`tests/e2e/support/database.ts` applies Drizzle migrations to a dedicated test database and seeds a deterministic catalog release. `auth.ts` inserts a test user and database session using the production schema, then adds the Auth.js session cookie to the Playwright context. Create student and admin states by stored user role/allowlist. Do not modify `src/auth.ts` with an E2E provider or special route.

- [ ] **Step 4: Add auth-regression tests**

Extend `src/auth.providers.test.ts` to prove production providers exclude dev magic link, non-NYU addresses are rejected, admin comes only from role/allowlist, and no environment variable named `E2E_*` changes authentication behavior.

- [ ] **Step 5: Add a browser infrastructure smoke test**

In `tests/e2e/support/fixtures.ts`, expose `studentPage` and `adminPage`. Add one minimal setup assertion in the first spec: student reaches planner, admin reaches admin page, student cannot reach admin page.

- [ ] **Step 6: Run infrastructure checks and commit**

```powershell
npm.cmd test -- src/auth.providers.test.ts --maxWorkers=1
npm.cmd run build
npm.cmd run test:e2e -- --list
git add package.json package-lock.json .gitignore playwright.config.ts tests/e2e/support src/auth.providers.test.ts
git commit -m "test(e2e): add production browser harness"
```

Expected: unit/build PASS; Playwright lists tests; no production auth bypass exists.

---

### Task 3: Cover the critical student planning journeys in Playwright

**Files:**
- Create: `tests/e2e/onboarding-profile.spec.ts`
- Create: `tests/e2e/catalog-study-away.spec.ts`
- Create: `tests/e2e/plan-safety.spec.ts`

- [ ] **Step 1: Write first-visit onboarding and Program Profile journeys**

Test English first-visit tutorial auto-open, keyboard progression/skip, Help reopening, Core always active, primary major required, second distinct major, multiple NYUSH minors, no New York degree options, header summary, and persisted reload.

- [ ] **Step 2: Write catalog/study-away journey**

Search a Shanghai course and a New York course, filter by school/subject, load another page, open stable-ID detail, verify catalog-only availability copy, place the New York course into one semester, reload outside the search query, and confirm the placed course remains hydrated.

- [ ] **Step 3: Write plan safety journey**

Test add/move/remove plus Undo/Redo, variable credits, offline edit/reload/reconnect, visible sync state, and v1 import migration with backup/resolution. Use two browser contexts to create a stale revision and assert conflict/export/use-server/keep-local paths preserve both snapshots.

- [ ] **Step 4: Make selectors semantic and deterministic**

Prefer roles, labels, and stable `data-testid` only for drag/drop or non-semantic canvas-like targets. Never select by generated CSS class, exact animation timing, or visual pixel coordinates when a semantic action exists.

- [ ] **Step 5: Run the three journeys and commit**

```powershell
npm.cmd run test:e2e -- tests/e2e/onboarding-profile.spec.ts tests/e2e/catalog-study-away.spec.ts tests/e2e/plan-safety.spec.ts
git add tests/e2e/onboarding-profile.spec.ts tests/e2e/catalog-study-away.spec.ts tests/e2e/plan-safety.spec.ts
git commit -m "test(e2e): cover v0.2 student planning"
```

Expected: PASS against the production server and isolated database.

---

### Task 4: Cover Correction Hub, authorization, responsive, and preference journeys

**Files:**
- Create: `tests/e2e/correction-hub.spec.ts`
- Create: `tests/e2e/accessibility-responsive.spec.ts`

- [ ] **Step 1: Write the student-to-maintainer correction journey**

Student reports a course issue, sees My Reports, admin sees inbox, requests information, student receives in-app notification and replies, admin approves but product data is unchanged, admin applies the typed overlay, student sees Applied plus reviewed provenance, and the archived source hash remains unchanged via a test database assertion.

- [ ] **Step 2: Add browser-level authorization probes**

Use student/admin contexts and direct HTTP requests to verify cross-user correction detail is 404, student admin API is 403, private notes never appear in student responses/DOM, and invalid transition/overlay application is rejected.

- [ ] **Step 3: Add responsive and preference smoke tests**

At mobile/tablet/desktop viewports, verify one-column semesters, header/tools, Program Profile, catalog, dialogs/sheets, reports, and correction inbox. Emulate reduced motion, forced colors where supported, and injected reduced-transparency class/media behavior. Check no horizontal document overflow at 320 px and 200% equivalent zoom.

- [ ] **Step 4: Add automated accessibility assertions without overclaiming**

If adding `@axe-core/playwright`, install it in this task and run targeted scans on planner, profile sheet, course dialog, reports sheet, and admin inbox. Also assert heading/landmark/dialog names and keyboard focus manually in the spec. Treat zero automated violations as one signal, not complete accessibility proof.

- [ ] **Step 5: Run journeys and commit**

```powershell
npm.cmd run test:e2e -- tests/e2e/correction-hub.spec.ts tests/e2e/accessibility-responsive.spec.ts
git add package.json package-lock.json tests/e2e/correction-hub.spec.ts tests/e2e/accessibility-responsive.spec.ts
git commit -m "test(e2e): cover corrections and accessibility"
```

Expected: PASS; approval-before-apply behavior is explicitly proven.

---

### Task 5: Automate source-coverage and migration rehearsals on disposable infrastructure

**Files:**
- Create: `scripts/verify-v0-2-sources.ts`
- Create: `scripts/verify-v0-2-sources.test.ts`
- Create: `scripts/rehearse-v0-2-migration.ts`
- Create: `scripts/rehearse-v0-2-migration.test.ts`
- Modify: `docs/releases/v0.2-verification-report.md`

**Source verification output:**

```ts
interface SourceVerificationRow {
  sourceId: string;
  snapshotId: string;
  status: "healthy" | "retained" | "failed";
  documentCount: number;
  courseCount: number;
  quarantinedCount: number;
  sourceHash: string;
  diagnosticCodes: string[];
}
```

- [ ] **Step 1: Write failing source-report tests**

Test exact 14-source coverage, one row per source, complete active-release membership, non-zero Shanghai programs, zero New York programs, non-zero New York course counts, no graduate/ambiguous included rows, retained-source reporting, and non-zero exit on missing/failed-without-LKG/anomalous source.

- [ ] **Step 2: Implement a read-only verification reporter**

`verify-v0-2-sources.ts` reads an already-synchronized database and emits human table plus `--json`. It must not fetch, publish, or alter status. Include active release ID and overlay conflict counts.

- [ ] **Step 3: Write failing migration rehearsal tests**

Build v0.1 fixtures with active Shanghai catalog, v1 plans, users/sessions, rules, and no correction tables. Rehearse migrations through `0006`, run v1-to-v2 application reconciliation, and assert row/payload preservation, revision defaults, Shanghai release backfill, stable IDs, and no user/session loss.

- [ ] **Step 4: Implement the disposable migration command**

The command accepts only a disposable target explicitly marked by `ALLOW_DESTRUCTIVE_MIGRATION_REHEARSAL=true` and refuses host/database names matching production configuration. It clones/loads fixture data, applies migrations, runs invariants, and exits without touching the source database.

- [ ] **Step 5: Run script tests and commit**

```powershell
npm.cmd test -- scripts/verify-v0-2-sources.test.ts scripts/rehearse-v0-2-migration.test.ts --maxWorkers=1
git add scripts/verify-v0-2-sources.ts scripts/verify-v0-2-sources.test.ts scripts/rehearse-v0-2-migration.ts scripts/rehearse-v0-2-migration.test.ts docs/releases/v0.2-verification-report.md
git commit -m "test(release): automate source and migration checks"
```

Expected: PASS; safety refusal tests cover production-like targets.

---

### Task 6: Run real staging sync, performance, security, migration, and rollback gates

**Files:**
- Modify: `docs/releases/v0.2-verification-report.md`
- Modify: `docs/releases/v0.2-acceptance.md`
- Modify: `docs/releases/v0.2-rollback.md` only if rehearsal exposes a gap

- [ ] **Step 1: Create an isolated staging database and migrate it**

Record database identifier, migration journal, application commit, and current time. Run the v0.1 fixture migration rehearsal first, then migrate an empty staging database through all migrations. Never reuse production credentials.

- [ ] **Step 2: Synchronize all Bulletin sources into staging**

Run:

```powershell
npm.cmd run bulletin:sync
npm.cmd run verify:v0.2:sources -- --json
```

Expected: Shanghai plus all 13 New York sources have healthy or explicitly retained last-known-good snapshots; the active release has complete membership; Shanghai has programs; New York sources have zero programs; no blocking validation/overlay conflict exists.

- [ ] **Step 3: Inspect source anomalies manually**

For each school, sample at least three records across low/high codes and unusual credit metadata. Compare source URL, code, title, description, credits, school, level classification, prerequisites, cross-list evidence, and catalog-only copy. Record sample URLs and findings; do not copy full copyrighted page text into the report.

- [ ] **Step 4: Measure endpoint and client performance**

Record warm/cold p50/p95 for bootstrap, common text search, filtered search, detail, and 100-ID batch on the staging dataset. Record response bytes, initial browser transfer, main-thread long tasks, catalog scroll, sheet/dialog animation, and populated-plan drag behavior. If no approved numeric SLA exists, compare against v0.1 baseline and document measured acceptance rationale rather than inventing a target after the fact.

- [ ] **Step 5: Run security/privacy checks**

Verify NYU-domain auth, non-admin denial, owner scoping, report rate limits, URL validation, SQL wildcard escaping, no arbitrary overlay paths, no private-note leakage, no stack traces/secrets in API responses, CSP/image handling where configured, and source URL boundary enforcement.

- [ ] **Step 6: Rehearse failed refresh and rollback**

Inject one source fetch failure, one count-drop anomaly, and one overlay conflict. Confirm previous source snapshot/release stays active. Then activate a new staging release, perform the documented catalog rollback transaction, deploy/start the prior application build, and verify old planner load plus retained v2/audit data.

- [ ] **Step 7: Run the complete automated gate**

```powershell
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run test:e2e
```

Expected: all exit 0.

- [ ] **Step 8: Update evidence rows honestly**

Fill the report with command timestamps/results and mark acceptance rows Pass only when their evidence is present. Any auth/privacy/data-loss/source-completeness blocker keeps GA status `Blocked`; do not downgrade it to a known limitation.

- [ ] **Step 9: Commit release evidence**

```powershell
git add docs/releases/v0.2-acceptance.md docs/releases/v0.2-verification-report.md docs/releases/v0.2-rollback.md
git commit -m "test(release): record v0.2 verification evidence"
```

Expected: report identifies exact commit and database/release IDs without secrets.

---

### Task 7: Finalize version, README, environment template, and quick-start instructions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create or modify: `.env.example`
- Modify: `docs/releases/v0.2-acceptance.md`
- Modify: `docs/releases/v0.2-verification-report.md`

- [ ] **Step 1: Write the README acceptance checklist before editing**

README must accurately cover:

- NYUSH degree-planner boundary and New York study-away catalog disclaimer;
- v0.2 features: 13 source inventories, Program Profile/double major/minors, query catalog, plan migration/sync/Undo, Correction Hub, NYU Academic Glass/onboarding;
- prerequisites and supported Node/PostgreSQL versions from the actual lock/runtime;
- first-time setup, environment, migration, sync, dev, production, test, and E2E commands;
- admin allowlist and non-official correction boundary;
- data/source attribution, skyline attribution, privacy, known limitations, troubleshooting, and rollback link.

- [ ] **Step 2: Add a safe environment template**

`.env.example` includes placeholders for database, Auth.js secret, OAuth provider options, admin emails, and documented staging verification settings. It must contain no real secrets, tokens, email addresses beyond example domains, or production hostnames.

- [ ] **Step 3: Set version 0.2.0**

Run:

```powershell
npm.cmd version 0.2.0 --no-git-tag-version
```

Expected: `package.json` and lockfile show `0.2.0`.

- [ ] **Step 4: Document copy/paste quick starts**

Development:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run db:push
npm.cmd run bulletin:sync
npm.cmd run dev
```

Production-like verification:

```powershell
npm.cmd install
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run start
```

Document that teams with migration-managed shared databases must run reviewed Drizzle migrations rather than `db:push`; the simple `db:push` quick start is local-only.

- [ ] **Step 5: Verify every documented command/name**

```powershell
npm.cmd run
rg -n "0\.1|Albert|full catalog|future.*correction|Geist Sans" README.md package.json docs/releases
```

Expected: script names exist; stale v0.1 promises are removed or clearly historical; Albert is mentioned only as an out-of-scope/future scheduling integration where accurate.

- [ ] **Step 6: Run final gates after docs/version change**

```powershell
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run test:e2e
git status --short
```

Expected: all gates exit 0; status contains only intended release documentation/version changes.

- [ ] **Step 7: Commit the release handoff**

```powershell
git add package.json package-lock.json README.md .env.example docs/releases
git commit -m "docs(release): prepare NYUSH Planner v0.2"
```

Expected: v0.2 is documented accurately, but no deployment/tag/push occurs without separate user authorization.

---

### Task 8: Final no-placeholder, no-regression, and release-decision review

**Files:**
- Modify only when correcting a verified issue.

- [ ] **Step 1: Search for unfinished implementation markers in v0.2-owned files**

```powershell
rg -n "TODO|FIXME|HACK|placeholder|not implemented|coming soon" src tests scripts docs/releases README.md
```

Expected: no unresolved marker in a GA-critical path. Legitimate historical/planning references are reviewed individually.

- [ ] **Step 2: Review the complete commit range and migration order**

```powershell
git log --oneline --decorate -40
Get-Content -LiteralPath drizzle/meta/_journal.json
git status --short
```

Expected: migrations are ordered and present, task commits are scoped, and the working tree is clean.

- [ ] **Step 3: Confirm the approved product boundary in the live build**

Verify there is no New York degree selector/audit, no current-offering claim from Bulletin, no official-NYU implication in Correction Hub, and no Apple trademark/font imitation. Verify NYU colors, English UI, one-column planner, Help/onboarding, random interest quote, and skyline remain.

- [ ] **Step 4: Make the release decision from evidence**

Mark the verification report `Ready for GA` only if every blocker row passes. Otherwise mark `Blocked`, list the exact failed acceptance IDs and remediation owner, and do not tag/deploy.

---

## Completion Criteria

- Every approved v0.2 requirement has traceable automated/manual evidence and a rollback signal.
- Playwright runs critical student/admin journeys against a production build without a production auth bypass.
- A staging sync verifies Shanghai plus all 13 New York sources, undergraduate-only inclusion, complete release membership, and last-known-good behavior.
- v0.1-to-v0.2 migration preserves catalog, plans, users, sessions, rules, and backups; optimistic revisions and new tables are correct.
- Correction privacy, authorization, audit, and overlay immutability pass adversarial checks.
- Accessibility, responsive, preference, payload, query, motion, and drag performance findings are recorded and accepted.
- Application and catalog rollback are rehearsed without deleting immutable or user data.
- README, environment template, attribution, version 0.2.0, and quick-start instructions are accurate.
- Full tests, lint, typecheck, build, and E2E pass on the exact release commit.
- No deploy, tag, or push occurs without separate user authorization.

## Final Handoff

When every acceptance row is Pass, use the `verification-before-completion` skill to verify fresh command output, then use `requesting-code-review` and `finishing-a-development-branch` for integration choices. If any blocker remains, report it as blocked with evidence rather than calling v0.2 complete.
