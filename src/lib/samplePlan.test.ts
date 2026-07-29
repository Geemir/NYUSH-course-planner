import { describe, expect, it } from "vitest";
import {
  buildSamplePlanPreview,
  defaultSamplePlanSelections,
  planningSlotSourceKey,
  samplePlanSemester,
  selectedSamplePlanChanges,
} from "@/lib/samplePlan";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { BulletinSamplePlan } from "@/lib/bulletin/displayTypes";
import type { PlanPlacementV2, PlanningSlot } from "@/lib/types";

function record(sourceId: string, code: string): CatalogCourseRecord {
  return {
    stableId: `${sourceId}:${code}`,
    sourceId,
    sourceSnapshotId: `${sourceId}-snapshot`,
    code,
    subject: code.split(" ")[0],
    level: "undergraduate",
    catalogOfferingTerms: [],
    catalogOfferingText: null,
    crossListedStableIds: [],
    course: {
      id: code,
      title: `${code} Title`,
      credits: 4,
      department: code.split(" ")[0],
      prereqs: [],
      sourceReferenceIds: [],
      offered: [],
      offeringKnown: false,
      sites: [sourceId === "nyu-shanghai" ? "shanghai" : "newyork"],
      fulfills: [],
      equivalentTo: [],
      attributes: [],
      tags: [],
    },
  };
}

const samplePlan: BulletinSamplePlan = {
  sectionId: "sampleplanofstudytext",
  heading: "Sample Plan of Study",
  terms: [
    {
      sourceIndex: 0,
      heading: "First Semester",
      ordinal: 1,
      creditsText: "16",
      rows: [
        {
          kind: "course",
          sourceIndex: 0,
          text: "MATH-SHU 131 Calculus",
          creditsText: "4",
          linkedCourseCodes: ["MATH-SHU 131"],
          sourceAnchors: [],
        },
        {
          kind: "course",
          sourceIndex: 1,
          text: "CSCI-SHU 101 Introduction to Computer Science",
          creditsText: "4",
          linkedCourseCodes: ["CSCI-SHU 101"],
          sourceAnchors: [],
        },
        {
          kind: "course",
          sourceIndex: 2,
          text: "MATH-UA 101 Calculus I",
          creditsText: "4",
          linkedCourseCodes: ["MATH-UA 101"],
          sourceAnchors: [],
        },
        {
          kind: "placeholder",
          sourceIndex: 3,
          label: "Chinese or EAP",
          creditsText: "4",
        },
      ],
    },
    {
      sourceIndex: 1,
      heading: "Second Semester",
      ordinal: 2,
      creditsText: "4",
      rows: [
        {
          kind: "course",
          sourceIndex: 0,
          text: "DATA-SHU 101 Data Science",
          creditsText: "4",
          linkedCourseCodes: ["DATA-SHU 101"],
          sourceAnchors: [],
        },
      ],
    },
  ],
  totalCreditsText: "20",
  importStatus: "eligible",
  diagnostics: [],
};

const placements: PlanPlacementV2[] = [
  {
    placementId: "same-term",
    catalogCourseId: "nyu-shanghai:CSCI-SHU 101",
    courseId: "CSCI-SHU 101",
    semesterId: "Y1F",
    allocation: "auto",
  },
  {
    placementId: "other-term",
    catalogCourseId: "nyu-new-york-cas:MATH-UA 101",
    courseId: "MATH-UA 101",
    semesterId: "Y2F",
    allocation: "auto",
  },
];

const matches = [
  { code: "MATH-SHU 131", records: [record("nyu-shanghai", "MATH-SHU 131")] },
  {
    code: "CSCI-SHU 101",
    records: [
      record("nyu-new-york-cas", "CSCI-SHU 101"),
      record("nyu-shanghai", "CSCI-SHU 101"),
    ],
  },
  { code: "MATH-UA 101", records: [record("nyu-new-york-cas", "MATH-UA 101")] },
  {
    code: "DATA-SHU 101",
    records: [
      record("nyu-new-york-cas", "DATA-SHU 101"),
      record("nyu-new-york-tandon", "DATA-SHU 101"),
    ],
  },
];

function preview(currentSlots: PlanningSlot[] = []) {
  return buildSamplePlanPreview({
    programId: "computer-science-bs",
    catalogReleaseId: "release-a",
    samplePlan,
    resolution: { releaseId: "release-a", matches },
    placements,
    planningSlots: currentSlots,
  });
}

describe("sample-plan preview", () => {
  it("classifies exact courses, conflicts, placeholders, and ambiguity", () => {
    const rows = preview().terms.flatMap((term) => term.rows);
    const statusFor = (sourceIndex: number, termIndex = 0) =>
      preview().terms[termIndex].rows.find(
        (row) => row.rowSourceIndex === sourceIndex,
      )?.status;

    expect(statusFor(0)).toBe("add");
    expect(statusFor(1)).toBe("keep");
    expect(statusFor(2)).toBe("conflict");
    expect(statusFor(3)).toBe("placeholder");
    expect(statusFor(0, 1)).toBe("unavailable");
    expect(rows.find((row) => row.courseCode === "CSCI-SHU 101")?.record?.sourceId).toBe(
      "nyu-shanghai",
    );
  });

  it("maps ordinals exactly and creates normalized stable slot keys", () => {
    expect(samplePlanSemester(1)).toBe("Y1F");
    expect(samplePlanSemester(8)).toBe("Y4S");
    expect(samplePlanSemester(0)).toBeNull();
    expect(samplePlanSemester(9)).toBeNull();
    expect(
      planningSlotSourceKey({
        programId: "computer-science-bs",
        sectionId: "sampleplanofstudytext",
        termOrdinal: 1,
        rowSourceIndex: 3,
        label: "  Chinese   or EAP ",
      }),
    ).toBe(
      "computer-science-bs:sampleplanofstudytext:1:3:chinese-or-eap",
    );
  });

  it("keeps conflicts in place by default and emits one explicit move", () => {
    const current = preview();
    const defaults = defaultSamplePlanSelections(current);
    const defaultChanges = selectedSamplePlanChanges(current, defaults);
    expect(defaultChanges.placements).toEqual([
      expect.objectContaining({ courseId: "MATH-SHU 131", semesterId: "Y1F" }),
    ]);
    expect(defaultChanges.placements).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ courseId: "MATH-UA 101" })]),
    );

    const conflict = current.terms[0].rows.find(
      (row) => row.courseCode === "MATH-UA 101",
    )!;
    const moved = selectedSamplePlanChanges(current, {
      ...defaults,
      [conflict.sourceKey]: "move",
    });
    expect(moved.placements.filter((item) => item.courseId === "MATH-UA 101")).toEqual([
      expect.objectContaining({
        placementId: "other-term",
        semesterId: "Y1F",
      }),
    ]);
  });

  it("is idempotent when exact courses and the slot already exist", () => {
    const first = preview();
    const changes = selectedSamplePlanChanges(
      first,
      defaultSamplePlanSelections(first),
    );
    const reapplied = buildSamplePlanPreview({
      programId: "computer-science-bs",
      catalogReleaseId: "release-a",
      samplePlan,
      resolution: { releaseId: "release-a", matches },
      placements: [
        ...placements,
        ...changes.placements.map((placement, index) => ({
          ...placement,
          placementId: placement.placementId ?? `new-${index}`,
          allocation: placement.allocation ?? ("auto" as const),
        })),
      ],
      planningSlots: changes.slots,
    });

    expect(
      selectedSamplePlanChanges(
        reapplied,
        defaultSamplePlanSelections(reapplied),
      ),
    ).toEqual({ placements: [], slots: [] });
  });
});
