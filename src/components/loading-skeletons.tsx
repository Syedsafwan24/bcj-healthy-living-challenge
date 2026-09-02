import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders.
 *
 * Next renders the nearest `loading.tsx` the moment a navigation starts, so
 * the shell and the page's shape appear immediately instead of the browser
 * sitting on the previous screen while the server works. The point is not to
 * make the response faster — it is to make the click feel answered.
 *
 * Each skeleton mirrors the real layout closely enough that nothing jumps when
 * the content arrives.
 */

export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: i === 1 ? "28%" : `${Math.round(60 / columns)}%` }}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-4"
              style={{ width: i === 1 ? "28%" : `${Math.round(60 / columns)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {withAction && <Skeleton className="h-11 w-56" />}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-12 w-72 rounded-lg" />
      <Skeleton className="h-11 flex-1 min-w-52 rounded-lg" />
    </div>
  );
}

/** The daily score ring and its surrounding card, on /app. */
export function ScoreCardSkeleton() {
  return (
    <div className="flex flex-col items-center rounded-2xl border bg-card px-5 py-8">
      <Skeleton className="size-52 rounded-full" />
      <Skeleton className="mt-4 h-4 w-56" />
    </div>
  );
}

export function ChallengeRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-start gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-7 w-12 rounded-md" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
