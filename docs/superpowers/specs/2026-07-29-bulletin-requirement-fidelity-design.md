# Bulletin Requirement Fidelity and Verified Progress Design

## Purpose

The NYUSH degree planner must never present a parser guess as an official degree requirement. The current pipeline can turn structural Bulletin rows such as `Select one of the following: 4`, section headings, and concentration labels into student-actionable manual confirmations. It can also disconnect a selector from the course rows or tables that it governs. Those failures make the Progress surface unsuitable as an authoritative planning aid.

This change establishes two independent products derived from the same NYU Shanghai Bulletin source:

1. a source-faithful requirement view that is the default student experience; and
2. a verified executable interpretation used for automatic progress calculations.

The source-faithful view remains useful even when the planner cannot safely interpret a requirement. Unsupported or ambiguous structures reduce automation coverage; they never become invented student obligations.

## Scope

This design covers NYU Shanghai Core, major, and minor requirement pages, adjacent Sample Plan of Study sections, their normalized catalog records, publication validation, the Degree Progress requirement UI, fallback data, and production rollout to Neon and Vercel.

It makes one additive, backward-compatible extension to Plan v2 for sample-plan placeholders. It does not change New York study-away course discovery, user authentication, advisor policy, or the correction workflow. It does not attempt to infer undocumented substitutions, advisor exceptions, elective choices, language placement, or future course availability.

## Source of truth and trust model

The NYU Bulletin is trusted as source content. The parser is not trusted as an interpreter until it proves that its output preserves the source structure and satisfies deterministic semantic invariants.

Every requirement table therefore produces two linked artifacts:

- `bulletinDisplay`: a loss-minimized representation of headings, rows, course links, credits, footnotes, and order; and
- `requirementInterpretation`: a typed requirement tree plus verification metadata.

`bulletinDisplay` is the default UI source. `requirementInterpretation` may drive progress only when its status is `verified`. A table or group that cannot be interpreted is marked `unavailable`, retains its original display rows, and contributes no automatic completion claim.

## Source-faithful document model

The parsed program document gains an explicit hierarchy instead of flattening every table into a section:

```ts
type BulletinRequirementDocument = {
  schemaVersion: 2;
  sourceUrl: string;
  sections: BulletinRequirementSection[];
};

type BulletinRequirementSection = {
  id: string;
  heading: string;
  blocks: Array<BulletinHeadingBlock | BulletinProseBlock | BulletinTableBlock>;
};

type BulletinTableBlock = {
  id: string;
  caption: string | null;
  headingTrail: Array<{ level: 2 | 3 | 4 | 5 | 6; text: string }>;
  rows: BulletinDisplayRow[];
};

type BulletinDisplayRow = {
  sourceIndex: number;
  role: "heading" | "directive" | "course" | "note" | "total";
  text: string;
  creditsText: string | null;
  linkedCourseCodes: string[];
  sourceAnchors: string[];
  footnoteMarkers: string[];
};
```

The parser records the nearest preceding heading trail for each table, not only the first heading in the containing section. This preserves concentration names such as Finance, Marketing, and Economics. Blocks retain DOM order so the UI can reproduce the Bulletin's narrative and table relationships.

The display model preserves official text, course titles, course codes, credit cells, links, footnote markers, and ordering. It does not copy unrelated navigation or decorative page markup. Rendering uses application components and styles rather than injecting Bulletin HTML.

## Sample Plan of Study model

When a program page contains a Sample Plan of Study, it is parsed as another source-faithful block adjacent to the curriculum. It is advisory content and is not compiled into the degree-requirement AST.

