import { AlertTriangle } from "lucide-react";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

import { AccountRowActions, InviteForm } from "./account-forms";

export const metadata: Metadata = { title: "Organiser accounts" };
export const dynamic = "force-dynamic";

/**
 * `/admin/accounts` — invite, disable, revoke sessions
 * (specification section 5.2, rules in section 2.3).
 */
export default async function AccountsPage() {
  const session = await requireAdmin();
  const settings = await getSettings();

  const rows = await db
    .select({
      id: admins.id,
      email: admins.email,
      name: admins.name,
      status: admins.status,
      totpEnrolledAt: admins.totpEnrolledAt,
      lockedUntil: admins.lockedUntil,
      lastLoginAt: admins.lastLoginAt,
      lastLoginIp: admins.lastLoginIp,
      inviteExpiresAt: admins.inviteExpiresAt,
      recoveryCodes: admins.recoveryCodes,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(asc(admins.createdAt));

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Organiser accounts
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {env.adminRequireTotp
            ? "Every organiser signs in with an email, a password and an authenticator code. There is no self-registration."
            : "Every organiser signs in with an email and a password. There is no self-registration. Two-factor authentication is currently switched off with ADMIN_REQUIRE_TOTP."}
        </p>
      </header>

      {activeCount < 2 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {activeCount === 1
              ? "Only one active organiser account"
              : "No active organiser accounts"}
          </AlertTitle>
          <AlertDescription>
            Section 2.3 requires at least two. With mandatory two-factor
            authentication and no email-only reset path, one account plus a lost
            phone locks BCJ out of its own competition.
          </AlertDescription>
        </Alert>
      )}

      <InviteForm requireTotp={env.adminRequireTotp} />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organiser</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Two-factor</TableHead>
              <TableHead className="hidden xl:table-cell">Last sign-in</TableHead>
              <TableHead className="w-56 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const locked = row.lockedUntil && row.lockedUntil > new Date();
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">
                      {row.name}
                      {row.id === session.adminId && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          you
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>

                  <TableCell className="space-x-1">
                    {row.status === "active" && (
                      <Badge className="bg-green-600 text-white">Active</Badge>
                    )}
                    {row.status === "invited" && (
                      <Badge variant="secondary">
                        Invited
                        {row.inviteExpiresAt &&
                        row.inviteExpiresAt < new Date()
                          ? " · expired"
                          : ""}
                      </Badge>
                    )}
                    {row.status === "disabled" && (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                    {locked && <Badge variant="destructive">Locked</Badge>}
                  </TableCell>

                  <TableCell className="hidden text-sm lg:table-cell">
                    {row.totpEnrolledAt ? (
                      <span>
                        Enrolled
                        <span className="block text-xs text-muted-foreground">
                          {row.recoveryCodes.length} recovery code
                          {row.recoveryCodes.length === 1 ? "" : "s"} left
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not enrolled</span>
                    )}
                  </TableCell>

                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                    {row.lastLoginAt
                      ? formatDateTime(row.lastLoginAt, settings.timezone)
                      : "Never"}
                    {row.lastLoginIp && (
                      <span className="block font-mono">{row.lastLoginIp}</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <AccountRowActions
                      adminId={row.id}
                      email={row.email}
                      status={row.status}
                      locked={Boolean(locked)}
                      isSelf={row.id === session.adminId}
                      isLastActive={row.status === "active" && activeCount <= 1}
                      requireTotp={env.adminRequireTotp}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Inviting, disabling and re-enabling an account each ask for your
        password{env.adminRequireTotp ? " and authenticator code" : ""} again,
        whatever your session says, and each is written to the audit history.
      </p>
    </div>
  );
}
