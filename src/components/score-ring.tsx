import { scoreBand, type ScoreBand } from "@/lib/scoring";
import { cn } from "@/lib/utils";

/**
 * The daily score ring — build specification section 9.5.
 *
 * The percentage is large at the top with points over maximum beneath, as
 * V6 section 6 requires. The ring is filled with the score band from section
 * 9.1, so the colour and the number agree.
 *
 * The score is always shown as a number and never carried by colour alone.
 */

const BAND_STROKE: Record<ScoreBand, string> = {
  low: "var(--band-low)",
  mid: "var(--band-mid)",
  good: "var(--band-good)",
  high: "var(--band-high)",
};

const BAND_LABEL: Record<ScoreBand, string> = {
  low: "Below half",
  mid: "Halfway",
  good: "Strong day",
  high: "Excellent day",
};

interface ScoreRingProps {
  percentage: number;
  points: number;
  maxPoints: number;
  size?: number;
  /** Hides the points line, for compact contexts such as a history cell. */
  compact?: boolean;
  className?: string;
}

export function ScoreRing({
  percentage,
  points,
  maxPoints,
  size = 208,
  compact = false,
  className,
}: ScoreRingProps) {
  const band = scoreBand(percentage);
  const stroke = Math.max(8, Math.round(size * 0.075));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const dash = (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${percentage.toFixed(1)} per cent, ${points} of ${maxPoints} points. ${BAND_LABEL[band]}.`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {/* A zero score draws nothing: a round cap on an empty arc would
            still paint a dot, which reads as a score. */}
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={BAND_STROKE[band]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* The daily percentage displays at 48 px — section 9.4. */}
        <span
          className="tabular font-semibold leading-none"
          style={{ fontSize: compact ? size * 0.24 : 48 }}
        >
          {Math.round(percentage)}
          <span className="text-[0.5em] font-medium text-muted-foreground">%</span>
        </span>
        {!compact && (
          <span className="tabular mt-2 text-sm text-muted-foreground">
            {points} / {maxPoints} points
          </span>
        )}
      </div>
    </div>
  );
}

/** A slim bar for the same value, used in tables and week rows. */
export function ScoreBar({
  percentage,
  className,
  label,
}: {
  percentage: number;
  className?: string;
  label?: string;
}) {
  const band = scoreBand(percentage);
  const clamped = Math.max(0, Math.min(100, percentage));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={label ?? `${percentage.toFixed(1)} per cent`}
      >
        {clamped > 0 && (
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${clamped}%`, background: BAND_STROKE[band] }}
          />
        )}
      </div>
      <span className="tabular w-14 text-right text-sm font-medium">
        {percentage.toFixed(1)}%
      </span>
    </div>
  );
}

export { BAND_LABEL };
