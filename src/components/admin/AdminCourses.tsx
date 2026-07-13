"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Course } from "@/lib/types";

interface ParseResult {
  courses: Course[];
  errors: { index: number; message: string }[];
  committed: number;
}

export function AdminCourses() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [filter, setFilter] = useState("");

  const loadCatalog = async () => {
    const res = await fetch("/api/catalog");
    if (res.ok) {
      const data = (await res.json()) as { courses: Course[] };
      setCatalog(data.courses);
    }
  };
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/catalog");
      if (!res.ok || !active) return;
      const data = (await res.json()) as { courses: Course[] };
      setCatalog(data.courses);
    })();
    return () => {
      active = false;
    };
  }, []);

  const run = async (commit: boolean) => {
    setBusy(commit ? "commit" : "preview");
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, commit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data as ParseResult);
      if (commit) {
        toast.success(`Imported ${data.committed} course(s) to the catalog`);
        await loadCatalog();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Remove ${id} from the shared catalog?`)) return;
    const res = await fetch(`/api/admin/courses?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success(`Removed ${id}`);
      await loadCatalog();
    } else {
      toast.error("Could not remove course");
    }
  };

  const shown = catalog.filter(
    (c) =>
      !filter ||
      c.id.toLowerCase().includes(filter.toLowerCase()) ||
      c.title.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Bulk import from Albert
        </h2>
        <p className="text-sm text-muted-foreground">
          Paste one or more course listings. Separate multiple courses with a
          line of three dashes (<code>---</code>) or just paste them back to
          back. Preview first, then commit to the shared catalog.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"CSCI-SHU 360 Machine Learning\n...\n---\nMATH-SHU 235 Probability & Statistics\n..."}
          className="min-h-40 font-mono text-xs"
          data-testid="admin-paste"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy !== null || text.trim().length < 20}
            onClick={() => run(false)}
            data-testid="admin-preview"
          >
            {busy === "preview" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Preview
          </Button>
          <Button
            disabled={busy !== null || !result || result.courses.length === 0}
            onClick={() => run(true)}
            data-testid="admin-commit"
          >
            {busy === "commit" ? <Loader2 className="animate-spin" /> : <Upload />}
            Import {result?.courses.length ?? ""} to catalog
          </Button>
        </div>

        {result && (
          <div className="flex flex-col gap-2" data-testid="admin-preview-result">
            {result.courses.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg border bg-background p-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {c.id}
                </span>
                <span className="flex-1 truncate font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">
                  {c.credits}cr
                </span>
                {c.fulfills.map((f) => (
                  <Badge
                    key={`${f.programId}/${f.categoryId}`}
                    variant="secondary"
                    className="text-[10px]"
                  >
                    {f.programId}
                  </Badge>
                ))}
              </div>
            ))}
            {result.errors.map((e) => (
              <p key={e.index} className="text-xs text-destructive">
                Listing #{e.index + 1}: {e.message}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Catalog ({catalog.length})
          </h2>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="h-8 w-48 text-sm"
          />
        </div>
        <div className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
          {shown.map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-2 rounded-lg border bg-background p-2 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {c.id}
              </span>
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-xs text-muted-foreground">{c.credits}cr</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${c.id}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove(c.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
