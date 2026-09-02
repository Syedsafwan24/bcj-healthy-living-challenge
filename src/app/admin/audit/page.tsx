import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countAudit, listAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit history" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const ACTION_FILTERS = [
  { value: "", label: "Everything" },
  { value: "entry.admin_corrected", label: "Corrections" },
  { value: "entry.self_corrected", label: "Self-corrections" },
  { value: "settings.changed", label: "Settings" },
  { value: "health.viewed", label: "Health views" },
  { value: "admin.login_failed", label: "Failed sign-ins" },
  { value: "export.generated", label: "Exports" },
];

/**
 * `/admin/audit` — audit history (specification section 5.2, V5 section 12,
 * V6 section 8).
 *
 * The table is append-only: the application role holds INSERT and SELECT on
 * it and nothing else, so nothing on this screen can edit or remove a row.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityId?: string; page?: string }>;
}) {
  await requireAdmin();
  const settings = await getSettings();
  const params = await searchParams;

  const action = params.action ?? "";
  const entityId = params.entityId;
  const page = Math.max(1, Number(params.page) || 1);

  const filter = {
    action: action || undefined,
    entityId,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const [rows, total] = await Promise.all([
    listAudit(filter),
    countAudit(filter),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Audit history</h1>
        <p className="text-sm text-muted-foreground">
          {total} record{total === 1 ? "" : "s"}. Append-only: entries cannot be
          edited or deleted from this application.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {ACTION_FILTERS.map((option) => (
            <Button
              key={option.value || "all"}
              asChild
              size="sm"
              variant={action === option.value ? "secondary" : "ghost"}
              className="h-9"
            >
              <Link
                href={{
                  pathname: "/admin/audit",
                  query: {
                    ...(option.value ? { action: option.value } : {}),
                    ...(entityId ? { entityId } : {}),
                  },
                }}
              >
                {option.label}
              </Link>
            </Button>
          ))}
        </div>

        {entityId && (
          <Badge variant="outline" className="gap-2">
            Filtered to one record
            <Link
              href={{
                pathname: "/admin/audit",
                query: action ? { action } : {},
              }}
              className="underline underline-offset-2"
            >
              clear
            </Link>
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="hidden lg:table-cell">Field</TableHead>
              <TableHead className="hidden lg:table-cell">Change</TableHead>
              <TableHead className="hidden xl:table-cell">Reason</TableHead>
              <TableHead className="hidden text-right xl:table-cell">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-muted-foreground"
                >
                  Nothing recorded for this filter yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt, settings.timezone)}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {row.action}
                    </code>
                    {row.entityId && (
                      <Link
                        href={`/admin/audit?entityId=${row.entityId}`}
                        className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        trace
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.adminName ? (
                      <span>
                        {row.adminName}
                        <span className="block text-xs text-muted-foreground">
                          organiser
                        </span>
                      </span>
                    ) : row.participantName ? (
                      <span>
                        {row.participantName}
                        <span className="block text-xs text-muted-foreground">
                          {row.participantRegistrationId}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">system</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {row.field ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden max-w-72 lg:table-cell">
                    {row.field || row.oldValue || row.newValue ? (
                      <span className="text-xs">
                        <span className="text-muted-foreground line-through">
                          {truncate(row.oldValue)}
                        </span>
                        {" → "}
                        <span className="font-medium">{truncate(row.newValue)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate text-xs text-muted-foreground xl:table-cell">
                    {row.reason ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs text-muted-foreground xl:table-cell">
                    {row.ip ?? "—"}
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
                pathname: "/admin/audit",
                query: { action, entityId, page: page - 1 },
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
                pathname: "/admin/audit",
                query: { action, entityId, page: page + 1 },
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

function truncate(value: string | null, length = 40): string {
  if (value === null) return "empty";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
