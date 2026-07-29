# Findings

## Root cause

- `areaSubheader` rows are treated as semantic group starts even when they are only headings.
- Non-directive subheaders fall through to `explicitRowNode()`, whose fallback is `manualConfirmation`.
- Table association uses the first section heading instead of the nearest preceding heading, so concentration tables lose names such as Finance and Marketing.
- Validator warnings for manual confirmations do not block publication.
- Progress renders every `manualConfirmation` as an actionable student evidence row.

## Measured impact

- The checked-in fallback contains 43 programs; 41 contain manual-confirmation nodes.
- It contains 467 manual-confirmation nodes, including structural headings and selection-like text.
- Data Science contains generic `Course List` categories and disconnected concentration headings.
- The deployed catalog correctly interprets some selectors, including MATH-SHU 235 versus MATH-SHU 238, but still exposes selector and concentration structures as manual confirmations.

## Product conclusion

The source-faithful table representation must be an independent, durable read model. Automatic progress is a verified projection of that model, not the only representation of Bulletin requirements.

## Sample plan source research

- The Computer Science BS Bulletin page contains a separate `Sample Plan of Study` section adjacent to the curriculum.
- It contains eight ordered semester/term groups, term credit totals, and a 128-credit total.
- Rows include both exact linked courses and non-course placeholders such as `Chinese or EAP`, `Core Class`, `Computer Science Elective`, `General Elective`, and `Pre-Capstone Elective Course`.
- Exact-course rows can be mapped to catalog records; placeholder rows must remain planning slots and cannot be invented as concrete courses.
- The existing program parser already exposes a preliminary `samplePlan` with terms and rows, so the new design can strengthen that model instead of introducing an unrelated scraper.
