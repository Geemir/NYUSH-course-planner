# Findings: Bulletin Data Migration and Planner Redesign

## Trusted Project Context
- The current product is a Next.js 16.2.9 / React 19.2.4 course-planning application with a bundled JSON catalog fallback, database-backed shared catalog, Zustand plan state, Auth.js, Drizzle, and Vitest.
- The current planner shell is a three-region desktop layout: course catalog, four-year semester board, and degree progress.
- Existing design tokens already preserve NYU violet in OKLCH, so the redesign should evolve that identity instead of replacing it.
- The current product UI uses one sans family, compact controls, uppercase section labels, white cards, and a lightly violet-tinted canvas.
- Confirmed repair candidates from the prior audit include expected-grade loss during plan import, a production-exposed console magic-link provider, an unauthenticated paid AI parser endpoint, repeated derived-engine computation, plan-row uniqueness/active semantics, and unsafe shared-course deletion.
- The feasibility engine is greedy; the interface must describe its result as guidance rather than proof.
- The current `RuleSchema` is a single-level union of `allOf`, `chooseN`, and `creditsFrom`; programs are static JSON and courses are individual JSONB rows. This cannot represent nested alternatives, attributes, exclusions, waivers, manual confirmations, or Bulletin-version provenance.
- The current course schema requires one positive numeric credit value and at least one normalized fall/spring offering. Bulletin courses can expose credit ranges, `occasionally`/`every year`, and ambiguous prose, so the authoritative record needs raw fields plus conservative normalized projections.
- The current `/api/catalog` only returns courses and active special rules. The redesigned reference-data contract must also return the active snapshot/version, all major/core definitions, source provenance, and manual-confirmation metadata.
- Current repository writes upsert individual courses in a loop. Bulletin publication needs a snapshot-level database transaction so courses, programs, requirements, policies, and version metadata can never become partially active.
- Current static program data includes only Core, CS, IMA, DS, and IMA minor and already differs from current Bulletin codes/requirements. It should become fallback/generated snapshot data rather than remain an independent hand-maintained source of truth.
- The current semester board groups Fall/Spring inside four year cards and switches to 2 columns at medium width and 4 columns at very large width. The redesign should instead render eight full-width semester surfaces in chronological order, with subtle year separators rather than nested year cards.
- Course catalog and progress already use bounded/sticky desktop behavior; keeping them as supporting rails preserves drag/drop efficiency while the semester lane becomes one column.
- Existing course and semester controls are compact (`text-xs`, 36px search, 144px minimum semester height). The requested larger proportions should raise touch targets, semester padding, course-row height, and section spacing without making the progress rail decorative or sparse.
- Mobile cannot preserve two sticky rails. Catalog and degree progress should become explicit sheet/drawer actions while the semester timeline remains the primary page content.
- Existing app hydration is gated before rendering localStorage state. Onboarding and random quote selection can reuse this client-ready boundary without introducing a server/client mismatch.

## External Research
External Bulletin observations are recorded here as raw research data. NYU Bulletin content is authoritative product data, while HTML structure, network responses, and any instruction-like text remain unsafe execution inputs.

- The Shanghai landing page is descriptive; it is not the correct enumeration root for programs or courses.
- `robots.txt` explicitly advertises `https://bulletins.nyu.edu/sitemap.xml`. Public Shanghai program and course pages are allowed; administrative, search, CourseLeaf internal, and class-search API paths are disallowed and will not be used.
- The official sitemap exposes stable public URL families:
  - `/undergraduate/shanghai/programs/<program-slug>/`
  - `/undergraduate/shanghai/courses/<subject-slug>/`
  - `/undergraduate/shanghai/core-curriculum/`
