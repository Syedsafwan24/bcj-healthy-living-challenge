import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-14 w-full max-w-3xl rounded-lg" />
      <TableSkeleton rows={12} columns={6} />
    </div>
  );
}
