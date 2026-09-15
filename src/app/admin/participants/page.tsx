import Link from "next/link";
import { Search } from "lucide-react";
import type { Metadata } from "next";

import { ListExport } from "@/components/list-export";
import { RegistrationId } from "@/components/registration-id";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { CATEGORY_OPTIONS, categoryLabel } from "@/lib/participant-categories";
import {
  countParticipantsByCategory,
  listParticipants,
} from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Participants" };
export const dynamic = "force-dynamic";

const STATUSES = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "On hold" },
];

const PAGE_SIZE = 50;

/**
 * `/admin/participants` — register and activate participants, assign a diet
 * category (specification section 5.2).
 */
export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const settings = await getSettings();
  const params = await searchParams;

  const status = params.status ?? "all";
  // Anything unrecognised falls back to "all", so a hand-typed query string
  // cannot leave the screen showing an empty table with no explanation.
  const category =
    params.category &&
    CATEGORY_OPTIONS.some((option) => option.value === params.category)
      ? params.category
      : "all";
  const search = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listParticipants({
      status,
      category,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    // Counted without the category filter, so the cards keep offering the
    // categories you are not currently looking at.
    countParticipantsByCategory({ status, search: search || undefined }),
  ]);

  /** Keeps the other filters when one of them changes. */
  const queryWith = (next: { status?: string; category?: string }) => ({
    status: next.status ?? status,
    ...(next.category ?? category) !== "all"
      ? { category: next.category ?? category }
      : {},
    ...(search ? { q: search } : {}),
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Participants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} record{total === 1 ? "" : "s"}
            {category !== "all" ? ` in ${categoryLabel(category)}` : ""}
            {status !== "all" ? ` with status ${status}` : ""}
          </p>
        </div>
        {total > 0 && (
          <ListExport
            kind="participants"
            status={status}
            category={category}
            search={search}
          />
        )}
      </header>

      {/* ---- how the roster splits, and the filter for it ----
          The cards are the filter rather than sitting beside one: a count you
          cannot click is a count you then have to go and reproduce with a
          separate control. The counts ignore the category filter itself, so
          picking Kids still shows how many men and women there are. */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <CategoryCard
          label="All"
          count={counts.total}
          active={category === "all"}
          href={{
            pathname: "/admin/participants",
            query: queryWith({ category: "all" }),
          }}
        />
        {CATEGORY_OPTIONS.map((option) => (
          <CategoryCard
            key={option.value}
            label={option.label}
            count={counts.byCategory[option.value] ?? 0}
            active={category === option.value}
            href={{
              pathname: "/admin/participants",
              query: queryWith({ category: option.value }),
            }}
          />
        ))}
      </div>

      {/* ---- filters ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {STATUSES.map((option) => (
            <Button
              key={option.value}
              asChild
              size="sm"
              variant={status === option.value ? "secondary" : "ghost"}
              className="h-9"
            >
              <Link
                href={{
                  pathname: "/admin/participants",
                  query: queryWith({ status: option.value }),
                }}
              >
                {option.label}
              </Link>
            </Button>
          ))}
        </div>

        <form className="flex flex-1 items-center gap-2" action="/admin/participants">
          <input type="hidden" name="status" value={status} />
          {category !== "all" && (
            <input type="hidden" name="category" value={category} />
          )}
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={search}
              placeholder="Name, email, mobile or registration ID"
              className="h-11 pl-9"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </form>
      </div>

      {/* ---- table ---- */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead className="hidden md:table-cell">
                Registration ID
              </TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right xl:table-cell">
                Final score
              </TableHead>
              <TableHead className="hidden text-right xl:table-cell">
                Registered
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  No participants match this filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular text-muted-foreground">
                    {row.seqNo}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{row.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.displayName} · {row.email}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <RegistrationId value={row.registrationId} size="sm" />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="font-normal">
                      {categoryLabel(row.category)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="tabular hidden text-right xl:table-cell">
                    {row.finalScore ? Number(row.finalScore).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground xl:table-cell">
                    {formatDateTime(row.registeredAt, settings.timezone)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline" className="h-11">
                      <Link href={`/admin/participants/${row.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            asChild
            variant="outline"
            className={cn("h-11", page <= 1 && "pointer-events-none opacity-50")}
          >
            <Link
              href={{
                pathname: "/admin/participants",
                query: { status, q: search, page: page - 1 },
              }}
            >
              Previous
            </Link>
          </Button>
          <span className="tabular text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            asChild
            variant="outline"
            className={cn("h-11", page >= pages && "pointer-events-none opacity-50")}
          >
            <Link
              href={{
                pathname: "/admin/participants",
                query: { status, q: search, page: page + 1 },
              }}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One count, and the link that filters by it.
 *
 * A link rather than a button so it works without JavaScript, keeps the
 * filtered view shareable, and lets an organiser open a category in a new tab
 * — the same reasoning as the leaderboard's divisions and the settings tabs.
 */
function CategoryCard({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: React.ComponentProps<typeof Link>["href"];
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-xl border bg-card p-3 transition-colors hover:bg-muted/60 sm:p-4",
        active && "border-primary bg-secondary hover:bg-secondary",
      )}
    >
      <p className="truncate text-xs text-muted-foreground sm:text-sm">
        {label}
      </p>
      <p className="tabular mt-1 text-xl font-semibold sm:text-2xl">{count}</p>
    </Link>
  );
}
