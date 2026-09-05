"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMyDetails, type ProfileActionState } from "./actions";

/**
 * The editable half of /app/profile.
 *
 * Only the details that describe the person. Anything that decides a prize or
 * signs them in is shown read-only on the page above, with a line saying who
 * to ask — a disabled input would suggest the field is merely inconvenient to
 * change rather than deliberately not theirs to change.
 */

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11">
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function ProfileForm({
  profile,
}: {
  profile: {
    mobile: string;
    age: number | null;
    weightKg: string | null;
    reminderEmails: boolean;
  };
}) {
  const [state, action] = useActionState<ProfileActionState | null, FormData>(
    updateMyDetails,
    null,
  );
  const errors = state?.errors ?? {};

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="mobile" label="Mobile" required error={errors.mobile}>
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            defaultValue={profile.mobile}
            required
            className="h-11"
          />
        </Field>

        <Field
          id="age"
          label="Age"
          error={errors.age}
          hint="Leave empty if you would rather not say."
        >
          <Input
            id="age"
            name="age"
            type="number"
            min={10}
            max={100}
            defaultValue={profile.age ?? ""}
            className="tabular h-11"
          />
        </Field>

        <Field
          id="weightKg"
          label="Current weight (kg)"
          error={errors.weightKg}
          hint="Decides which diet plan suits you."
        >
          <Input
            id="weightKg"
            name="weightKg"
            type="number"
            step="0.01"
            min={20}
            max={300}
            defaultValue={profile.weightKg ?? ""}
            className="tabular h-11"
          />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <input
          type="checkbox"
          name="reminderEmails"
          defaultChecked={profile.reminderEmails}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="text-sm">
          <span className="font-medium">Remind me by email</span>
          <span className="mt-0.5 block text-muted-foreground">
            One message in the evening, only on days you have not filled in
            yet.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
