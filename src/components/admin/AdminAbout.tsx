"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AboutContentSchema,
  DEFAULT_ABOUT_CONTENT,
  QR_IMAGE_MAX_CHARS,
  type AboutContact,
  type AboutContent,
} from "@/lib/about/types";

const CONTACT_KINDS: AboutContact["kind"][] = ["email", "wechat", "other"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ListEditor<T>({
  title,
  items,
  onChange,
  blank,
  render,
  addLabel,
}: {
  title: string;
  items: T[];
  onChange(next: T[]): void;
  blank: () => T;
  render(item: T, update: (next: T) => void): React.ReactNode;
  addLabel: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row">
              {render(item, (next) =>
                onChange(items.map((current, at) => (at === index ? next : current))),
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 shrink-0"
              aria-label={`Remove item ${index + 1} from ${title}`}
              onClick={() => onChange(items.filter((_, at) => at !== index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...items, blank()])}
      >
        <Plus aria-hidden="true" />
        {addLabel}
      </Button>
    </section>
  );
}

/** Structured editor for the public /about page. */
export function AdminAbout() {
  const [draft, setDraft] = useState<AboutContent>(DEFAULT_ABOUT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/admin/about");
        if (!response.ok) throw new Error("load failed");
        const body = (await response.json()) as { content?: unknown };
        const parsed = AboutContentSchema.safeParse(body.content);
        if (active && parsed.success) setDraft(parsed.data);
      } catch {
        if (active) toast.error("Could not load the About page content.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const patch = useCallback(
    (next: Partial<AboutContent>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  const onQrFile = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("The QR code must be a PNG, JPEG, or WebP image.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      toast.error("Could not read that image.");
      return;
    }
    if (dataUrl.length > QR_IMAGE_MAX_CHARS) {
      toast.error("That image is too large — please use one under about 250 KB.");
      return;
    }
    patch({
      donation: {
        note: draft.donation?.note ?? null,
        qrCaption: draft.donation?.qrCaption ?? null,
        qrImage: dataUrl,
      },
    });
    toast.success("QR image ready — remember to save.");
  };

  const save = async () => {
    const parsed = AboutContentSchema.safeParse(draft);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
      toast.error("Please fix the highlighted problems.");
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      const response = await fetch("/api/admin/about", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as {
        issues?: { path: string; message: string }[];
      };
      if (!response.ok) {
        setIssues((body.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`));
        toast.error("The About page was not saved.");
        return;
      }
      toast.success("About page updated.");
    } catch {
      toast.error("The About page was not saved.");
    } finally {
      setSaving(false);
    }
  };

  const donation = draft.donation ?? { note: null, qrImage: null, qrCaption: null };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="admin-about-heading">
      <div>
        <h3 id="admin-about-heading" className="text-base font-semibold">
          About page
        </h3>
        <p className="text-xs text-muted-foreground">
          Everything here is shown publicly at <code>/about</code>. Plain text only —
          no HTML is rendered.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      ) : (
        <>
          <Field label="Headline">
            <Input
              value={draft.headline}
              maxLength={120}
              onChange={(event) => patch({ headline: event.target.value })}
            />
          </Field>

          <Field label="Introduction" hint="Blank lines separate paragraphs.">
            <Textarea
              value={draft.intro}
              rows={7}
              maxLength={4000}
              onChange={(event) => patch({ intro: event.target.value })}
            />
          </Field>

          <Field label="Badges" hint="Comma-separated, e.g. Unofficial, Free to use.">
            <Input
              value={draft.badges.join(", ")}
              onChange={(event) =>
                patch({
                  badges: event.target.value
                    .split(",")
                    .map((badge) => badge.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                })
              }
            />
          </Field>

          <ListEditor
            title="Links (HTTPS only)"
            items={draft.links}
            onChange={(links) => patch({ links })}
            blank={() => ({ label: "", url: "" })}
            addLabel="Add link"
            render={(item, update) => (
              <>
                <Input
                  className="sm:w-56"
                  placeholder="Label"
                  value={item.label}
                  onChange={(event) => update({ ...item, label: event.target.value })}
                />
                <Input
                  placeholder="https://…"
                  value={item.url}
                  onChange={(event) => update({ ...item, url: event.target.value })}
                />
              </>
            )}
          />

          <ListEditor
            title="Contributors"
            items={draft.contributors}
            onChange={(contributors) => patch({ contributors })}
            blank={() => ({ name: "", note: null })}
            addLabel="Add contributor"
            render={(item, update) => (
              <>
                <Input
                  className="sm:w-56"
                  placeholder="Name"
                  value={item.name}
                  onChange={(event) => update({ ...item, name: event.target.value })}
                />
                <Input
                  placeholder="Role (optional)"
                  value={item.note ?? ""}
                  onChange={(event) => update({ ...item, note: event.target.value || null })}
                />
              </>
            )}
          />

          <ListEditor
            title="Testers and special thanks"
            items={draft.thanks}
            onChange={(thanks) => patch({ thanks })}
            blank={() => ({ name: "", note: null })}
            addLabel="Add name"
            render={(item, update) => (
              <>
                <Input
                  className="sm:w-56"
                  placeholder="Name"
                  value={item.name}
                  onChange={(event) => update({ ...item, name: event.target.value })}
                />
                <Input
                  placeholder="Note (optional)"
                  value={item.note ?? ""}
                  onChange={(event) => update({ ...item, note: event.target.value || null })}
                />
              </>
            )}
          />

          <ListEditor
            title="Contacts"
            items={draft.contacts}
            onChange={(contacts) => patch({ contacts })}
            blank={(): AboutContact => ({ kind: "email", label: "", value: "" })}
            addLabel="Add contact"
            render={(item, update) => (
              <>
                <select
                  aria-label="Contact type"
                  className="h-9 rounded-lg border bg-background px-2 text-sm sm:w-28"
                  value={item.kind}
                  onChange={(event) =>
                    update({ ...item, kind: event.target.value as AboutContact["kind"] })
                  }
                >
                  {CONTACT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <Input
                  className="sm:w-40"
                  placeholder="Label"
                  value={item.label}
                  onChange={(event) => update({ ...item, label: event.target.value })}
                />
                <Input
                  placeholder="Value"
                  value={item.value}
                  onChange={(event) => update({ ...item, value: event.target.value })}
                />
              </>
            )}
          />

          <section className="flex flex-col gap-2 rounded-xl border p-3">
            <h4 className="text-sm font-semibold">Donation</h4>
            <Field label="Note">
              <Textarea
                value={donation.note ?? ""}
                rows={3}
                maxLength={400}
                onChange={(event) =>
                  patch({ donation: { ...donation, note: event.target.value || null } })
                }
              />
            </Field>
            <Field label="QR caption">
              <Input
                value={donation.qrCaption ?? ""}
                maxLength={140}
                onChange={(event) =>
                  patch({ donation: { ...donation, qrCaption: event.target.value || null } })
                }
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="relative overflow-hidden"
                nativeButton={false}
                render={<label htmlFor="about-qr-upload" />}
              >
                <Upload aria-hidden="true" />
                {donation.qrImage ? "Replace QR image" : "Upload QR image"}
              </Button>
              <input
                id="about-qr-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onQrFile(file);
                  event.target.value = "";
                }}
              />
              {donation.qrImage && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={donation.qrImage}
                    alt="Donation QR preview"
                    className="size-16 rounded border object-contain"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patch({ donation: { ...donation, qrImage: null } })}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove image
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Readers only see this after tapping “Show the donation code”. PNG, JPEG,
              or WebP under about 250 KB.
            </p>
          </section>

          {issues.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">Not saved:</p>
              <ul className="mt-1 list-inside list-disc">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              Save About page
            </Button>
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={<a href="/about" target="_blank" rel="noreferrer noopener" />}
            >
              Preview
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
