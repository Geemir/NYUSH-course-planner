"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCourseData } from "@/hooks/useCourseData";
import { PROGRAMS_BY_ID, SITES_BY_ID } from "@/lib/data";
import { Course } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

export function AddCourseDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Course | null>(null);
  const addCustomCourse = usePlannerStore((s) => s.addCustomCourse);
  const { coursesById } = useCourseData();

  const reset = () => {
    setText("");
    setParsed(null);
    setError(null);
    setParsing(false);
  };

  const handleParse = async () => {
    setParsing(true);
    setError(null);
    setParsed(null);
    try {
      const res = await fetch("/api/parse-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setParsed(data.course as Course);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = () => {
    if (!parsed) return;
    const replacing = coursesById.has(parsed.id);
    addCustomCourse(parsed);
    toast.success(
      replacing
        ? `Updated ${parsed.id} in the catalog`
        : `Added ${parsed.id} to the catalog`,
    );
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="h-11 w-full" />}>
        <Sparkles />
        Add custom course
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a custom course</DialogTitle>
          <DialogDescription>
            Official courses come from the NYU Bulletin. If a course is missing,
            paste its listing below to create a personal catalog entry; AI
            parsing is an optional helper.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`BUSF-SHU 101 Statistics for Business and Economics\nThis course introduces students to...\nPre-requisites: None Fulfillment: ...\nTerm: Fall 2026\nBUSF-SHU 101 | 4 units\n...`}
            className="max-h-56 min-h-36 font-mono text-xs"
            data-testid="albert-paste"
          />

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {parsed && (
            <div
              className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
              data-testid="parsed-preview"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{parsed.title}</span>
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {parsed.id} · {parsed.credits}cr
                </span>
              </div>
              {parsed.description && (
                <p className="text-sm text-muted-foreground">
                  {parsed.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 text-sm">
                <Badge variant="secondary" className="capitalize">
                  {parsed.offered.join(" & ")}
                </Badge>
                <Badge variant="secondary">
                  {parsed.sites
                    .map((s) => SITES_BY_ID.get(s)?.label ?? s)
                    .join(", ")}
                </Badge>
                {parsed.fulfills.map((f) => {
                  const program = PROGRAMS_BY_ID.get(f.programId);
                  const category = program?.categories.find(
                    (c) => c.id === f.categoryId,
                  );
                  return (
                    <Badge
                      key={`${f.programId}/${f.categoryId}`}
                      variant="outline"
                      style={{ borderColor: program?.color }}
                    >
                      {program?.shortName}: {category?.name}
                    </Badge>
                  );
                })}
                {parsed.fulfills.length === 0 && (
                  <Badge variant="outline">Free elective</Badge>
                )}
              </div>
              <p className="text-sm">
                Prerequisites:{" "}
                {parsed.prereqs.length === 0 ? (
                  <span className="text-muted-foreground">none</span>
                ) : (
                  <span className="font-mono text-xs">
                    {parsed.prereqs.map((g) => g.join(" or ")).join("; ")}
                  </span>
                )}
              </p>
              {coursesById.has(parsed.id) && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {parsed.id} already exists — saving will replace it.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleParse}
            disabled={parsing || text.trim().length < 20}
            data-testid="parse-button"
          >
            {parsing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {parsed ? "Re-parse" : "Parse pasted text"}
          </Button>
          <Button onClick={handleSave} disabled={!parsed} data-testid="save-course">
            {parsed && coursesById.has(parsed.id) ? "Replace course" : "Add to catalog"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
