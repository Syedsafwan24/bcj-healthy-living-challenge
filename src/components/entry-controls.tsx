"use client";

import { Minus, Plus } from "lucide-react";

import { MetricBar, MetricIcon, type MetricKey } from "@/components/metric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChallengeConfig } from "@/lib/challenges";
import { cn } from "@/lib/utils";

/**
 * Entry controls — build specification section 9.5.
 *
 * Water, steps and sleep use number inputs with plus and minus buttons
 * stepping by 250 ml, 1,000 steps and 0.5 hours. The first two are the same
 * increments as one point, so the counter moves by one per tap, and the
 * conversion is shown live.
 *
 * Yes/No challenges use two buttons with neither selected by default. An
 * untouched control looks different from an explicit No, even though both
 * score zero.
 */

export type TriState = "yes" | "no" | "";

function formatValue(value: number, precision: number): string {
  return precision === 0 ? String(Math.round(value)) : value.toFixed(precision);
}

export function QuantitativeRow({
  challenge,
  value,
  points,
  onChange,
  disabled,
  isNew,
}: {
  challenge: ChallengeConfig;
  value: string;
  points: number;
  onChange: (next: string) => void;
  disabled?: boolean;
  isNew?: boolean;
}) {
  const step = challenge.step ?? 1;
  const precision = challenge.precision === 0 ? 0 : 2;
  const numeric = value === "" ? 0 : Number(value);
  const parsed = Number.isFinite(numeric) ? numeric : 0;

  function nudge(direction: 1 | -1) {
    const next = Math.max(0, parsed + direction * step);
    onChange(next === 0 && direction === -1 ? "0" : formatValue(next, precision));
  }

  const unitLabel = challenge.unitLabel ?? "";
  const display =
    challenge.field === "steps"
      ? `${parsed.toLocaleString("en-GB")} ${unitLabel}`
      : `${value === "" ? "0" : value} ${unitLabel}`;

  return (
    <ChallengeShell challenge={challenge} points={points} isNew={isNew}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          onClick={() => nudge(-1)}
          disabled={disabled || parsed <= 0}
          aria-label={`Decrease ${challenge.title} by ${step} ${unitLabel}`}
        >
          <Minus className="size-4" />
        </Button>

        <Input
          name={challenge.field}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          aria-label={challenge.title}
          className="tabular h-11 flex-1 text-center text-base font-medium"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          onClick={() => nudge(1)}
          disabled={disabled}
          aria-label={`Increase ${challenge.title} by ${step} ${unitLabel}`}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <MetricBar metric={challenge.metric} value={points} max={10} />
        <p className="tabular text-xs text-muted-foreground">
          {display} = {points} {points === 1 ? "point" : "points"}
          {points === 10 ? " — maximum reached" : ""}
        </p>
      </div>
    </ChallengeShell>
  );
}

export function YesNoRow({
  challenge,
  value,
  points,
  onChange,
  disabled,
  isNew,
}: {
  challenge: ChallengeConfig;
  value: TriState;
  points: number;
  onChange: (next: TriState) => void;
  disabled?: boolean;
  isNew?: boolean;
}) {
  return (
    <ChallengeShell challenge={challenge} points={points} isNew={isNew}>
      <input type="hidden" name={challenge.field} value={value} />
      <YesNoButtons
        value={value}
        onChange={onChange}
        disabled={disabled}
        label={challenge.title}
      />
      {value === "" && (
        <p className="mt-2 text-xs text-muted-foreground">Not answered yet.</p>
      )}
    </ChallengeShell>
  );
}

/**
 * The Yes/No pair. Neither is pressed until the participant chooses, so an
 * untouched control is visibly different from an explicit No.
 */
export function YesNoButtons({
  value,
  onChange,
  disabled,
  label,
  size = "default",
}: {
  value: TriState;
  onChange: (next: TriState) => void;
  disabled?: boolean;
  label: string;
  size?: "default" | "sm";
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => onChange((next as TriState) ?? "")}
      disabled={disabled}
      aria-label={label}
      className="w-full gap-2"
    >
      <ToggleGroupItem
        value="yes"
        aria-label={`${label}: yes`}
        className={cn(
          "flex-1 rounded-lg border data-[state=on]:border-green-600 data-[state=on]:bg-green-600 data-[state=on]:text-white",
          size === "sm" ? "h-11" : "h-11",
        )}
      >
        Yes
      </ToggleGroupItem>
      <ToggleGroupItem
        value="no"
        aria-label={`${label}: no`}
        className="h-11 flex-1 rounded-lg border data-[state=on]:border-n-600 data-[state=on]:bg-n-600 data-[state=on]:text-white"
      >
        No
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function ChallengeShell({
  challenge,
  points,
  isNew,
  children,
}: {
  challenge: ChallengeConfig;
  points: number;
  isNew?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4",
        isNew && "border-green-300 ring-1 ring-green-200 dark:ring-green-800",
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <MetricIcon metric={challenge.metric as MetricKey} icon={challenge.icon} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{challenge.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{challenge.hint}</p>
        </div>
        <span
          className="tabular shrink-0 rounded-md bg-muted px-2 py-1 text-sm font-semibold"
          aria-label={`${points} of 10 points`}
        >
          {points}
          <span className="text-xs font-normal text-muted-foreground">/10</span>
        </span>
      </div>
      {children}
    </div>
  );
}
