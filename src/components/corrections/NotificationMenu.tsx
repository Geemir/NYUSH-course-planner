"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

interface NotificationItem { id: string; requestId: string | null; title: string; body: string; readAt: string | null; createdAt: string }

export function NotificationMenu({ onOpenReport }: { onOpenReport(id: string): void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    setState("loading");
    try {
      const response = await fetch("/api/notifications?limit=20");
      if (!response.ok) throw new Error();
      const result = await response.json() as { items: NotificationItem[]; unreadCount: number };
      setItems(result.items); setUnreadCount(result.unreadCount); setState("idle");
    } catch { setState("error"); }
  }, []);

  useEffect(() => {
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60_000);
    return () => { window.removeEventListener("focus", focus); window.clearInterval(timer); };
  }, [refresh]);

  const changeOpen = (next: boolean) => { setOpen(next); if (next) void refresh(); };
  const markRead = async (ids?: string[]) => {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : { all: true }) });
    if (response.ok) await refresh();
  };

  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger render={<Button variant="ghost" className="relative size-11" aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`} />}>
      <Bell aria-hidden="true" />{unreadCount > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-0">
      <PopoverHeader className="flex-row items-center justify-between border-b p-3"><PopoverTitle>Notifications</PopoverTitle>{unreadCount > 0 && <Button variant="ghost" size="sm" onClick={() => void markRead()}><CheckCheck />Mark all read</Button>}</PopoverHeader>
      <div className="max-h-80 overflow-y-auto p-2">
        {state === "loading" && !items.length && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {state === "error" && <div className="space-y-2 p-3"><p role="alert" className="text-sm text-destructive">Notifications could not be loaded.</p><Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button></div>}
        {state !== "loading" && state !== "error" && !items.length && <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>}
        {items.map((item) => <button key={item.id} type="button" className="w-full rounded-lg p-3 text-left hover:bg-muted" onClick={() => { if (!item.readAt) void markRead([item.id]); if (item.requestId) onOpenReport(item.requestId); setOpen(false); }}>
          <span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`} /><span><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs leading-5 text-muted-foreground">{item.body}</span><time className="block text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("en-US")}</time></span></span>
        </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
