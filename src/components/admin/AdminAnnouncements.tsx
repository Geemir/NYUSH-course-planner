"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Bell, Loader2, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement, AnnouncementInput, AnnouncementTone } from "@/lib/announcements/types";

const EMPTY_FORM = {
  title: "",
  body: "",
  tone: "info" as AnnouncementTone,
  linkUrl: "",
  linkLabel: "",
  expiresAt: "",
};

type AnnouncementForm = typeof EMPTY_FORM;

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "request_failed");
  return body as T;
}

function asInput(form: AnnouncementForm): AnnouncementInput {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    tone: form.tone,
    linkUrl: form.linkUrl.trim() || null,
    linkLabel: form.linkLabel.trim() || null,
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
  };
}

function editForm(item: Announcement): AnnouncementForm {
  return {
    title: item.title,
    body: item.body,
    tone: item.tone,
    linkUrl: item.linkUrl ?? "",
    linkLabel: item.linkLabel ?? "",
    expiresAt: item.expiresAt ? item.expiresAt.slice(0, 16) : "",
  };
}

function statusLabel(status: Announcement["status"]): string {
  return status[0].toUpperCase() + status.slice(1);
}

async function fetchAnnouncements(signal?: AbortSignal): Promise<Announcement[]> {
  const response = await fetch("/api/admin/announcements", { cache: "no-store", signal });
  return (await readResponse<{ items: Announcement[] }>(response)).items;
}

export function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setItems(await fetchAnnouncements(signal));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const next = await fetchAnnouncements(controller.signal);
        if (active) {
          setItems(next);
          setLoadError(false);
        }
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [load]);

  const setField = <K extends keyof AnnouncementForm>(key: K, value: AnnouncementForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetEditor = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const saveDraft = async () => {
    setMutating(true);
    try {
      const response = await fetch(
        editingId ? `/api/admin/announcements/${encodeURIComponent(editingId)}` : "/api/admin/announcements",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId
            ? { action: "update", announcement: asInput(form) }
            : asInput(form)),
        },
      );
      await readResponse(response);
      toast.success(editingId ? "Draft updated" : "Draft saved");
      resetEditor();
      await load();
    } catch {
      toast.error("Could not save the announcement draft.");
    } finally {
      setMutating(false);
    }
  };

  const lifecycle = async (item: Announcement, action: "publish" | "archive") => {
    const prompt = action === "publish"
      ? `Publish \"${item.title}\" to every planner user?`
      : `Withdraw \"${item.title}\" from the planner?`;
    if (!window.confirm(prompt)) return;
    setMutating(true);
    try {
      const response = await fetch(`/api/admin/announcements/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await readResponse(response);
      toast.success(action === "publish" ? "Announcement published" : "Announcement withdrawn");
      await load();
    } catch {
      toast.error("The announcement changed. Reload and try again.");
    } finally {
      setMutating(false);
    }
  };

  const valid = Boolean(
    form.title.trim() &&
    form.body.trim() &&
    (!form.linkUrl.trim() || form.linkUrl.trim().startsWith("https://")) &&
    (!form.linkLabel.trim() || form.linkUrl.trim()),
  );

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bell className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Planner announcements</h2>
          <p className="text-sm text-muted-foreground">
            Publish one global, dismissible notice across signed-in and signed-out planner sessions.
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 rounded-xl border bg-background p-3 sm:grid-cols-2 sm:p-4">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          Title
          <Input className="min-h-11" maxLength={120} value={form.title} onChange={(event) => setField("title", event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          Message
          <Textarea className="min-h-28" maxLength={1000} value={form.body} onChange={(event) => setField("body", event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          Tone
          <select
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={form.tone}
            onChange={(event) => setField("tone", event.target.value as AnnouncementTone)}
          >
            <option value="info">Information</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          Expiry (optional)
          <Input className="min-h-11" type="datetime-local" value={form.expiresAt} onChange={(event) => setField("expiresAt", event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          Link URL (optional)
          <Input className="min-h-11" type="url" placeholder="https://" value={form.linkUrl} onChange={(event) => setField("linkUrl", event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          Link label (optional)
          <Input className="min-h-11" maxLength={60} value={form.linkLabel} onChange={(event) => setField("linkLabel", event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button className="min-h-11" disabled={!valid || mutating} onClick={() => void saveDraft()}>
            {mutating ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {editingId ? "Save changes" : "Save draft"}
          </Button>
          {editingId && (
            <Button className="min-h-11" variant="outline" disabled={mutating} onClick={resetEditor}>Cancel editing</Button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Announcement history</h3>
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading announcements…</p>}
        {loadError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Could not load announcements.</p>}
        {!loading && !loadError && items.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No announcement history yet.</p>
        )}
        {items.map((item) => (
          <article key={item.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-background p-3 sm:p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{statusLabel(item.status)}</span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">{item.tone}</span>
              {item.expiresAt && <span className="text-xs text-muted-foreground">Expires {new Date(item.expiresAt).toLocaleString()}</span>}
            </div>
            <div className="min-w-0">
              <h4 className="break-words font-semibold">{item.title}</h4>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.status === "draft" && (
                <>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={mutating}
                    aria-label={`Edit ${item.title}`}
                    onClick={() => { setEditingId(item.id); setForm(editForm(item)); }}
                  >
                    <Pencil aria-hidden /> Edit
                  </Button>
                  <Button
                    className="min-h-11"
                    disabled={mutating}
                    aria-label={`Publish ${item.title}`}
                    onClick={() => void lifecycle(item, "publish")}
                  >
                    <Send aria-hidden /> Publish
                  </Button>
                </>
              )}
              {item.status === "published" && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={mutating}
                  aria-label={`Withdraw ${item.title}`}
                  onClick={() => void lifecycle(item, "archive")}
                >
                  <Archive aria-hidden /> Withdraw
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
