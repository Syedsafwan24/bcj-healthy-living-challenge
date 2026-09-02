import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-11 w-48 rounded-lg" />
      <TableSkeleton rows={3} columns={5} />
    </div>
  );
}
