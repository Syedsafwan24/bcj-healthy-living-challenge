import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { ariaSort, sortHref, type SortContext } from "@/lib/sorting";
import { cn } from "@/lib/utils";

/**
 * A sortable column header.
 *
 * Renders a `<th>` containing an ordinary link, so sorting works without
 * JavaScript, the sorted URL can be shared, and the header is middle-clickable.
 * `aria-sort` tells a screen reader which column orders the table and in which
 * direction; the arrow is decorative and hidden from it.
 *
 * Columns that cannot be sorted stay plain `<TableHead>` elements with no
 * `aria-sort`, so only sortable columns advertise themselves as such.
 */
export function SortableHeader<K extends string>({
  ctx,
  column,
  children,
  align = "left",
  className,
}: {
  ctx: SortContext<K>;
  column: K;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const active = ctx.state.key === column;
  const Icon = !active
    ? ChevronsUpDown
    : ctx.state.dir === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <TableHead
      aria-sort={ariaSort(ctx.state, column)}
      className={cn(align === "right" && "text-right", className)}
    >
      <Link
        href={sortHref(ctx, column)}
        scroll={false}
        className={cn(
          "group -mx-2 flex h-10 items-center gap-1.5 rounded px-2 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="whitespace-nowrap">{children}</span>
        <Icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
          )}
        />
      </Link>
    </TableHead>
  );
}
