"use client";

import { Plane } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HOME_SITE, SITES, SITES_BY_ID } from "@/lib/data";
import { SemesterId } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";
import { cn } from "@/lib/utils";

export function StudyAwaySelect({ semesterId }: { semesterId: SemesterId }) {
  const siteId = usePlannerStore(
    (s) => s.studyAway[semesterId] ?? HOME_SITE.id,
  );
  const setStudyAway = usePlannerStore((s) => s.setStudyAway);
  const isAway = siteId !== HOME_SITE.id;

  return (
    <Select
      value={siteId}
      onValueChange={(value) =>
        setStudyAway(
          semesterId,
          value === HOME_SITE.id ? null : (value as string),
        )
      }
    >
      <SelectTrigger
        size="sm"
        aria-label="Study away site"
        className={cn(
          "h-11 gap-1 border-dashed px-3 text-sm data-[size=sm]:h-11",
          isAway && "border-sky-500/60 text-sky-600 dark:text-sky-400",
        )}
      >
        {isAway && <Plane className="size-3.5" />}
        <SelectValue>
          {(value: string) => SITES_BY_ID.get(value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SITES.map((site) => (
          <SelectItem key={site.id} value={site.id}>
            {site.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
