# Progress, Admin Maintenance, and Simplified Chinese

## Goal

Deliver the complete requested product update without weakening the NYUSH degree-planning model or mutating immutable Bulletin source snapshots.

## Current phase

1. **Discovery and architecture clarification** — in progress
2. Design alternatives and recommendation — pending
3. User approval of the product/technical design — pending
4. Detailed TDD implementation plan and isolated worktree — pending
5. Implementation — pending
6. Verification, accessibility/mobile QA, and safe integration — pending

## Required outcomes

- Remove the Progress “Check feasibility” surface.
- Clarify Progress course/status UX and support manual category planned/completed states.
- Add first-visit Progress guidance with Bulletin provenance guidance.
- Allow warnings in Plan and Progress to open a prefilled issue report.
- Add direct admin/maintainer course and requirement maintenance, including deletion semantics and auditability.
- Add Simplified Chinese for primary product UI while preserving course names, verbatim Bulletin text, thoughts, and Admin in English.
- Add a top-left language control and replace the text product name with the supplied NYU Violets logo.
- Preserve responsive/mobile behavior and reduced-motion/accessibility support.

## Decisions

- **Confirmed:** direct admin/maintainer saves publish immediately through audited, reversible overlays; Bulletin source snapshots remain immutable.

## Decisions included in the recommended design

- Exact semantics and precedence of manual category “planned” and “completed” overrides.
- Translation coverage boundaries for secondary account/correction surfaces.
- Logo crop/render treatment for desktop and mobile.

## Constraints

- Existing Bulletin releases and source rows are immutable.
- Existing active overlays are composed at repository read time and reconciled across Bulletin releases.
- Admin UI remains English.
- Do not translate official course content, Bulletin quotations, or inspiration thoughts.
- Follow repository-specific Next.js documentation before implementation.
- Production code changes begin only after design approval.