```ts
type BulletinSamplePlan = {
  sectionId: string;
  heading: string;
  terms: BulletinSamplePlanTerm[];
  totalCreditsText: string | null;
  importStatus: "eligible" | "display-only";
  diagnostics: RequirementDiagnostic[];
};

type BulletinSamplePlanTerm = {
  sourceIndex: number;
  heading: string;
  ordinal: number | null;
  creditsText: string | null;
  rows: BulletinSamplePlanRow[];
};

type BulletinSamplePlanRow =
  | {
      kind: "course";
      sourceIndex: number;
      text: string;
      creditsText: string | null;
      linkedCourseCodes: string[];
      sourceAnchors: string[];
    }
  | {
      kind: "placeholder";
      sourceIndex: number;
      label: string;
      creditsText: string | null;
    };
```

Rows with a linked, canonical course code are exact course rows. Text such as `Chinese or EAP`, `Core Class`, `Computer Science Elective`, `General Elective`, and `Pre-Capstone Elective Course` is a placeholder. A placeholder is preserved verbatim and is never resolved to a concrete course by the importer.

Term headings, row order, linked courses, row credits, term totals, and the overall total are preserved. Import is eligible only when term ordinals map unambiguously to the planner's eight standard semesters. A nonstandard but structurally intact sample plan remains displayable with `display-only` status.

## Row classification

DOM classes remain useful evidence but no longer define semantics by themselves. Classification is performed in two stages.

First, structural parsing maps each source row into a display role:

- a heading names a region and is never actionable;
- a directive defines how following rows or groups are selected;
- a course is a linked or explicitly coded course option;
- a note preserves explanatory source text;
- a total reports source credits and terminates the applicable group.

Second, semantic compilation interprets a recognized directive grammar. Supported examples include `Select one of the following`, `Select two of the following`, `Choose one`, credit-based elective directives, and `Complete one of the following Concentrations`. The numeric value in the Bulletin credit column is not treated as a course count.

A directive governs the immediately following eligible rows or named subgroups until the next boundary at the same or higher structural level, the next directive, an applicable total, or the end of its table group. A heading between a directive and its options may name the group without becoming a requirement node.

Unknown text does not fall through to `manualConfirmation`. It becomes a non-actionable display row and makes the corresponding interpretation group unavailable.

## Executable requirement interpretation

The existing requirement AST remains the calculation language for verified groups: `course`, `all`, `any`, `choose`, `credits`, `attribute`, `exclusion`, `waiver`, and `manualConfirmation`.

Compilation follows these rules:

- `Select one` over two courses compiles to `choose(count: 1, children: [...])`.
- `Select two` compiles to `choose(count: 2, children: [...])`.
- A named concentration compiles as a group whose children come from the table associated with that concentration heading.
- `Complete one of the following Concentrations` compiles to `choose(count: 1)` over the named concentration groups.
- A plain heading produces no requirement node.
- A descriptive note produces no requirement node unless it contains a supported, explicit rule.
- `manualConfirmation` is reserved for a genuine non-course condition that a student or advisor can attest to, such as documented advisor approval, placement, proficiency, petition, or another explicit Bulletin condition. It is never a generic parser fallback.
- A recognized rule with missing children, unresolved group references, inconsistent credits, or an unsupported construction is `unavailable`, not partially executable.

Each compiled group carries source references and a verification result:

```ts
type RequirementInterpretation = {
  status: "verified" | "unavailable";
  requirement: RequirementNode | null;
  sourceTableIds: string[];
  sourceRowRefs: Array<{ tableId: string; sourceIndex: number }>;
  diagnostics: RequirementDiagnostic[];
};
```

The requirement evaluator accepts only a non-null, verified tree. This makes the trust boundary explicit and prevents UI code from accidentally calculating against an unavailable interpretation.

## Category construction and naming

Category names come from the nearest meaningful heading or explicit source label. Generic captions such as `Course List` may be retained as display metadata but cannot be published as final category names.

Related tables may form one category when the source explicitly binds them, as with a concentration selector followed by named concentration tables. The normalizer resolves those references using preserved heading hierarchy and DOM order. It does not merge unrelated tables merely because they share a section container.

Every published executable category must map back to one or more source tables and every governed source course row must map to exactly one position in the interpreted tree. Display-only notes and headings are exempt but remain traceable.

