# Editing degree requirements by hand

The program requirements shown on the **Progress** page are **auto-extracted
from the NYU Bulletin by an LLM**. That extraction is frequently wrong — the most
common failure is a "choose 2 of these" pool being read as "take all of these"
(this is why the NYU Shanghai **Core Curriculum** shows dozens of courses as
required). The Bulletin also changes between catalog years. Treat the Progress
page as a *visualization*, not an official audit, and fix requirements by hand
when you spot a mistake.

## Where the requirements live

All catalog requirements are stored in one checked-in file:

```
src/data/catalog-fallback.json
```

Its shape is `{ courses, programs, rules, snapshot }`. You want the **`programs`**
array. Each program has a stable `id` (e.g. `computer-science-bs`, `core`,
`data-science-minor` — full list at the bottom) and a list of `categories`:

```jsonc
{
  "id": "computer-science-bs",
  "name": "Computer Science (BS)",
  "categories": [
    {
      "id": "major-requirements",
      "name": "Major Requirements",
      "requirement": { /* <-- this is what you edit */ }
    }
  ]
}
```

Only the **`requirement`** tree of a category controls what the engine checks.
Everything else (`sourceRows`, `requirementRows`, `provenance`, …) is Bulletin
provenance metadata — leave it alone; it doesn't affect the checks.

## The requirement tree (`RequirementNode`)

A `requirement` is a tree built from these node kinds (defined in
[`src/lib/types.ts`](../src/lib/types.ts)):

| Node | Meaning | Shape |
|------|---------|-------|
| **course** | one specific course is required | `{ "kind": "course", "courseId": "CSCI-SHU 101" }` |
| **all** | every child is required | `{ "kind": "all", "children": [ … ] }` |
| **choose** | pick **N** of the children | `{ "kind": "choose", "count": 2, "children": [ … ] }` |
| **credits** | earn **N credits** from the children | `{ "kind": "credits", "minimum": 8, "children": [ … ] }` |
| **any** | satisfy any one child | `{ "kind": "any", "children": [ … ] }` |
| **attribute** | any course carrying an attribute tag | `{ "kind": "attribute", "attribute": "Social Science" }` |
| **manualConfirmation** | can't be a course check — you confirm it in the UI | `{ "kind": "manualConfirmation", "label": "Director approval", "sourceText": "…" }` |

Course ids are the official codes exactly as they appear in the catalog, e.g.
`"MATH-SHU 131"` (subject, a space, then the number).

### The most common fix: "take all" → "choose N"

If a category lists many courses as required but the Bulletin actually says
"select two of the following", change the top node from `all` to `choose`:

```jsonc
// BEFORE (wrong — all 5 required)
{ "kind": "all", "children": [
  { "kind": "course", "courseId": "BIOL-SHU 30" },
  { "kind": "course", "courseId": "BIOL-SHU 31" },
  { "kind": "course", "courseId": "BIOL-SHU 261" },
  { "kind": "course", "courseId": "BIOL-SHU 263" },
  { "kind": "course", "courseId": "BIOL-SHU 271" }
] }

// AFTER (choose any 2 of the 5)
{ "kind": "choose", "count": 2, "children": [
  { "kind": "course", "courseId": "BIOL-SHU 30" },
  { "kind": "course", "courseId": "BIOL-SHU 31" },
  { "kind": "course", "courseId": "BIOL-SHU 261" },
  { "kind": "course", "courseId": "BIOL-SHU 263" },
  { "kind": "course", "courseId": "BIOL-SHU 271" }
] }
```

You can nest freely — e.g. an `all` whose children are a few required `course`
nodes plus one `choose` pool.

## Applying your edits

`catalog-fallback.json` is the source the local database is **seeded** from, so
after editing you re-seed. **Stop the dev server first** (the database is
single-process — running a script while `npm run dev` is up corrupts it; the
scripts now refuse to run in that case):

```powershell
# 1. stop `npm run dev`
# 2. reload NYU Shanghai from your edited file
npm run db:seed
# 3. restart
npm run dev
```

Caveat: `db:seed` reloads **only NYU Shanghai** and clears any New York
study-away catalog you imported. To restore New York afterward, run
`npx tsx --conditions=react-server scripts/fill-ny-catalog.ts` (dev server
stopped).

If you use a hosted Postgres in production (`DATABASE_URL` set), seed against it
the same way with that env var exported.

## Regenerating from the Bulletin

To re-scrape NYU Shanghai fresh (after the parser improves, or for a new catalog
year) instead of hand-editing, run — dev server stopped:

```powershell
npx tsx --conditions=react-server scripts/regenerate-nyush-fallback.ts
```

This overwrites `catalog-fallback.json` with a fresh scrape (and will **discard
your manual edits**), so hand-edit *after* regenerating, not before.

## Tips

- Validate your JSON before seeding (a trailing comma will fail the parse). Any
  editor with JSON linting, or `node -e "require('./src/data/catalog-fallback.json')"`.
- The engine caps progress at the required amount, so an over-broad `choose`
  count (more than the children) is treated as "all of them".
- Prefer `manualConfirmation` for anything that isn't a clean course rule
  (advisor approval, placement exams, study-away petitions) — students then tick
  it off in the Progress page.

## Program ids

`biology-bs`, `biology-minor`, `business-finance-bs`, `business-marketing-bs`,
`business-minor`, `chemistry-bs`, `chemistry-minor`,
`chinese-language-literature-minor`, `chinese-language-minor`,
`computer-science-bs`, `computer-science-minor`,
`computer-systems-engineering-bs`, `computer-systems-engineering-minor`,
`core`, `creative-writing-minor`, `creativity-innovation-minor`,
`data-science-bs`, `data-science-minor`, `economics-ba`, `economics-minor`,
`electrical-systems-engineering-bs`, `electrical-systems-engineering-minor`,
`global-china-studies-ba`, `global-china-studies-minor`, `history-minor`,
`honors-mathematics-bs`, `humanities-ba`, `humanities-minor`,
`interactive-media-arts-bs`, `interactive-media-arts-minor`,
`interactive-media-business-bs`, `interactive-media-business-minor`,
`literature-minor`, `mathematics-bs`, `mathematics-minor`, `neural-science-bs`,
`neural-science-minor`, `philosophy-minor`, `physics-bs`, `physics-minor`,
`self-designed-honors-ba`, `social-science-ba`, `social-science-minor`.
