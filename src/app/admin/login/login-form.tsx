"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { adminSignIn, type AdminLoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Checking…" : "Sign in"}
    </Button>
  );
}

export function AdminLoginForm({
  requireTotp,
}: {
  requireTotp: boolean;
}) {
  const params = useSearchParams();
  const [state, action] = useActionState<AdminLoginState | null, FormData>(
    adminSignIn,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={params.get("next") ?? ""} />

      {params.get("enrol") === "1" && (
        <Alert>
          <AlertDescription>
            Your account has not finished enrolling an authenticator app. Open
            your invitation link again, or ask another organiser to re-invite
            you.
          </AlertDescription>
        </Alert>
      )}

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field id="email" label="Email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="h-11"
        />
      </Field>

      <Field id="password" label="Password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </Field>

      {requireTotp && (
        <Field
          id="totp"
          label="Authenticator code"
          required
          hint="The 6-digit code currently shown in your authenticator app."
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
      )}

      <SubmitButton />
    </form>
  );
}
