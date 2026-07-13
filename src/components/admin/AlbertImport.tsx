"use client";

import { useState } from "react";
import { CloudDownload, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SITES_BY_ID } from "@/lib/data";
import { Course } from "@/lib/types";

interface Result {
  courses: Course[];
  committed: number;
  stats: {
    sectionsSeen: number;
    distinctCourses: number;
    detailCalls: number;
    enrichedCourses: number;
  };
}

const SUGGESTED = ["CSCI-SHU", "DATS-SHU", "MATH-SHU", "INTM-SHU", "CENG-SHU"];

export function AlbertImport() {
  const [subject, setSubject] = useState("");
  const [enrich, setEnrich] = useState(false);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (commit: boolean) => {
    if (!subject.trim()) return;
    setBusy(commit ? "commit" : "preview");
    try {
      const res = await fetch("/api/admin/albert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), commit, enrich }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data as Result);
      if (commit) {
        toast.success(
          `Imported ${data.committed} course(s) — refresh the catalog list to see them`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Import from Albert (live)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pulls a subject&apos;s courses from NYU&apos;s public class-search for
          the current term. Fills code, title, credits, campus, and any listed
          prerequisites; requirement mappings stay curated. Preview, then commit.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value.toUpperCase())}
          placeholder="Subject code, e.g. CSCI-SHU"
          className="h-8 w-56 text-sm"
          data-testid="albert-subject"
        />
        <Button
          variant="outline"
          disabled={busy !== null || !subject.trim()}
          onClick={() => run(false)}
          data-testid="albert-preview"
        >
          {busy === "preview" ? <Loader2 className="animate-spin" /> : <CloudDownload />}
          Fetch preview
        </Button>
        <Button
          disabled={busy !== null || !result || result.courses.length === 0}
          onClick={() => run(true)}
          data-testid="albert-commit"
        >
          {busy === "commit" ? <Loader2 className="animate-spin" /> : <Upload />}
          Import {result?.courses.length ?? ""} to catalog
        </Button>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={enrich}
          onCheckedChange={(v) => setEnrich(Boolean(v))}
          disabled={busy !== null}
        />
        Use AI to read prerequisites from the listing text (slower; one DeepSeek
        call)
      </label>

      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        <span>Try:</span>
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70"
            onClick={() => setSubject(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {result && (
        <div className="flex flex-col gap-2" data-testid="albert-result">
          <p className="text-xs text-muted-foreground">
            {result.stats.sectionsSeen} sections → {result.courses.length}{" "}
            course(s) ({result.stats.detailCalls} detail lookups
            {result.stats.enrichedCourses > 0
              ? `, ${result.stats.enrichedCourses} prereqs via AI`
              : ""}
            )
          </p>
          {result.courses.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {c.id}
              </span>
              <span className="flex-1 truncate font-medium">{c.title}</span>
              <span className="text-xs text-muted-foreground">{c.credits}cr</span>
              <span className="text-[10px] uppercase text-muted-foreground/70">
                {c.offered.map((t) => t.slice(0, 2)).join("·")}
              </span>
              {c.sites.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {SITES_BY_ID.get(s)?.label ?? s}
                </Badge>
              ))}
              {c.prereqs.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {c.prereqs.length} prereq
                </Badge>
              )}
            </div>
          ))}
          {result.courses.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No courses found for that subject this term.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
