"use client";

import { useState } from "react";
import { Bell, BookOpen, CheckCircle2, Cloud, GripVertical, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Input } from "@/components/ui/input";

export function AcademicGlassPrototype() {
  const [detail, setDetail] = useState(false);
  const [filters, setFilters] = useState(false);
  const [preferences, setPreferences] = useState({ motion: false, transparency: false, contrast: false });
  const toggle = (key: keyof typeof preferences) => setPreferences((current) => ({ ...current, [key]: !current[key] }));

  return <div className={`${preferences.motion ? "prototype-reduced-motion" : ""} ${preferences.transparency ? "prototype-reduced-transparency" : ""} ${preferences.contrast ? "prototype-more-contrast" : ""} min-h-screen bg-background text-foreground`}>
    <div className="relative min-h-48 overflow-hidden bg-[linear-gradient(120deg,#180c22_0%,#3b1557_45%,#57068c_100%)] px-4 py-5 text-white sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgb(230_217_242/20%),transparent_35%)]" aria-hidden="true" />
      <GlassSurface asChild strength="strong" elevation="overlay"><header className="relative mx-auto flex max-w-[var(--content-max-width)] items-center gap-3 rounded-2xl px-4 py-3 text-foreground"><div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BookOpen className="size-5" /></div><div><h1 className="text-base font-semibold">NYUSH Degree Planner</h1><p className="text-xs text-muted-foreground">Academic Glass prototype</p></div><div className="ml-auto flex items-center gap-1"><Button size="icon" variant="quiet" aria-label="Notifications"><Bell /></Button><Button variant="secondary">Program Profile</Button><Button>Save plan</Button></div></header></GlassSurface>
      <div className="relative mx-auto mt-7 max-w-[var(--content-max-width)]"><p className="text-xs font-semibold uppercase tracking-wider text-white/70">Plan boldly</p><h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Build a degree around the questions you cannot stop asking.</h2></div>
    </div>

    <main className="mx-auto grid max-w-[var(--content-max-width)] gap-6 p-4 sm:p-8 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-4"><GlassSurface asChild><div className="rounded-2xl p-3"><label className="relative block"><Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Search courses" className="h-11 bg-card pl-9" placeholder="Code, title, or subject" /></label><Button variant="quiet" className="mt-2 w-full justify-start" onClick={() => setFilters((value) => !value)}><SlidersHorizontal />Filters</Button>{filters && <div className="mt-2 rounded-xl bg-card p-3 text-sm"><label className="grid gap-1">School<select className="h-11 rounded-lg border bg-background px-3"><option>All NYU schools</option><option>NYU Shanghai</option><option>NYU Stern</option></select></label></div>}</div></GlassSurface>
        <div className="rounded-2xl border bg-card p-4"><p className="font-mono text-xs text-primary">CSCI-SHU 210</p><p className="mt-1 font-semibold">Data Structures</p><p className="text-xs text-muted-foreground">4 credits · Shanghai</p></div>
        <fieldset className="rounded-2xl border bg-card p-4"><legend className="px-1 text-sm font-semibold">Preference simulation</legend>{Object.entries(preferences).map(([key, checked]) => <label key={key} className="mt-2 flex min-h-11 items-center justify-between gap-2 text-sm capitalize"><span>Reduced {key}</span><input type="checkbox" checked={checked} onChange={() => toggle(key as keyof typeof preferences)} /></label>)}</fieldset>
      </aside>
      <section aria-labelledby="prototype-plan" className="min-w-0"><div className="mb-4 flex items-center justify-between"><div><h2 id="prototype-plan" className="text-xl font-semibold">Four-year plan</h2><p className="text-sm text-muted-foreground">One-column timeline · 32 of 128 credits</p></div><GlassSurface asChild><div role="status" className="flex min-h-11 items-center gap-2 rounded-full px-4 text-sm"><Cloud className="size-4 text-emerald-600" />Saved</div></GlassSurface></div>
        <div className="space-y-5">{["Fall 2026", "Spring 2027"].map((term, index) => <article key={term} className="rounded-2xl border bg-card p-5 shadow-sm" data-content-surface><header className="flex items-center justify-between"><div><h3 className="text-lg font-semibold">{term}</h3><p className="text-sm text-muted-foreground">{index ? "New York study away" : "Shanghai"}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{index ? 4 : 8} credits</span></header><div className="mt-4 space-y-2"><button type="button" onClick={() => setDetail(true)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background p-3 text-left hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/40"><GripVertical className="size-4 text-muted-foreground" /><span><span className="block font-mono text-xs text-primary">{index ? "MKTG-UB 1" : "CSCI-SHU 210"}</span><span className="block font-medium">{index ? "Introduction to Marketing" : "Data Structures"}</span></span><span className="ml-auto text-xs text-muted-foreground">4 cr</span></button>{!index && <div className="flex min-h-14 items-center gap-3 rounded-xl border bg-background p-3"><CheckCircle2 className="size-4 text-emerald-600" /><span><span className="block font-mono text-xs text-primary">MATH-SHU 131</span><span className="font-medium">Calculus</span></span></div>}</div></article>)}</div>
      </section>
    </main>
    {detail && <Dialog open onOpenChange={setDetail}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Data Structures</DialogTitle><DialogDescription>CSCI-SHU 210 · 4 credits · NYU Shanghai Bulletin</DialogDescription></DialogHeader><div data-content-surface className="rounded-xl bg-card p-4 text-sm leading-6">Representative course detail with a deliberately long description to validate reading contrast, responsive wrapping, and opaque content inside transient glass chrome.</div><Button>Customize for my plan</Button></DialogContent></Dialog>}
  </div>;
}

