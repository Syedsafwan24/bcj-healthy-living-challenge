import {
  ChallengeRowsSkeleton,
  ScoreCardSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <ScoreCardSkeleton />
      <ChallengeRowsSkeleton />
    </div>
  );
}
