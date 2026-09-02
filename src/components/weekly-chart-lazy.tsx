"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loads the weekly chart only when it is needed.
 *
 * Recharts is by far the heaviest thing the participant side ships, and it is
 * the one page most likely to be opened on a mid-range phone over mobile data.
 * The score, the final total and the week-by-week list all sit above the chart
 * and render immediately; the chart arrives a moment later in its own chunk.
 *
 * `ssr: false` keeps it out of the server render too — a bar chart is of no use
 * to a crawler, and it avoids shipping the markup twice.
 */
export const WeeklyChart = dynamic(
  () => import("@/components/weekly-chart").then((m) => m.WeeklyChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);
