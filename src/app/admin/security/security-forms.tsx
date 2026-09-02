"use client";

import { Check, Copy, Monitor } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Field } from "@/components/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

import {
  changePassword,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeOwnSession,
  type SecurityState,
} from "./actions";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Recovery codes                                                      */
/* ------------------------------------------------------------------ */

export function RecoveryCodesForm({
  codesLeft,
  requireTotp,
}: {
  codesLeft: number;
  requireTotp: boolean;
}) {
  const [state, action] = useActionState<SecurityState | null, FormData>(
    regenerateRecoveryCodes,
    null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recovery codes</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Eight single-use codes that sign you in if you lose your phone. Only
          hashes are stored, so a new set replaces the old one entirely.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {state?.recoveryCodes ? (
          <>
            <Alert>
              <AlertTitle>Save these now</AlertTitle>
              <AlertDescription>
                Your previous codes no longer work. These are shown only on this
                screen.
              </AlertDescription>
            </Alert>
            <ul className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-4">
              {state.recoveryCodes.map((code) => (
                <li key={code} className="font-mono text-sm tracking-wider">
                  {code}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  state.recoveryCodes!.join("\n"),
                );
                setCopied(true);
                toast.success("Recovery codes copied");
              }}
            >
              {copied ? (
                <Check className="mr-2 size-4" />
              ) : (
                <Copy className="mr-2 size-4" />
              )}
              Copy all
            </Button>
          </>
        ) : (
          <form action={action} className="space-y-4">
            <p className="tabular text-sm text-muted-foreground">
              {codesLeft} of 8 codes unused.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="rc-password" label="Your password" required>
                <Input
                  id="rc-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-11"
                />
              </Field>
              {requireTotp && (
                <Field id="rc-totp" label="Authenticator code" required>
                  <Input
                    id="rc-totp"
                    name="totp"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    required
                    className="tabular h-11 text-center tracking-[0.3em]"
                  />
                </Field>
              )}
            </div>
            <Submit label="Issue new codes" pendingLabel="Issuing…" />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Password                                                            */
/* ------------------------------------------------------------------ */

export function ChangePasswordForm({
  requireTotp,
}: {
  requireTotp: boolean;
}) {
  const [state, action] = useActionState<SecurityState | null, FormData>(
    changePassword,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    if (state?.error) toast.error(state.error);
  }, [state]);

  const errors = state?.errors ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Change your password</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          There is no forced rotation. Change it if you think the current one is
          known to someone else.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-5">
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="currentPassword" label="Current password" required>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                className="h-11"
              />
            </Field>
            {requireTotp && (
              <Field id="pw-totp" label="Authenticator code" required>
                <Input
                  id="pw-totp"
                  name="totp"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                  className="tabular h-11 text-center tracking-[0.3em]"
                />
              </Field>
            )}
            <Field
              id="newPassword"
              label="New password"
              required
              error={errors.newPassword}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters. No composition rules.`}
            >
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                className="h-11"
              />
            </Field>
            <Field
              id="confirmPassword"
              label="Confirm new password"
              required
              error={errors.confirmPassword}
            >
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className="h-11"
              />
            </Field>
          </div>

          <Submit label="Change password" pendingLabel="Changing…" />
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  idleExpiresAt: string | null;
  revoked: boolean;
  isCurrent: boolean;
}

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const [revokeState, revokeAction] = useActionState<SecurityState | null, FormData>(
    revokeOwnSession,
    null,
  );
  const [allState, allAction] = useActionState<SecurityState | null, FormData>(
    async () => revokeOtherSessions(),
    null,
  );

  useEffect(() => {
    for (const state of [revokeState, allState]) {
      if (state?.ok && state.message) toast.success(state.message);
      if (state?.error) toast.error(state.error);
    }
  }, [revokeState, allState]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Active sessions</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Organiser sessions expire 8 hours after sign-in, or after 30 minutes
          of inactivity, whichever comes first.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-xl border">
          {sessions.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No sessions on record.
            </li>
          ) : (
            sessions.map((row) => (
              <li key={row.id} className="flex items-start gap-3 p-4">
                <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{row.ip ?? "unknown IP"}</span>
                    {row.isCurrent && <Badge variant="secondary">this device</Badge>}
                    {row.revoked && <Badge variant="outline">revoked</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.userAgent ?? "Unknown browser"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Started {row.createdAt} · expires {row.expiresAt}
                    {row.idleExpiresAt ? ` · idle until ${row.idleExpiresAt}` : ""}
                  </p>
                </div>
                {!row.revoked && (
                  <form action={revokeAction}>
                    <input type="hidden" name="sessionId" value={row.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      className="h-11"
                    >
                      Revoke
                    </Button>
                  </form>
                )}
              </li>
            ))
          )}
        </ul>

        <form action={allAction}>
          <Button type="submit" variant="outline" className="h-11">
            Sign out everywhere
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