## Default Degree Progress experience

The requirement panel defaults to a `Bulletin requirements` view. It reproduces the official section and table hierarchy using accessible application-native tables or stacked mobile rows. Students see source wording, course code and title, credits, selection directives, footnotes, and a link to the exact Bulletin page.

Verified course rows receive planner annotations such as `Completed`, `Planned`, or `Not planned`. Directive and heading rows remain explanatory and never show `Mark as fulfilled`.

If an entire program is verified, the existing progress percentage may be shown normally. If any required group is unavailable:

- the UI does not present a whole-program percentage as authoritative;
- any partial number is labeled `Verified requirements only` and includes automation coverage;
- the unavailable group says `Planner interpretation unavailable — follow the Bulletin table and confirm with your advisor`;
- the original rows remain visible and usable for planning;
- no manual completion button is synthesized.

A secondary `Planner interpretation` view may expose the compiled grouping for debugging and transparency. It is labeled `Beta` until every supported Shanghai program passes the certification suite. It is not the default view.

Existing manual status overrides remain available only at the category level and are visibly labeled as student planning notes. They do not convert an unavailable interpretation into an official calculated result.

## Sample study plan experience

Programs with a source sample plan show a `Sample study plan` section immediately after their Bulletin requirements. It reproduces the official semester order, courses, placeholders, term credits, and total credits. The section states that it is an illustrative sequence rather than a personalized audit or guarantee that a course will be offered in that term.

An import-eligible plan provides a `Use this sample plan` action. The action always opens a preview before changing the student's plan. Preview rows are classified as:

- `Add`: an exact course that is not yet planned;
- `Keep`: an exact course already in the recommended semester;
- `Conflict`: an exact course already planned in another semester;
- `Placeholder`: an unresolved planning slot copied from the Bulletin; or
- `Unavailable`: an exact source course that cannot be resolved in the active catalog.

The default selection adds `Add` courses and `Placeholder` slots. `Keep` rows make no change. A `Conflict` defaults to keeping the student's existing semester; the student may explicitly choose to move it to the sample-plan semester. `Unavailable` rows remain visible and cannot be selected. Existing courses and slots are never deleted or overwritten by applying a sample plan.

Exact courses resolve by canonical official code against the active release, preferring the Shanghai source record referenced by the Bulletin row. If no record or more than one equally valid record remains, the preview classifies the row as `Unavailable` instead of guessing. Reapplying the same sample plan is idempotent: existing placements are kept or conflicted, and existing source-keyed placeholders are not duplicated.

The preview shows resulting credits and existing overload, prerequisite, offering-term, and study-away warnings per semester. Warnings inform the choice but do not silently alter it. Applying the selected rows is one atomic planner-history operation named `Apply sample study plan`, so one Undo restores the exact prior plan.

Import maps sample-plan term 1 through 8 to `Y1F`, `Y1S`, `Y2F`, `Y2S`, `Y3F`, `Y3S`, `Y4F`, and `Y4S`. The student's start year affects rendered calendar labels, not this ordinal mapping. Sample plans never change start year, completed semesters, study-away sites, active programs, fulfillment evidence, or manual requirement overrides.

## Persisted planning slots

Sample-plan placeholders are first-class plan data rather than fake courses:

```ts
type PlanningSlot = {
  id: string;
  sourceKey: string;
  semesterId: SemesterId;
  label: string;
  credits: number | null;
  source: {
    kind: "bulletin-sample-plan";
    programId: string;
    catalogReleaseId: string;
    sectionId: string;
    termSourceIndex: number;
    rowSourceIndex: number;
  };
};
```

`sourceKey` is deterministically derived from program, source section, term ordinal, source row identity, and normalized source label. It is used for import deduplication and release reconciliation; `id` remains the user-plan entity identity.

