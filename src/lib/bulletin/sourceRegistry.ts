import {
  CatalogSourceDefinitionSchema,
  type CatalogSourceDefinition,
} from "@/lib/catalog/types";
import {
  BULLETIN_ORIGIN,
  BULLETIN_SHANGHAI_PATH,
} from "@/lib/bulletin/constants";

const UNDERGRADUATE_ROOT = `${BULLETIN_ORIGIN}/undergraduate/`;

// `enabled: false` for schools whose undergraduate Bulletin carries no
// undergraduate course inventory the planner can use (their listings are
// graduate/professional), so a full sync isn't blocked waiting on them.
const NEW_YORK_SOURCES = [
  ["nyu-new-york-arts-science", "College of Arts and Science", "arts-science/", true],
  ["nyu-new-york-dentistry", "College of Dentistry", "dentistry/", false],
  [
    "nyu-new-york-individualized-study",
    "Gallatin School of Individualized Study",
    "individualized-study/",
    true,
  ],
  [
    "nyu-new-york-business",
    "Leonard N. Stern School of Business",
    "business/",
    true,
  ],
  ["nyu-new-york-liberal-studies", "Liberal Studies", "liberal-studies/", true],
  [
    "nyu-new-york-public-service",
    "Robert F. Wagner Graduate School of Public Service",
    "public-service/",
    true,
  ],
  [
    "nyu-new-york-nursing",
    "Rory Meyers College of Nursing",
    "nursing/",
    true,
  ],
  [
    "nyu-new-york-global-public-health",
    "School of Global Public Health",
    "global-public-health/",
    true,
  ],
  [
    "nyu-new-york-professional-studies",
    "School of Professional Studies",
    "professional-studies/",
    false,
  ],
  [
    "nyu-new-york-social-work",
    "Silver School of Social Work",
    "social-work/",
    true,
  ],
  [
    "nyu-new-york-culture-education-human-development",
    "Steinhardt School of Culture, Education, and Human Development",
    "culture-education-human-development/",
    true,
  ],
  [
    "nyu-new-york-engineering",
    "Tandon School of Engineering",
    "engineering/",
    true,
  ],
  ["nyu-new-york-arts", "Tisch School of the Arts", "arts/", true],
] as const;

function sourceDefinition(
  id: string,
  schoolName: string,
  campus: CatalogSourceDefinition["campus"],
  bulletinRoot: string,
  includePrograms: boolean,
  enabled = true,
): CatalogSourceDefinition {
  return CatalogSourceDefinitionSchema.parse({
    id,
    schoolName,
    campus,
    bulletinRoot,
    courseIndexUrl: `${bulletinRoot}courses/`,
    includePrograms,
    enabled,
  });
}

export const CATALOG_SOURCES: readonly CatalogSourceDefinition[] = [
  sourceDefinition(
    "nyu-shanghai",
    "NYU Shanghai",
    "shanghai",
    `${BULLETIN_ORIGIN}${BULLETIN_SHANGHAI_PATH}`,
    true,
  ),
  ...NEW_YORK_SOURCES.map(([id, schoolName, root, enabled]) =>
    sourceDefinition(
      id,
      schoolName,
      "new-york",
      `${UNDERGRADUATE_ROOT}${root}`,
      false,
      enabled,
    ),
  ),
];

const SOURCES_BY_ID = new Map(
  CATALOG_SOURCES.map((source) => [source.id, source] as const),
);

export function getCatalogSource(sourceId: string): CatalogSourceDefinition {
  const source = SOURCES_BY_ID.get(sourceId);
  if (!source) throw new Error(`Unknown catalog source: ${sourceId}`);
  return source;
}
