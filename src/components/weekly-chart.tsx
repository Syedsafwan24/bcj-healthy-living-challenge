"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { scoreBand } from "@/lib/scoring";

/**
 * Weekly progress — build specification section 9.1 and 9.5.
 *
 * Each bar carries its own score band rather than one series colour, so a
 * participant sees the direction of a week before reading the number.
 */

const BAND_FILL = {
  low: "var(--band-low)",
  mid: "var(--band-mid)",
  good: "var(--band-good)",
  high: "var(--band-high)",
} as const;

const config = {
  percentage: { label: "Weekly percentage" },
} satisfies ChartConfig;

export function WeeklyChart({
  data,
}: {
  data: Array<{ week: number; percentage: number; recorded: boolean }>;
}) {
  const rows = data.map((row) => ({
    label: `W${row.week}`,
    week: row.week,
    percentage: row.percentage,
    fill: row.recorded ? BAND_FILL[scoreBand(row.percentage)] : "var(--muted)",
  }));

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={rows} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={46}
          tickFormatter={(value) => `${value}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Week ${String(label).replace("W", "")}`}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, " "]}
            />
          }
        />
        <Bar dataKey="percentage" radius={[6, 6, 0, 0]} maxBarSize={44}>
          <LabelList
            dataKey="percentage"
            position="top"
            fontSize={11}
            className="fill-muted-foreground"
            formatter={(value: unknown) =>
              Number(value) > 0 ? Number(value).toFixed(0) : ""
            }
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