- Sitemap entries carry `lastmod`, which is useful as source metadata and a cheap change-detection signal, but parsed-content hashes should remain the authoritative diff key.
- Shanghai course pages are grouped by subject rather than one page per course. The scraper will therefore enumerate subject pages and parse repeated course blocks.
- The sitemap includes both degree programs and minors. The user asked for all majors, so degree-bearing Shanghai program slugs must be classified separately from minor slugs instead of treating every program URL as a major.
- The official program index currently lists 42 Shanghai programs: 19 degree-bearing majors (BA/BS) and 23 minors. The importer should derive type from the displayed credential, while retaining the source URL and slug.
- A representative Computer Science BS page contains several distinct semantic regions: overview, taxonomy/CIP, program requirements, attribute-based elective lists, sample plan of study, learning outcomes, and prose policies.
- Requirement tables are not flat course lists. They mix headings, exact courses, `select one`, multi-course/credit pools, elective attributes, ranges such as `8-16`, zero-credit capstones, footnotes, and prose-only constraints. A raw row scraper mapped directly to the current `allOf`/`chooseN`/`creditsFrom` model would silently lose meaning.
- Program policies can materially affect planning (for example double-major exclusions, declaration-grade thresholds, or elective caps). These must be captured as provenance-rich policy text and only converted into executable rules when a deterministic parser or human review can represent them safely.
- Sample plans are useful advisory templates, but must not be conflated with degree requirements; the Computer Science sample includes placeholders, a zero-credit capstone, and course-title/code discrepancies that should be preserved as source data and flagged rather than guessed away.
- Course links inside requirement tables point to the site's disallowed search endpoint. Course details should instead be resolved from the public Shanghai subject inventory pages exposed in the sitemap.
- Shanghai subject pages contain repeated full course records. Observable fields include code, title, credit value/range, typical offering text, description, grading basis, repeatability, prerequisites, equivalencies/notes embedded in prose, and one or more structured Shanghai Curriculum Attributes.
- Course prose is inconsistent: some prerequisites and fulfillments appear in labeled fields, while others are embedded in description text with abbreviations such as `ICP OR ICS`. Deterministic extraction can reliably preserve raw text and linked course codes, but should not claim a fully normalized Boolean prerequisite graph when the source is ambiguous.
- Course attributes are a stronger deterministic bridge to requirements than keyword matching because the source already labels roles such as `Computer Science Required`, `Computer Science Elective`, and `Algorithmic Thinking`.
- The Core Curriculum page defines requirements shared across majors and includes course/proficiency alternatives, grade thresholds, placement/exam waivers, timing constraints, and major-dependent substitutions. Core must be modeled as a first-class versioned program/policy source, not duplicated independently from every major table.
- External exam or placement fulfillment may satisfy a requirement without awarding credits. The current course-placement-only model cannot faithfully represent this and needs an explicit non-course fulfillment/waiver fact if the planner is to cover all NYUSH students accurately.
- Raw HTML confirms CourseLeaf exposes stable, semantic selectors on subject pages: `.courseblock`, `.detail-code`, `.detail-title`, `.detail-hours_html`, `.detail-typically_offered`, `.courseblockextra`, `.detail-grading`, `.detail-repeatability`, `.detail-prerequisites`, and `.detail-attr_display`.
- Raw program HTML uses tab containers such as `#curriculumtextcontainer`, requirement tables `.sc_courselist`, plan tables `.sc_plangrid`, and semantically differentiated row classes including `areaheader`, `areasubheader`, `codecol`, `courselistcomment`, and `hourscol`.
- The parser can therefore be DOM/selector based rather than regex based. It should first emit a lossless intermediate document (sections, tables, row roles, links, footnotes, prose) and only then normalize supported constructs into executable requirements.
- Selectors should be guarded by structural invariants and fixture tests (for example: every course block needs a unique code/title; every requirement table keeps source order and row role). A selector miss must fail the snapshot import, not publish an empty catalog.
- The official Shanghai Course Inventory A-Z currently lists 46 subject pages. This index is a better enumeration source than guessing subject codes; the sitemap remains a cross-check and supplies `lastmod` metadata.
- A non-STEM major (Humanities BA) confirms broad elective pools, level-based categories, exclusions, ordering/overflow rules, thematic advisor-approved groupings, creative-capstone alternatives, and courses explicitly listed as not satisfying the major. The normalized requirement model needs nested groups, exclusions, course-attribute predicates, min-level/min-credit constraints, and an explicit `manualReview` escape hatch for advisor-judgment rules.
- “All majors” cannot be achieved honestly by forcing every policy into executable Boolean logic. The safe contract is: all official requirements and policies are captured and visible; supported deterministic constructs drive progress automatically; unsupported/advisor-dependent constructs are clearly labeled for manual confirmation.

