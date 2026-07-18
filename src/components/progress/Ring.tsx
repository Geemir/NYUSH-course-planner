"use client";

const SIZE = 112;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function arc(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return `${CIRCUMFERENCE * clamped} ${CIRCUMFERENCE}`;
}

export function Ring({
  label,
  color,
  planned,
  completed,
  center,
  sub,
}: {
  label: string;
  color: string;
  /** 0..1 fraction covered by the whole plan. */
  planned: number;
  /** 0..1 fraction already earned (completed semesters). */
  completed: number;
  center: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1" title={sub}>
      <div className="relative">
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeOpacity={0.3}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={arc(planned)}
            className="transition-[stroke-dashoffset] duration-[var(--motion-standard)] ease-out motion-reduce:transition-none"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={arc(completed)}
            className="transition-[stroke-dashoffset] duration-[var(--motion-standard)] ease-out motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{center}</span>
        </div>
      </div>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}
