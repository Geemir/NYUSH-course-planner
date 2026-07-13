import { Course, Placement, Program, SemesterId } from "@/lib/types";

export function mkCourse(partial: Partial<Course> & { id: string }): Course {
  return {
    title: partial.id,
    credits: 4,
    department: "Test",
    prereqs: [],
    offered: ["fall", "spring"],
    sites: ["home"],
    fulfills: [],
    equivalentTo: [],
    tags: [],
    ...partial,
  };
}

export const FIXTURE_PROGRAMS: Program[] = [
  {
    id: "core",
    name: "Core",
    shortName: "Core",
    type: "core",
    color: "#10b981",
    categories: [
      {
        id: "core-math",
        name: "Math",
        isCapstone: false,
        rule: { kind: "chooseN", n: 1, courses: ["MATH 1"] },
      },
    ],
  },
  {
    id: "a",
    name: "Major A",
    shortName: "A",
    type: "major",
    color: "#8b5cf6",
    doubleCountLimit: 1,
    categories: [
      {
        id: "a-found",
        name: "Foundations",
        isCapstone: false,
        rule: { kind: "allOf", courses: ["A 1", "A 2"] },
      },
      {
        id: "a-elect",
        name: "Electives",
        isCapstone: false,
        rule: { kind: "chooseN", n: 1, courses: ["X 1", "X 2"] },
      },
      {
        id: "a-cap",
        name: "Capstone",
        isCapstone: true,
        rule: { kind: "allOf", courses: ["A 9"] },
      },
    ],
  },
  {
    id: "b",
    name: "Major B",
    shortName: "B",
    type: "major",
    color: "#f59e0b",
    doubleCountLimit: 2,
    categories: [
      {
        id: "b-elect",
        name: "Electives",
        isCapstone: false,
        rule: { kind: "creditsFrom", minCredits: 8, courses: ["X 1", "X 2", "B 1"] },
      },
    ],
  },
  {
    id: "m",
    name: "Minor M",
    shortName: "M",
    type: "minor",
    color: "#fb923c",
    categories: [
      {
        id: "m-elect",
        name: "Minor Electives",
        isCapstone: false,
        rule: { kind: "chooseN", n: 2, courses: ["X 1", "X 2"] },
      },
    ],
  },
];

export const FIXTURE_COURSES: Course[] = [
  mkCourse({
    id: "MATH 1",
    fulfills: [{ programId: "core", categoryId: "core-math" }],
  }),
  mkCourse({ id: "A 1", fulfills: [{ programId: "a", categoryId: "a-found" }] }),
  mkCourse({
    id: "A 2",
    prereqs: [["A 1"]],
    fulfills: [{ programId: "a", categoryId: "a-found" }],
  }),
  mkCourse({
    id: "A 9",
    tags: ["capstone"],
    fulfills: [{ programId: "a", categoryId: "a-cap" }],
  }),
  mkCourse({
    id: "X 1",
    fulfills: [
      { programId: "a", categoryId: "a-elect" },
      { programId: "b", categoryId: "b-elect" },
      { programId: "m", categoryId: "m-elect" },
    ],
  }),
  mkCourse({
    id: "X 2",
    fulfills: [
      { programId: "a", categoryId: "a-elect" },
      { programId: "b", categoryId: "b-elect" },
    ],
  }),
  mkCourse({ id: "B 1", fulfills: [{ programId: "b", categoryId: "b-elect" }] }),
  mkCourse({ id: "OR 1", prereqs: [["A 1", "B 1"]] }),
  mkCourse({ id: "F 1", offered: ["fall"] }),
  mkCourse({ id: "AW 1", sites: ["home", "away"] }),
];

export const COURSES_BY_ID = new Map(FIXTURE_COURSES.map((c) => [c.id, c]));
export const PROGRAMS_BY_ID = new Map(FIXTURE_PROGRAMS.map((p) => [p.id, p]));
export const ACTIVE = ["core", "a", "b"];
export const SITE_NAMES = new Map([
  ["home", "Home Campus"],
  ["away", "Away Site"],
]);

export function place(
  courseId: string,
  semesterId: SemesterId,
  allocation: Placement["allocation"] = "auto",
): Placement {
  return { courseId, semesterId, allocation };
}
