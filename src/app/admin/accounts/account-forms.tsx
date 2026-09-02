"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Field } from "@/components/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  inviteAdmin,
  setAdminStatus,
  unlockAdmin,
  type AccountState,
} from "./actions";

/**
 * Section 2.3: creating or disabling an admin account asks for the password
 * and TOTP again, regardless of an active session.
 */
function ReauthFields({
  prefix,
  requireTotp,
}: {
  prefix: string;
  requireTotp: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${prefix}-password`} label="Your password" required>
        <Input
          id={`${prefix}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </Field>
      {requireTotp && (
        <Field id={`${prefix}-totp`} label="Your authenticator code" required>
          <Input
            id={`${prefix}-totp`}
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
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function InviteForm({ requireTotp }: { requireTotp: boolean }) {
  const [state, action] = useActionState<AccountState | null, FormData>(
    inviteAdmin,
    null,
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    if (state?.error) toast.error(state.error);
  }, [state]);

  const errors = state?.errors ?? {};

  if (!open) {
    return (
      <div className="space-y-4">
        <Button onClick={() => setOpen(true)} className="h-11 gap-2">
          <UserPlus className="size-4" />
          Invite an organiser
        </Button>
        {state?.inviteUrl && (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>
                The invitation email could not be sent. Pass this link on
                yourself — it is single use and expires in 48 hours.
              </p>
              <code className="block break-all rounded bg-muted p-2 font-mono text-xs">
                {state.inviteUrl}
              </code>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Invite an organiser</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          They receive a single-use link, valid for 48 hours
          {requireTotp
            ? ", and set their password and enrol an authenticator app in one step."
            : ", and set their password."}
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
            <Field id="invite-name" label="Full name" required error={errors.name}>
              <Input id="invite-name" name="name" required className="h-11" />
            </Field>
            <Field id="invite-email" label="Email" required error={errors.email}>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                className="h-11"
              />
            </Field>
          </div>

          <ReauthFields prefix="invite" requireTotp={requireTotp} />

          <div className="flex flex-wrap gap-2">
            <Submit label="Send invitation" pendingLabel="Sending…" />
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountRowActions({
  adminId,
  email,
  status,
  locked,
  isSelf,
  isLastActive,
  requireTotp,
}: {
  adminId: string;
  email: string;
  status: string;
  locked: boolean;
  isSelf: boolean;
  isLastActive: boolean;
  requireTotp: boolean;
}) {
  const [statusState, statusAction] = useActionState<AccountState | null, FormData>(
    setAdminStatus,
    null,
  );
  const [unlockState, unlockAction] = useActionState<AccountState | null, FormData>(
    unlockAdmin,
    null,
  );

  useEffect(() => {
    for (const state of [statusState, unlockState]) {
      if (state?.ok && state.message) toast.success(state.message);
      if (state?.error) toast.error(state.error);
    }
  }, [statusState, unlockState]);

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {locked && (
        <form action={unlockAction}>
          <input type="hidden" name="adminId" value={adminId} />
          <Button type="submit" size="sm" variant="outline" className="h-11">
            Clear lockout
          </Button>
        </form>
      )}

      {status !== "disabled" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-11"
              disabled={isLastActive}
              title={
                isLastActive
                  ? "The last active organiser cannot be disabled."
                  : undefined
              }
            >
              Disable
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form action={statusAction}>
              <input type="hidden" name="adminId" value={adminId} />
              <input type="hidden" name="status" value="disabled" />
              <AlertDialogHeader>
                <AlertDialogTitle>Disable {email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every live session for this account is revoked immediately.
                  {isSelf
                    ? " This is your own account — you will be signed out."
                    : ""}{" "}
                  Confirm with your own password
                  {requireTotp ? " and authenticator code" : ""}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <ReauthFields prefix={`disable-${adminId}`} requireTotp={requireTotp} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <AlertDialogAction type="submit">
                  Disable the account
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-11">
              Re-enable
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form action={statusAction}>
              <input type="hidden" name="adminId" value={adminId} />
              <input type="hidden" name="status" value="active" />
              <AlertDialogHeader>
                <AlertDialogTitle>Re-enable {email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their existing password and authenticator enrolment still
                  apply. Confirm with your own password
                  {requireTotp ? " and authenticator code" : ""}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <ReauthFields prefix={`enable-${adminId}`} requireTotp={requireTotp} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <AlertDialogAction type="submit">Re-enable</AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
