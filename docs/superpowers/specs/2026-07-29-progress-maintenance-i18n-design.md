# Progress, Catalog Maintenance, and Simplified Chinese Design

## Product scope

This release keeps the product an NYUSH degree planner. It simplifies Degree Progress, gives students explicit manual planning evidence, turns every visible planner warning into a reportable issue, adds audited direct catalog maintenance for administrators and maintainers, and adds an in-place Simplified Chinese UI option. Official course content, Bulletin quotations, inspiration thoughts, and the Admin UI remain English.

## Progress experience

The feasibility dialog is removed from Degree Progress. The deterministic feasibility engine remains available to non-UI callers until repository-wide reference checks prove it dead.

Every concrete course row displays code and title. Titles use CSS truncation while preserving the full title through accessible text/title affordances. The existing long LLM warning becomes a short Bulletin provenance note. Manual-confirmation actions use the user-facing phrase “Mark as fulfilled”.

Each program category can carry one explicit student override: `planned` or `completed`. A completed override implies planned. Overrides never delete calculated values; the derived category exposes both calculated units and the effective units so the UI can label the result “Manual”. Clearing an override restores calculated progress. Overrides persist in local state, cloud snapshots, JSON imports/exports, Excel, and PDF.

A versioned, first-visit Progress guide explains remaining requirements, calculated versus manual status, and Bulletin verification. It opens when the Progress surface is actually visited, not merely mounted behind a closed mobile sheet. It can be reopened from the Progress header.

## Warning reporting

Progress warning rows and course warning controls in the plan open the existing issue-report dialog with a structured `planner-warning` context containing warning kind, course, semester, message, and catalog release. Dismiss and report remain independent actions.

## Catalog maintenance

Bulletin snapshots stay immutable. Direct edits publish immediately as active overlays. `catalogOverlay` gains a nullable correction request, an origin (`correction` or `direct`), and a human reason. A separate append-only overlay event table records create, revert, and restore actions.

Course overlays can change title, description, credit range, prerequisite text, attributes, cross-list IDs, normalized offering terms, and offering source text. A course tombstone hides a record from catalog search, detail lookup, bootstrap caches, and planning matches without deleting source truth.

Requirement overlays upsert or remove a complete catalog category. The visual editor produces schema-valid trees containing course, all, any, choose, credits, attribute, exclusion, waiver, and manual-confirmation nodes. Reverting an overlay restores the Bulletin-derived category. Release reconciliation rejects stale or structurally conflicting direct overlays rather than silently losing them.

Both `admin` and `maintainer` roles may use catalog maintenance. Existing correction decisions, announcements, and release administration remain admin-only. Authorization is enforced in every mutation Route Handler.

## Localization and header

The planner uses a typed client dictionary with `en` and `zh-CN`. English remains the default; the chosen locale is persisted locally and reflected on the document `lang` attribute. No locale URL prefix is introduced.

The root provider is thin and does not wrap Admin copy in translation calls. The header order is exactly: NYU Violets logo, language control, remaining navigation/account actions. The text product name and graduation-cap tile are removed. The supplied transparent wordmark is optimized under `public` and rendered with `next/image` using intrinsic dimensions.

## Accessibility and responsive behavior

All new controls have 44px touch targets where space permits, keyboard-accessible menus/dialogs, visible focus, semantic status labels, and reduced-motion behavior. Mobile Progress opens from the existing sheet trigger; the guide uses a responsive dialog/sheet layout. Admin tree editing stacks controls vertically below the small breakpoint.

## Compatibility

Plan v2 remains the wire version; new arrays use schema defaults so older exports and stored JSON continue to load. Existing correction overlays are interpreted as `correction` origin. Database migration changes are additive except that `catalogOverlay.requestId` becomes nullable.

