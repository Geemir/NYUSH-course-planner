import {
  CatalogSourceDefinitionSchema,
  type CatalogSourceDefinition,
} from "@/lib/catalog/types";
import {
  BULLETIN_ORIGIN,
  BULLETIN_SHANGHAI_PATH,
} from "@/lib/bulletin/constants";

const UNDERGRADUATE_ROOT = `${BULLETIN_ORIGIN}/undergraduate/`;

const NEW_YORK_SOURCES = [
  ["nyu-new-york-arts-science", "College of Arts and Science", "arts-science/"],
  ["nyu-new-york-dentistry", "College of Dentistry", "dentistry/"],
  [
    "nyu-new-york-individualized-study",
    "Gallatin School of Individualized Study",
    "individualized-study/",
  ],
  [
    "nyu-new-york-business",
    "Leonard N. Stern School of Business",
    "business/",
  ],
  ["nyu-new-york-liberal-studies", "Liberal Studies", "liberal-studies/"],
  [
    "nyu-new-york-public-service",
    "Robert F. Wagner Graduate School of Public Service",
    "public-service/",
  ],
  [
    "nyu-new-york-nursing",
    "Rory Meyers College of Nursing",
    "nursing/",
  ],
  [
    "nyu-new-york-global-public-health",
    "School of Global Public Health",
    "global-public-health/",
  ],
  [
    "nyu-new-york-professional-studies",
    "School of Professional Studies",
    "professional-studies/",
  ],
  [
    "nyu-new-york-social-work",
    "Silver School of Social Work",
    "social-work/",
  ],
  [
    "nyu-new-york-culture-education-human-development",
    "Steinhardt School of Culture, Education, and Human Development",
    "culture-education-human-development/",
  ],
  [
    "nyu-new-york-engineering",
    "Tandon School of Engineering",
    "engineering/",
  ],
  ["nyu-new-york-arts", "Tisch School of the Arts", "arts/"],
] as const;

function sourceDefinition(
  id: string,
  schoolName: string,
  campus: CatalogSourceDefinition["campus"],
  bulletinRoot: string,
  includePrograms: boolean,
): CatalogSourceDefinition {
  return CatalogSourceDefinitionSchema.parse({
    id,
    schoolName,
    campus,
    bulletinRoot,
    courseIndexUrl: `${bulletinRoot}courses/`,
    includePrograms,
    enabled: true,
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
  ...NEW_YORK_SOURCES.map(([id, schoolName, root]) =>
    sourceDefinition(
      id,
      schoolName,
      "new-york",
      `${UNDERGRADUATE_ROOT}${root}`,
      false,
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
