"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCatalogClient, type CatalogClient } from "@/lib/catalogClient";
import { CatalogCourseQuerySchema } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { Course } from "@/lib/types";

interface ParseResult {
  courses: Course[];
  errors: { index: number; message: string }[];
  committed: number;
}

export function AdminCourses({ client: injectedClient }: { client?: CatalogClient } = {}) {
  const [client] = useState(() => injectedClient ?? createCatalogClient());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [filter, setFilter] = useState("");
  const [catalog, setCatalog] = useState<CatalogCourseRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const searchCatalog = useCallback(async (query: string, signal?: AbortSignal) => {
    setSearching(true);
    setSearchError(false);
    try {
      const page = await client.search(
        CatalogCourseQuerySchema.parse({ q: query, limit: 40 }),
        signal,
      );
      setCatalog(page.items);
    } catch {
      if (!signal?.aborted) setSearchError(true);
    } finally {
      if (!signal?.aborted) setSearching(false);
    }
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void searchCatalog(filter, controller.signal),
      200,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filter, searchCatalog]);

  const runImport = async (commit: boolean) => {
    setBusy(commit ? "commit" : "preview");
    try {
      const response = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, commit }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Request failed");
      setResult(body as ParseResult);
      if (commit) {
        toast.success(`Imported ${body.committed} reviewed course(s)`);
        await searchCatalog(filter);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Manual course administration</h2>
        <p className="text-sm text-muted-foreground">
          Manual imports are separate reviewed records. They do not edit or delete immutable NYU Bulletin source records.
        </p>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste one or more reviewed course listings…" className="min-h-40 font-mono text-xs" data-testid="admin-paste" />
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy !== null || text.trim().length < 20} onClick={() => void runImport(false)} data-testid="admin-preview">{busy === "preview" ? <Loader2 className="animate-spin" /> : <Sparkles />}Preview</Button>
          <Button disabled={busy !== null || !result || result.courses.length === 0} onClick={() => void runImport(true)} data-testid="admin-commit">{busy === "commit" ? <Loader2 className="animate-spin" /> : <Upload />}Import {result?.courses.length ?? ""} reviewed records</Button>
        </div>
        {result && <div className="space-y-2" data-testid="admin-preview-result">
          {result.courses.map((course) => <div key={course.id} className="flex items-center gap-2 rounded-lg border bg-background p-2 text-sm"><span className="font-mono text-xs text-muted-foreground">{course.id}</span><span className="flex-1 truncate font-medium">{course.title}</span><span className="text-xs text-muted-foreground">{course.credits} cr</span></div>)}
          {result.errors.map((error) => <p key={error.index} className="text-xs text-destructive">Listing #{error.index + 1}: {error.message}</p>)}
        </div>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Immutable Bulletin records ({catalog.length})</h2>
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search code or title…" aria-label="Search immutable Bulletin courses" className="h-9 w-64 text-sm" />
        </div>
        <div className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
          {searching && <p className="p-3 text-sm text-muted-foreground">Searching Bulletin records…</p>}
          {searchError && <p role="alert" className="p-3 text-sm text-destructive">Bulletin search unavailable.</p>}
          {!searching && !searchError && catalog.length === 0 && <p className="p-3 text-sm text-muted-foreground">No Bulletin records match this query.</p>}
          {catalog.map((record) => <div key={record.stableId} className="flex items-center gap-2 rounded-lg border bg-background p-2 text-sm"><span className="font-mono text-xs text-muted-foreground">{record.code}</span><span className="flex-1 truncate">{record.course.title}</span><Badge variant="outline">{record.sourceId}</Badge><span className="text-xs text-muted-foreground">{record.course.credits} cr</span></div>)}
        </div>
      </section>
    </div>
  );
}
