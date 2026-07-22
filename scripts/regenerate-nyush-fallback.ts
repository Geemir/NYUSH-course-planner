/**
 * Re-scrapes the NYU Shanghai Bulletin with the current parser and rewrites the
 * checked-in recovery catalog `src/data/catalog-fallback.json` (used by
 * `npm run db:seed`). Pure/read-only against the database — it only fetches the
 * live Bulletin and writes the file atomically — so it does NOT disturb an
 * active multi-source catalog release in the dev DB.
 *
 *   npx tsx --conditions=react-server scripts/regenerate-nyush-fallback.ts
 *
 * Run this after changing the requirement parser (e.g. pool-selection semantics)
 * so the seeded NYUSH programs match the corrected engine output.
 */
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { discoverBulletinSources } from "@/lib/bulletin/discover";
import { normalizeBulletin, type BulletinDocument } from "@/lib/bulletin/normalize";
import { parseCoursePage } from "@/lib/bulletin/parseCoursePage";
import { parseProgramPage, type BulletinProgramPageSource } from "@/lib/bulletin/parseProgramPage";
import { validateCatalogCandidate, assertPublishable } from "@/lib/bulletin/validateSnapshot";
import { writeCatalogFallback } from "./generate-catalog-fallback";

const CORE_SOURCE = {
  kind: "core",
  slug: "core-curriculum",
  title: "Core Curriculum",
  url: "https://bulletins.nyu.edu/undergraduate/shanghai/core-curriculum/",
} as const satisfies BulletinProgramPageSource;

async function main() {
  const fetcher = createBulletinFetch({
    timeoutMs: 30_000,
    retries: 2,
    userAgent: "NYUSH Course Planner Bulletin Synchronizer",
  });
  const started = Date.now();
  const discovery = await discoverBulletinSources(fetcher);
  const programSources = [...discovery.majors, ...discovery.minors];
  const sources = [...programSources, ...discovery.subjects, CORE_SOURCE];
  const fetched = new Map<string, string>();
  for (const source of sources) fetched.set(source.url, await fetcher(source.url));

  const documents: BulletinDocument[] = [
    ...programSources.map((source) => parseProgramPage(fetched.get(source.url)!, source)),
    ...discovery.subjects.map((source) =>
      parseCoursePage({ source: discovery.source, sourceUrl: source.url, html: fetched.get(source.url)! }),
    ),
    parseProgramPage(fetched.get(CORE_SOURCE.url)!, CORE_SOURCE),
  ];

  const candidate = normalizeBulletin(discovery, documents);
  assertPublishable(validateCatalogCandidate(candidate));

  await writeCatalogFallback({
    snapshot: { id: candidate.snapshotId, sourceHash: candidate.sourceHash, kind: "bulletin" },
    courses: candidate.courses,
    programs: candidate.programs,
    rules: [],
  });

  const poolNodes = countPoolNodes(candidate.programs);
  console.log(
    `Wrote ${candidate.courses.length} courses and ${candidate.programs.length} programs ` +
      `(${poolNodes} choose/credits pool nodes) in ${((Date.now() - started) / 1000).toFixed(0)}s.`,
  );
}

// Sanity signal: the old parser produced 0 pool nodes (everything flat).
function countPoolNodes(programs: readonly { categories: { requirement: unknown }[] }[]): number {
  let count = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const kind = (node as { kind?: string }).kind;
    if (kind === "choose" || kind === "credits") count += 1;
    const children = (node as { children?: unknown[] }).children;
    if (Array.isArray(children)) children.forEach(walk);
    const child = (node as { child?: unknown }).child;
    if (child) walk(child);
  };
  programs.forEach((program) => program.categories.forEach((category) => walk(category.requirement)));
  return count;
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
