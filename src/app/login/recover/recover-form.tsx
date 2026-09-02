"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { recoverIds, type LoginState } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Sending…" : "Send my registration IDs"}
    </Button>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState<LoginState | null, FormData>(
    recoverIds,
    null,
  );

  // The same confirmation is shown whether or not the address is known, so
  // the form cannot be used to discover who has registered.
  if (state?.ok) {
    return (
      <div className="space-y-5">
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            If that address is registered, every registration ID held against it
            has been emailed to it. Check your spam folder if nothing arrives in
            a few minutes.
          </AlertDescription>
        </Alert>
        <Button asChild size="lg" className="h-12 w-full">
          <Link href="/login">Back to sign-in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field id="email" label="Email address" required>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          autoFocus
          className="h-12"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
