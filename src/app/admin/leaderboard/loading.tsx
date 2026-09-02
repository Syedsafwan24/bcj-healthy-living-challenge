import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <Skeleton className="h-14 w-full max-w-lg rounded-lg" />
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
