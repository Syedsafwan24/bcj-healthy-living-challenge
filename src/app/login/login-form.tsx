"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { signIn, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

/**
 * `/login` — a single field for the registration ID (specification 5.1).
 *
 * The ID is shown in JetBrains Mono as the participant types, so 0 and O are
 * distinguishable while they read it off a phone or a piece of paper.
 */
export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState<LoginState | null, FormData>(signIn, null);

  const notice =
    params.get("pending") === "1"
      ? "That registration is on hold. Speak to a BCJ organiser."
      : params.get("withdrawn") === "1"
        ? "That registration has been withdrawn."
        : null;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={params.get("next") ?? ""} />

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field
        id="registrationId"
        label="Registration ID"
        required
        hint="The code emailed to you when you registered. It ends with the first four letters of your name, for example BCJ0001-SYED."
      >
        <Input
          id="registrationId"
          name="registrationId"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="BCJ0000-NAME"
          className="h-12 font-mono text-lg tracking-[0.08em] uppercase placeholder:tracking-normal placeholder:normal-case"
        />
      </Field>

      <SubmitButton />

      <div className="flex flex-col gap-2 pt-2 text-sm">
        <Link
          href="/login/recover"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          I have lost my registration ID
        </Link>
        <Link
          href="/register"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          I have not registered yet
        </Link>
      </div>
    </form>
  );
}
