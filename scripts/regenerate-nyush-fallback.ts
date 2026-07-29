import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { discoverBulletinSources } from "@/lib/bulletin/discover";
import { normalizeBulletinSource, type BulletinDocument } from "@/lib/bulletin/normalize";
import { parseCoursePage } from "@/lib/bulletin/parseCoursePage";
import { parseProgramPage, type BulletinProgramPageSource } from "@/lib/bulletin/parseProgramPage";
import { assertPublishable, validateSourceCatalogCandidate } from "@/lib/bulletin/validateSnapshot";

const CORE_SOURCE = { kind: "core", slug: "core-curriculum", title: "Core Curriculum", url: "https://bulletins.nyu.edu/undergraduate/shanghai/core-curriculum/" } as const satisfies BulletinProgramPageSource;

export function parseCandidateArgs(args: readonly string[]) {
  const output = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
  return { output, help: args.includes("--help") };
}

export async function generateNyushCandidate() {
  const fetcher = createBulletinFetch({ timeoutMs: 30_000, retries: 2, userAgent: "NYUSH Course Planner Bulletin Synchronizer" });
  const discovery = await discoverBulletinSources(fetcher);
  const programSources = [...discovery.majors, ...discovery.minors];
  const sources = [...programSources, ...discovery.subjects, CORE_SOURCE];
  const fetched = new Map<string, string>();
  for (const source of sources) fetched.set(source.url, await fetcher(source.url));
  const documents: BulletinDocument[] = [
    ...programSources.map((source) => parseProgramPage(fetched.get(source.url)!, source)),
    ...discovery.subjects.map((source) => parseCoursePage({ source: discovery.source, sourceUrl: source.url, html: fetched.get(source.url)! })),
    parseProgramPage(fetched.get(CORE_SOURCE.url)!, CORE_SOURCE),
  ];
  const candidate = normalizeBulletinSource(discovery, documents);
  const fallback = JSON.parse(await readFile(resolve("src/data/catalog-fallback.json"), "utf8")) as { courses?: Array<{ id?: string; code?: string }> };
  const reviewedUnresolvedCourseIds = JSON.parse(
    await readFile(resolve("src/data/nyush-reviewed-unresolved-references.json"), "utf8"),
  ) as string[];
  const previousCodes = new Set((fallback.courses ?? []).map((course) => course.id ?? course.code).filter((code): code is string => Boolean(code)));
  const validationReport = validateSourceCatalogCandidate(candidate, {
    source: discovery.source,
    expectedSubjectCount: discovery.subjects.length,
    previousCourseCount: previousCodes.size,
    reviewedUnresolvedCourseIds,
  });
  return { candidate, validationReport };
}

export async function runCandidateCli(args = process.argv.slice(2)): Promise<number> {
  const options = parseCandidateArgs(args);
  if (options.help) {
    process.stdout.write("Usage: catalog:generate-nyush-candidate -- --output=<local-json-path>\n");
    return 0;
  }
  if (!options.output) throw new Error("--output is required; the checked-in fallback is never overwritten by this command.");
  const artifact = await generateNyushCandidate();
  const target = resolve(options.output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${artifact.candidate.programs.length} programs and ${artifact.candidate.courses.length} courses to ${target}.\n`);
  assertPublishable(artifact.validationReport);
  return 0;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  void runCandidateCli().then((code) => process.exit(code)).catch((error) => { console.error(error); process.exit(1); });
}
