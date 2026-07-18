export type BulletinProgramKind = "major" | "minor";

export interface BulletinProgramSource {
  kind: BulletinProgramKind;
  slug: string;
  title: string;
  url: string;
}

export interface BulletinSubjectSource {
  kind: "subject";
  slug: string;
  title: string;
  url: string;
}

export interface BulletinDiscovery {
  sourceId: string;
  source: CatalogSourceDefinition;
  majors: BulletinProgramSource[];
  minors: BulletinProgramSource[];
  subjects: BulletinSubjectSource[];
  programUrls: string[];
  courseIndexUrls: string[];
  coursePageUrls: string[];
  discoveredUrls: string[];
}
import type { CatalogSourceDefinition } from "@/lib/catalog/types";
