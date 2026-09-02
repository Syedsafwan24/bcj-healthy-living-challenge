"use client";

/* eslint-disable @next/next/no-img-element */

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

import { acceptInvite, finishEnrolment, type AcceptState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Setting up…" : "Finish setup"}
    </Button>
  );
}

export function AcceptInviteForm({
  token,
  secret,
  qrDataUrl,
  uri,
  requireTotp,
}: {
  token: string;
  secret: string;
  qrDataUrl: string;
  uri: string;
  requireTotp: boolean;
}) {
  const [state, action] = useActionState<AcceptState | null, FormData>(
    acceptInvite,
    null,
  );
  const [showSecret, setShowSecret] = useState(false);

  // Shown once, after enrolment succeeds. Only hashes are stored, so these
  // cannot be produced again.
  if (state?.recoveryCodes) {
    return <RecoveryCodes codes={state.recoveryCodes} />;
  }

  const errors = state?.errors ?? {};

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="secret" value={secret} />

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="font-semibold">
          {requireTotp ? "1. Choose a password" : "Choose a password"}
        </h2>
        <Field
          id="password"
          label="Password"
          required
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. There are no composition rules and you will never be asked to rotate it — a long passphrase is the best choice.`}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="h-11"
          />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirm password"
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
      </section>

      {requireTotp && (
        <>
      <Separator />

      <section className="space-y-4">
        <h2 className="font-semibold">2. Enrol your authenticator app</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Scan this with Google Authenticator, Microsoft Authenticator, Aegis or
          any other TOTP app, then type the six-digit code it shows.
        </p>

        <div className="flex justify-center rounded-xl border bg-background p-4">
          <img
            src={qrDataUrl}
            alt="QR code for enrolling this account in your authenticator app"
            width={220}
            height={220}
          />
        </div>

        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSecret((v) => !v)}
          >
            {showSecret ? "Hide" : "Cannot scan? Enter the key by hand"}
          </Button>
          {showSecret && (
            <div className="mt-2 space-y-2">
              <p className="font-mono text-sm break-all">{secret}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(uri);
                  toast.success("Setup link copied");
                }}
              >
                <Copy className="mr-2 size-3.5" />
                Copy setup link
              </Button>
            </div>
          )}
        </div>

        <Field
          id="totp"
          label="Code from your app"
          required
          error={errors.totp}
        >
          <Input
            id="totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="000000"
            className="tabular h-11 text-center text-lg tracking-[0.4em]"
          />
        </Field>
      </section>
        </>
      )}

      <SubmitButton />
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-6">
      <Alert>
        <KeyRound className="size-4" />
        <AlertTitle>Save these recovery codes now</AlertTitle>
        <AlertDescription>
          Each one signs you in once if you lose your phone. They are shown only
          on this screen — only hashes are stored, so they cannot be shown
          again. There is no password-reset link that skips two-factor
          authentication.
        </AlertDescription>
      </Alert>

      <ul className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-4">
        {codes.map((code) => (
          <li key={code} className="font-mono text-sm tracking-wider">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
            toast.success("Recovery codes copied");
          }}
        >
          {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
          Copy all
        </Button>

        <form action={finishEnrolment}>
          <Button type="submit" size="lg" className="h-11">
            I have saved them — continue
          </Button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground">
        Section 2.3 of the build specification requires at least two organiser
        accounts. If you are the first, invite a second from Accounts as soon as
        you are signed in.
      </p>
    </div>
  );
}