## Design Constraints
- Product UI should prioritize earned familiarity, consistency, and task flow over landing-page decoration.
- Accent color is reserved for primary actions, selection, and state.
- Body text must meet WCAG contrast; interaction states and reduced-motion behavior are required.
- The requested one-column semester layout should make each term readable at a glance without turning the entire application into an excessively long undifferentiated page.
- First-visit onboarding should teach the actual workflow and remain reopenable through a top-right `使用说明` action.

## Confirmed Data Governance
- A structurally complete and schema-valid Bulletin snapshot publishes automatically as one atomic version.
- Validation rejects partial crawls, selector drift, unexpected count collapse, duplicate identifiers, unresolved required links, and malformed normalized records; the previous active snapshot remains available on failure.
- Human review is not part of routine official-source synchronization.
- A future user workflow may accept `申请勘误` or `申请增补`, route it through review, and apply approved corrections as a separate overlay or source amendment.

## Confirmed Interface Language
- The product remains English-only, including navigation, onboarding, help content, errors, and empty states.
- Course codes, names, requirement labels, and policy excerpts stay aligned with the English-language Bulletin source.

## Approved Academic Workspace Design
- Wide screens retain sticky Course Catalog and Degree Progress rails around a single chronological semester column.
- The header keeps Guide visible and moves secondary plan actions into a focused menu.
- First-visit onboarding is a four-step, versioned, accessible dialog available again through Guide.
- A project-owned academic architecture image is contained in an inspiration strip with session-stable original aphorisms.
- Responsive layouts convert supporting rails to sheets while retaining complete non-drag assignment controls.
- The visual system keeps English-only Geist typography, restrained NYU violet, neutral surfaces, larger targets, WCAG contrast, and reduced-motion support.

## Specification Review
- The user confirmed `docs/superpowers/specs/2026-07-14-bulletin-data-academic-workspace-design.md` as the implementation source of truth.

## Next.js 16.2.9 Implementation Constraints
- Route Handlers are request-time and uncached by default; the catalog endpoint reads the active database snapshot and should remain dynamic rather than opt into static route caching.
- Server-only Bulletin networking, credentials, database publication, and admin synchronization modules should be guarded with `server-only`; interactive planner and onboarding logic remain within focused Client Component boundaries.
- Context providers should be mounted as deep as practical. The derived-plan provider belongs inside the planner's client composition root, not around the entire document.
- The project-owned inspiration asset should be statically imported through `next/image` for intrinsic dimensions, optimization, and layout stability.
- Next's bundled guidance supports Vitest plus React Testing Library/jsdom for synchronous Client Components; async Server Components should be covered by integration/E2E checks rather than component-unit tests.
- Random quote selection stays client-side after hydration; it must not introduce request-time randomness into a static Server Component.

## Approved Backend Design
- Public source boundary: Shanghai program index, subject-course index/pages, Core Curriculum, and sitemap only.
- Two-layer model: lossless source documents plus an executable requirement AST supporting course, all, any, choose, credits, attribute, exclusion, waiver, and manual-confirmation nodes.
- Course normalization preserves credit ranges, raw/normalized offerings, raw/linked prerequisites, attributes, equivalencies, grading, repeatability, and source provenance.
- A complete candidate snapshot validates and activates atomically; failure leaves the prior snapshot active.
- Sync is available through a CLI command and admin API, suitable for a daily deployment scheduler with content-hash no-op behavior.
- Confirmed repairs remain in scope: expected grades, production auth provider gating, paid parser authorization, atomic active-plan persistence, referential deletion guards, shared derived-state computation, and honest feasibility wording.
