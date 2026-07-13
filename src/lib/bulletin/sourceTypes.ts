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
  majors: BulletinProgramSource[];
  minors: BulletinProgramSource[];
  subjects: BulletinSubjectSource[];
}