Plan v2 gains `planningSlots` with a schema default of `[]`; the wire version remains 2. Slots persist in local state, cloud snapshots, JSON import/export, Excel, and PDF. Older plans load with no slots, and older v2 payloads remain valid.

Slots appear on the planner board with a distinct visual treatment and a `Choose course` action that opens the catalog with relevant requirement text as a search hint. Choosing a course places it in the same semester and removes that slot in one undoable transaction. Users may also edit a slot label or remove it. Slot credits contribute to projected workload as tentative credits but never to completed degree requirements.

## Mobile and accessibility behavior

On narrow screens, each Bulletin table becomes a stacked sequence that preserves row order and visual grouping. Course code, title, and status remain together; credit values align consistently; directives span the full width. Desktop uses semantic table markup where the source structure permits it.

Headings follow a valid hierarchy, table captions are available to assistive technology, status is never communicated by color alone, links and controls meet the existing touch-target standard, and long official text wraps without horizontal page scrolling. Reduced motion behavior is unchanged because this feature does not require decorative animation.

On mobile, sample terms use the same stacked semester presentation as requirements. The preview uses a full-height responsive dialog or sheet with a persistent summary and apply action; conflict choices remain keyboard- and touch-accessible.

## Publication validation

Requirement validation becomes a release gate rather than a warning-only report. A Shanghai snapshot is not publishable when any of these conditions occurs:

- text beginning with a supported `Select`, `Choose`, or `Complete one of` directive becomes `manualConfirmation`;
- a selector has no eligible children or requests more children than exist;
- a course row governed by a verified group is absent from the AST or mapped more than once;
- a concentration selector cannot resolve every named concentration to a table group;
- a final category uses an empty or generic `Course List` name;
- source row order, table count, heading association, credit text, or course links are not preserved in `bulletinDisplay`;
- a verified tree contains unresolved course IDs without an explicit supported external-course rule;
- calculated category credits conflict with an explicit source total outside a documented tolerance;
- an unknown construction is emitted as executable instead of unavailable;
- a `manualConfirmation` lacks a recognized non-course condition classification and direct source-row reference; or
- a program's manual-confirmation set differs from the exact hand-reviewed set recorded in its golden fixture.

Unavailable interpretations are allowed in a parser-development candidate but block activation of the production Shanghai snapshot. This keeps the current active release intact while diagnostics are repaired. There is no publication override that can silently accept an unavailable group or relabel it as verified.

For sample plans, publication also fails when a detected source section loses a term, changes row order, drops a linked course or placeholder, or fails to preserve source credit totals. A faithfully preserved nonstandard plan may publish as `display-only`. Import eligibility fails closed when term ordinals are missing or duplicated. An unresolved exact course row is reported and excluded from import, but it does not rewrite the row as a placeholder.

## Testing and certification

Testing has five layers.

1. Parser unit fixtures cover headings, directives, nested groups, notes, totals, footnotes, and nearest-heading association.
2. Normalizer tests cover `choose` cardinality, credit-based groups, concentration references, manual-confirmation eligibility, and fail-closed behavior.
3. Golden program fixtures cover all 43 current Shanghai programs. Each fixture records the expected table headings, row counts, category names, selector cardinalities, manual conditions, unavailable groups, and explicit credit totals. High-risk programs, including Data Science, receive hand-reviewed semantic assertions rather than broad snapshots alone.
4. UI tests prove that source rows render in order, only verified course rows receive calculated statuses, structural rows have no fulfillment action, unavailable groups suppress authoritative percentages, and mobile layouts preserve meaning.
5. Sample-plan tests cover eight-term extraction, exact-course versus placeholder classification, term mapping, preview classification, conflict defaults, duplicate prevention, unresolved courses, atomic apply/undo, slot replacement, persistence, exports, and mobile rendering.

Property-style invariants supplement examples: a `choose(n)` must have at least `n` eligible children; source row references are unique within a verified tree; headings never become executable leaves; and unknown rows never become manual confirmations.

