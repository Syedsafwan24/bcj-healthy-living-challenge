import { eq } from "drizzle-orm";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { listAdminSessions } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

import {
  ChangePasswordForm,
  RecoveryCodesForm,
  SessionsList,
} from "./security-forms";

export const metadata: Metadata = { title: "My security" };
export const dynamic = "force-dynamic";

/**
 * `/admin/security` — own TOTP enrolment, recovery codes, active sessions
 * (specification section 5.2, rules in section 2.3).
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ recovery?: string }>;
}) {
  const session = await requireAdmin();
  const settings = await getSettings();
  const params = await searchParams;

  const [me] = await db
    .select({
      totpEnrolledAt: admins.totpEnrolledAt,
      recoveryCodes: admins.recoveryCodes,
      lastLoginAt: admins.lastLoginAt,
      lastLoginIp: admins.lastLoginIp,
    })
    .from(admins)
    .where(eq(admins.id, session.adminId))
    .limit(1);

  const sessionRows = await listAdminSessions(session.adminId);
  const codesLeft = me?.recoveryCodes.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My security</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {session.email}.
        </p>
      </header>

      {env.adminRequireTotp && params.recovery === "1" && (
        <Alert>
          <KeyRound className="size-4" />
          <AlertTitle>You signed in with a recovery code</AlertTitle>
          <AlertDescription>
            That code has been used up. If you have lost your authenticator app,
            ask another organiser to re-invite your account so you can enrol a
            new one.
          </AlertDescription>
        </Alert>
      )}

      {env.adminRequireTotp && codesLeft <= 2 && (
        <Alert variant={codesLeft === 0 ? "destructive" : "default"}>
          <KeyRound className="size-4" />
          <AlertTitle>
            {codesLeft === 0
              ? "You have no recovery codes left"
              : `Only ${codesLeft} recovery code${codesLeft === 1 ? "" : "s"} left`}
          </AlertTitle>
          <AlertDescription>
            There is no password-reset link that skips two-factor
            authentication. Issue a fresh set below before you run out.
          </AlertDescription>
        </Alert>
      )}

      {/* ---- two-factor ---- */}
      {env.adminRequireTotp ? (
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-green-900 text-green-100">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <CardTitle className="text-lg">Two-factor authentication</CardTitle>
            <p className="text-sm text-muted-foreground">
              Required on every sign-in and cannot be turned off.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Authenticator app</dt>
              <dd className="text-sm font-medium">
                {me?.totpEnrolledAt ? (
                  <Badge className="bg-green-600 text-white">
                    Enrolled{" "}
                    {formatDateTime(me.totpEnrolledAt, settings.timezone)}
                  </Badge>
                ) : (
                  <Badge variant="destructive">Not enrolled</Badge>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Recovery codes</dt>
              <dd className="tabular text-sm font-medium">
                {codesLeft} of 8 unused
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Last sign-in</dt>
              <dd className="text-right text-sm font-medium">
                {me?.lastLoginAt
                  ? formatDateTime(me.lastLoginAt, settings.timezone)
                  : "—"}
                {me?.lastLoginIp && (
                  <span className="block font-mono text-xs text-muted-foreground">
                    {me.lastLoginIp}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      ) : (
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Two-factor authentication is switched off</AlertTitle>
          <AlertDescription>
            Organisers sign in with an email and a password only. Specification
            section 2.3 expects an authenticator code as well, because an
            organiser can change any score and read every participant&apos;s
            health data. Set ADMIN_REQUIRE_TOTP=true to turn it back on.
          </AlertDescription>
        </Alert>
      )}

      {env.adminRequireTotp && (
        <RecoveryCodesForm
          codesLeft={codesLeft}
          requireTotp={env.adminRequireTotp}
        />
      )}

      <ChangePasswordForm requireTotp={env.adminRequireTotp} />

      <SessionsList
        sessions={sessionRows.map((row) => ({
          id: row.id,
          ip: row.ip,
          userAgent: row.userAgent,
          createdAt: formatDateTime(row.createdAt, settings.timezone),
          expiresAt: formatDateTime(row.expiresAt, settings.timezone),
          idleExpiresAt: row.idleExpiresAt
            ? formatDateTime(row.idleExpiresAt, settings.timezone)
            : null,
          revoked: row.revokedAt !== null,
          isCurrent: row.id === session.sessionId,
        }))}
      />
    </div>
  );
}
