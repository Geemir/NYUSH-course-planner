"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCourseData } from "@/hooks/useCourseData";
import { PROGRAMS, SITES } from "@/lib/data";
import { Course, TERMS } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

function serializePrereqs(prereqs: string[][]): string {
  return prereqs.map((group) => group.join(" or ")).join("\n");
}

function parsePrereqs(text: string): string[][] {
  return text
    .split("\n")
    .map((line) =>
      line
        .split(/\s+or\s+|\||,/i)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .filter((group) => group.length > 0);
}

function parseCodeList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function EditCourseForm({
  course,
  onDone,
}: {
  course: Course;
  onDone: () => void;
}) {
  const addCustomCourse = usePlannerStore((s) => s.addCustomCourse);
  const { coursesById } = useCourseData();

  const [credits, setCredits] = useState(String(course.credits));
  const [offered, setOffered] = useState(new Set(course.offered));
  const [sites, setSites] = useState(new Set(course.sites));
  const [prereqsText, setPrereqsText] = useState(serializePrereqs(course.prereqs));
  const [equivalentsText, setEquivalentsText] = useState(
    course.equivalentTo.join(", "),
  );
  const [fulfills, setFulfills] = useState(
    new Set(course.fulfills.map((f) => `${f.programId}/${f.categoryId}`)),
  );

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const unknownCodes = useMemo(() => {
    const referenced = [
      ...parsePrereqs(prereqsText).flat(),
      ...parseCodeList(equivalentsText),
    ];
    return [...new Set(referenced.filter((id) => !coursesById.has(id)))];
  }, [prereqsText, equivalentsText, coursesById]);

  const canSave =
    Number(credits) > 0 && offered.size > 0 && sites.size > 0;

  const handleSave = () => {
    const updated: Course = {
      ...course,
      credits: Number(credits),
      offered: [...offered],
      sites: [...sites],
      prereqs: parsePrereqs(prereqsText),
      equivalentTo: parseCodeList(equivalentsText),
      fulfills: [...fulfills].map((key) => {
        const [programId, categoryId] = key.split("/");
        return { programId, categoryId };
      }),
    };
    addCustomCourse(updated);
    toast.success(`Saved ${course.id} as a custom override`);
    onDone();
  };

  const label = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <div className="flex flex-col gap-4" data-testid="edit-course-form">
      <div className="flex flex-wrap items-end gap-5">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="edit-credits">
            Credits
          </label>
          <Input
            id="edit-credits"
            type="number"
            min={1}
            max={8}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="h-8 w-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label}>Offered</span>
          <div className="flex gap-4">
            {TERMS.map((term) => (
              <label key={term} className="flex items-center gap-1.5 text-sm capitalize">
                <Checkbox
                  checked={offered.has(term)}
                  onCheckedChange={() => setOffered((s) => toggle(s, term))}
                />
                {term}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={label}>Available at</span>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
          {SITES.map((site) => (
            <label key={site.id} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={sites.has(site.id)}
                onCheckedChange={() => setSites((s) => toggle(s, site.id))}
              />
              {site.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={label} htmlFor="edit-prereqs">
          Prerequisites — one requirement per line, alternatives with “or”
        </label>
        <Textarea
          id="edit-prereqs"
          value={prereqsText}
          onChange={(e) => setPrereqsText(e.target.value)}
          placeholder={"CSCI-SHU 101 or CSCI-SHU 11\nMATH-SHU 131"}
          className="min-h-16 font-mono text-xs"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={label} htmlFor="edit-equivalents">
          Equivalent to — counts wherever these courses are required
        </label>
        <Input
          id="edit-equivalents"
          value={equivalentsText}
          onChange={(e) => setEquivalentsText(e.target.value)}
          placeholder="MATH-SHU 131"
          className="h-8 font-mono text-xs"
        />
      </div>

      {unknownCodes.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Codes not in your catalog (saved anyway): {unknownCodes.join(", ")}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className={label}>Fulfills requirements</span>
        <div className="flex flex-col gap-2">
          {PROGRAMS.map((program) => (
            <div key={program.id} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: program.color }}
                />
                {program.name}
              </span>
              <div className="grid grid-cols-1 gap-1 pl-4 sm:grid-cols-2">
                {program.categories.map((category) => {
                  const key = `${program.id}/${category.id}`;
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground"
                    >
                      <Checkbox
                        checked={fulfills.has(key)}
                        onCheckedChange={() =>
                          setFulfills((s) => toggle(s, key))
                        }
                      />
                      {category.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={handleSave}
          data-testid="save-edit"
        >
          Save changes
        </Button>
      </DialogFooter>
    </div>
  );
}
