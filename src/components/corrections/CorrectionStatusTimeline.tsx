import { CheckCircle2, Circle } from "lucide-react";
import type { CorrectionEventDto, CorrectionStatus } from "@/lib/corrections/types";

export const correctionStatusLabel: Record<CorrectionStatus, string> = {
  submitted: "Submitted", in_review: "In review", needs_information: "Needs information",
  approved: "Approved", rejected: "Closed — not applied", applied: "Applied to planner",
};

export function CorrectionStatusTimeline({ events }: { events: CorrectionEventDto[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No timeline updates yet.</p>;
  return <ol className="space-y-3" aria-label="Report timeline">{events.map((event, index) => <li key={event.id} className="grid grid-cols-[1rem_1fr] gap-3 text-sm">
    {index === events.length - 1 ? <CheckCircle2 className="mt-0.5 size-4 text-primary" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
    <div><p className="font-medium">{event.toStatus ? correctionStatusLabel[event.toStatus] : event.eventType.replaceAll("_", " ")}</p>{event.publicNote && <p className="text-muted-foreground">{event.publicNote}</p>}<time className="text-xs text-muted-foreground" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("en-US")}</time></div>
  </li>)}</ol>;
}
