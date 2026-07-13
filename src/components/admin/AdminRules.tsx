"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GRADES, Grade, SpecialRule } from "@/lib/types";

type Kind = "equivalence" | "concurrentPrereq";

function describeAdmin(r: SpecialRule): string {
  if (r.kind === "equivalence") return `${r.course} counts as ${r.target}`;
  return `${r.course} may be taken with ${r.prereq}${
    r.condition ? ` if ${r.condition.minGrade} in ${r.condition.course}` : ""
  }`;
}

interface ParsedPreview {
  rule: SpecialRule;
  explanation: string;
  issues: string[];
}

export function AdminRules() {
  const [active, setActive] = useState<SpecialRule[]>([]);
  const [drafts, setDrafts] = useState<SpecialRule[]>([]);

  // AI authoring
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);

  // manual form
  const [kind, setKind] = useState<Kind>("concurrentPrereq");
  const [course, setCourse] = useState("");
  const [target, setTarget] = useState("");
  const [condCourse, setCondCourse] = useState("");
  const [condGrade, setCondGrade] = useState<Grade>("A");
  const [note, setNote] = useState("");

  const load = async () => {
    const res = await fetch("/api/admin/rules");
    if (res.ok) {
      const data = (await res.json()) as {
        active: SpecialRule[];
        drafts: SpecialRule[];
      };
      setActive(data.active);
      setDrafts(data.drafts);
    }
  };
  useEffect(() => {
    let on = true;
    (async () => {
      const res = await fetch("/api/admin/rules");
      if (res.ok && on) {
        const data = await res.json();
        setActive(data.active);
        setDrafts(data.drafts);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const parseNL = async () => {
    setParsing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/rules/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      setPreview(data as ParsedPreview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const save = async (rule: SpecialRule, status: "draft" | "active") => {
    const res = await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, status }),
    });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Save failed");
      return;
    }
    toast.success(status === "draft" ? "Submitted for review" : "Rule active");
    setPreview(null);
    setNlText("");
    await load();
  };

  const approve = async (id: string) => {
    const res = await fetch("/api/admin/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "active" }),
    });
    if (res.ok) {
      toast.success("Rule approved");
      await load();
    }
  };

  const reject = async (id: string) => {
    const res = await fetch(`/api/admin/rules?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Removed");
      await load();
    }
  };

  const addManual = async () => {
    const rule =
      kind === "equivalence"
        ? { kind, course: course.trim(), target: target.trim(), note: note.trim() || undefined }
        : {
            kind,
            course: course.trim(),
            prereq: target.trim(),
            condition: condCourse.trim()
              ? { course: condCourse.trim(), minGrade: condGrade }
              : undefined,
            note: note.trim() || undefined,
          };
    await save(rule as SpecialRule, "active");
    setCourse("");
    setTarget("");
    setCondCourse("");
    setNote("");
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Special rules
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a rule in plain English and the assistant drafts it for your
          review, or add one manually. Only approved rules affect plans.
        </p>
      </div>

      {/* AI authoring */}
      <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
        <Textarea
          value={nlText}
          onChange={(e) => setNlText(e.target.value)}
          placeholder="e.g. An A in Intro to Computer Programming lets a student take Data Structures and Intro to CS in the same semester."
          className="min-h-20 text-sm"
          data-testid="rule-nl"
        />
        <div>
          <Button
            variant="outline"
            disabled={parsing || nlText.trim().length < 8}
            onClick={parseNL}
            data-testid="rule-parse"
          >
            {parsing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Draft with AI
          </Button>
        </div>
        {preview && (
          <div
            className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm"
            data-testid="rule-preview"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                {preview.rule.kind === "equivalence" ? "equiv" : "concurrent"}
              </span>
              <span className="font-medium">{describeAdmin(preview.rule)}</span>
            </div>
            {preview.explanation && (
              <p className="text-muted-foreground">{preview.explanation}</p>
            )}
            {preview.issues.map((i, k) => (
              <p key={k} className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ {i}
              </p>
            ))}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => save(preview.rule, "draft")}
                data-testid="rule-submit-review"
              >
                Submit for review
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => save(preview.rule, "active")}
              >
                Add now (active)
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Pending review (drafts) */}
      {drafts.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="rule-drafts">
          <h3 className="text-sm font-semibold">
            Pending review ({drafts.length})
          </h3>
          {drafts.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-sm"
            >
              <span className="flex-1 truncate">{describeAdmin(r)}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Approve rule"
                className="text-emerald-600 hover:text-emerald-700"
                onClick={() => approve(r.id)}
              >
                <Check />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Reject rule"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => reject(r.id)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Active rules */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Active rules ({active.length})</h3>
        {active.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded-lg border bg-background p-2 text-sm"
          >
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
              {r.kind === "equivalence" ? "equiv" : "concurrent"}
            </span>
            <span className="flex-1 truncate">{describeAdmin(r)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete rule"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => reject(r.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {active.length === 0 && (
          <p className="py-1 text-sm text-muted-foreground">No active rules.</p>
        )}
      </div>

      {/* Manual add */}
      <details className="rounded-lg border bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Add manually
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger size="sm" className="w-52 text-sm">
              <SelectValue>
                {(v: string) =>
                  v === "equivalence" ? "Equivalence" : "Concurrent prerequisite"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concurrentPrereq">
                Concurrent prerequisite
              </SelectItem>
              <SelectItem value="equivalence">Equivalence</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="Course code"
              className="h-8 w-44"
            />
            <span className="text-muted-foreground">
              {kind === "equivalence" ? "counts as" : "with"}
            </span>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={kind === "equivalence" ? "Target code" : "Prereq code"}
              className="h-8 w-44"
            />
          </div>
          {kind === "concurrentPrereq" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">if grade ≥</span>
              <Select
                value={condGrade}
                onValueChange={(v) => setCondGrade(v as Grade)}
              >
                <SelectTrigger size="sm" className="w-20 text-sm">
                  <SelectValue>{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">in</span>
              <Input
                value={condCourse}
                onChange={(e) => setCondCourse(e.target.value)}
                placeholder="Condition code (optional)"
                className="h-8 w-56"
              />
            </div>
          )}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Student-facing note (optional)"
            className="h-8 text-sm"
          />
          <div>
            <Button
              size="sm"
              disabled={!course.trim() || !target.trim()}
              onClick={addManual}
            >
              <Plus />
              Add active rule
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
