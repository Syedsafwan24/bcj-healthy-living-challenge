import {
  Bed,
  Brain,
  ChefHat,
  CupSoda,
  Droplet,
  Footprints,
  MoonStar,
  Salad,
  Smartphone,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import type { ChallengeConfig } from "@/lib/challenges";
import { cn } from "@/lib/utils";

/**
 * Metric hues — build specification sections 9.1 and 9.5.
 *
 * Every tracked metric has its own hue, chosen so the colour matches what is
 * being measured: cyan for water, orange for movement, indigo for sleep,
 * violet for mental rest. A participant reading a chart does not have to
 * consult a legend.
 *
 * Section 9.2: the metric hues are fill and stroke colours. They are not
 * button backgrounds, and where text sits on one it is n-900, never white.
 */

export type MetricKey =
  | "water"
  | "steps"
  | "sleep"
  | "nutrition"
  | "mind"
  | "vitals";

export const METRIC_VAR: Record<MetricKey, string> = {
  water: "var(--color-metric-water)",
  steps: "var(--color-metric-steps)",
  sleep: "var(--color-metric-sleep)",
  nutrition: "var(--color-metric-nutrition)",
  mind: "var(--color-metric-mind)",
  vitals: "var(--color-metric-vitals)",
};

const ICONS: Record<string, LucideIcon> = {
  droplet: Droplet,
  footprints: Footprints,
  "chef-hat": ChefHat,
  "cup-soda": CupSoda,
  salad: Salad,
  "moon-star": MoonStar,
  bed: Bed,
  brain: Brain,
  smartphone: Smartphone,
  utensils: Utensils,
};

/**
 * The icon tile beside a challenge row. The hue is the icon colour on a
 * 12% tint, so nothing depends on text sitting on a saturated fill.
 */
export function MetricIcon({
  metric,
  icon,
  size = "md",
  className,
}: {
  metric: MetricKey;
  icon: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = ICONS[icon] ?? Droplet;
  const box = size === "sm" ? "size-8" : "size-10";
  const glyph = size === "sm" ? 16 : 20;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        box,
        className,
      )}
      style={{
        background: `color-mix(in oklch, ${METRIC_VAR[metric]} 14%, transparent)`,
        color: METRIC_VAR[metric],
      }}
    >
      <Icon size={glyph} strokeWidth={2} />
    </span>
  );
}

export function ChallengeIcon({
  challenge,
  size = "md",
  className,
}: {
  challenge: ChallengeConfig;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <MetricIcon
      metric={challenge.metric}
      icon={challenge.icon}
      size={size}
      className={className}
    />
  );
}

/**
 * The small per-challenge progress bar. Carries the metric hue so water,
 * steps, sleep and diet stay identifiable across the log screen, the history
 * calendar and the charts.
 */
export function MetricBar({
  metric,
  value,
  max,
  className,
}: {
  metric: MetricKey;
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: METRIC_VAR[metric] }}
      />
    </div>
  );
}