The generated fallback and a candidate Neon snapshot are audited with a machine-readable report. Release acceptance requires:

- all expected Shanghai program pages present;
- zero selector-like manual confirmations;
- zero generic final category names;
- zero unreferenced governed course rows;
- zero unavailable interpretations for programs advertised as automatically calculated;
- all golden assertions passing; and
- Data Science rendering the MATH-SHU 235/MATH-SHU 238 choice as one-of-two and each concentration under its correct name.
- Computer Science preserving all eight sample-plan terms, their source rows and credit totals, while classifying linked courses separately from advisory placeholders.

## Data migration and rollout

The rollout is additive and preserves the active catalog until the replacement is proven.

1. Ship readers, Plan v2 defaults, and UI that understand both the current program schema and `schemaVersion: 2` source-faithful documents. Old catalog records continue to use the current view temporarily, and old plans load with `planningSlots: []`.
2. Add parser, compiler, validator, and fixture coverage behind the catalog generation path.
3. Generate a complete immutable Shanghai candidate snapshot from fresh Bulletin captures.
4. Produce and review the certification report; do not modify the active Neon release during this step.
5. Regenerate `catalog-fallback.json` from the same certified candidate.
6. Compose a new catalog release using the certified Shanghai snapshot and the existing last-known-good New York snapshots.
7. Atomically activate the new release. Do not patch individual production program JSON rows in place.
8. Run production API and browser smoke checks for Data Science, Core IPC, one minor, one concentration-heavy major, Computer Science sample-plan preview/apply/undo, and mobile Progress.
9. Retain the previous release for immediate pointer rollback.

Application deployment precedes data activation so both old and new schemas are readable throughout the rollout. Rollback reactivates the previous immutable release; it does not reconstruct records or delete the failed candidate and diagnostics.

## Observability and correction flow

Catalog status and admin diagnostics report interpretation coverage per program, unavailable groups, selector counts, manual-confirmation counts, and validation failures. These metrics are tied to source snapshot and release IDs.

Sample-plan diagnostics additionally report detected sections, display fidelity, import eligibility, term count, unresolved exact courses, and placeholder count.

`Report requirement` continues to open the correction workflow with program, source URL, release, table ID, and row reference. A user report may result in an overlay or parser improvement, but an overlay must pass the same executable-tree validation. Corrections never rewrite archived source rows.

## Documentation changes

`docs/REQUIREMENTS.md` must be rewritten to describe the deterministic parser/compiler, the source-faithful display model, verified versus unavailable interpretations, and the narrow definition of manual confirmation. The obsolete claim that an LLM automatically extracts requirements must be removed.

Operator documentation must include candidate generation, certification report review, release activation, smoke checks, and pointer rollback commands. The one-off Core IPC repair script remains historical tooling and is not the normal publication path.

User documentation explains that a sample plan is illustrative, how conflicts are resolved, why placeholders are not courses, and how to undo an import or replace a slot.

## Acceptance criteria

- Degree Progress defaults to a faithful Bulletin requirement presentation.
- The Data Science probability requirement visibly means one of MATH-SHU 235 or MATH-SHU 238, not two courses and not a manual confirmation.
- Data Science concentration names and tables remain connected, and choosing one concentration is represented as a group selector.
- Headings and selection instructions never offer student fulfillment actions.
- Unsupported interpretations remain readable from the source table but do not contribute to an authoritative percentage.
- A program's Sample Plan of Study is displayed after its requirements when the Bulletin provides one.
- Applying an eligible sample plan previews every change, adds exact courses and planning slots without overwriting existing work, preserves conflicting course locations by default, and can be undone in one step.
- Planning slots persist and export without being counted as completed degree requirements.
- A parser regression cannot activate a Shanghai snapshot when any publication gate fails.
- All 43 Shanghai program fixtures pass and the generated fallback matches the certified snapshot.
- Production activation and rollback preserve New York study-away data, user plans, corrections, overlays, and prior immutable releases.
