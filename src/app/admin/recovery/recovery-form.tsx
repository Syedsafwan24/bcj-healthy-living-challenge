"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { adminRecoverySignIn, type AdminLoginState } from "../login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Checking…" : "Sign in"}
    </Button>
  );
}

export function RecoveryForm() {
  const [state, action] = useActionState<AdminLoginState | null, FormData>(
    adminRecoverySignIn,
    null,
  );

  return (
    <form action={action} className="space-y-5">
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

      <Field
        id="recoveryCode"
        label="Recovery code"
        required
        hint="One of the eight codes shown when you enrolled. It will be used up."
      >
        <Input
          id="recoveryCode"
          name="recoveryCode"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          placeholder="XXXXX-XXXXX"
          className="h-11 font-mono tracking-wider uppercase"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
