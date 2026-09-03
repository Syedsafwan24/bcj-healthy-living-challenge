"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Field, FormSection } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bloodGroups, diabetesOptions } from "@/lib/validation";

import { registerParticipant, type RegisterResult } from "./actions";

/**
 * Registration form — build specification section 10.
 *
 * Page 1 of the Google Form, plus the email address the form does not
 * collect. Email is required here because the registration ID is delivered
 * by email and the lost-ID recovery flow depends on it (open item O-7).
 *
 * Weight is required, because it determines the diet category in V5 section 6.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full sm:w-auto">
      {pending ? "Registering…" : "Complete registration"}
    </Button>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [state, action] = useActionState<RegisterResult | null, FormData>(
    registerParticipant,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.registrationId) {
      const params = new URLSearchParams({
        id: state.registrationId,
        emailed: state.emailed ? "1" : "0",
      });
      router.replace(`/register/success?${params.toString()}`);
    }
  }, [state, router]);

  useEffect(() => {
    if (state && !state.ok && state.errors) {
      toast.error("Check the highlighted fields and try again.");
    }
  }, [state]);

  const errors = state?.errors ?? {};

  return (
    <form action={action} className="space-y-10" noValidate>
      {errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <FormSection
        title="Who you are"
        description="This is the name BCJ will know you by, including on the leaderboard if one is published."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="fullName" label="Full name" required error={errors.fullName}>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              className="h-11"
            />
          </Field>

          <Field
            id="email"
            label="Email address"
            required
            error={errors.email}
            hint="Your registration ID is sent here. One address may register several people — each gets their own ID."
          >
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className="h-11"
            />
          </Field>

          <Field id="mobile" label="Mobile number" required error={errors.mobile}>
            <Input
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+966 5X XXX XXXX"
              required
              className="h-11"
            />
          </Field>

          <Field
            id="age"
            label="Age"
            error={errors.age}
            hint="Optional. Helps BCJ suggest the right diet plan."
          >
            <Input
              id="age"
              name="age"
              type="number"
              inputMode="numeric"
              min={10}
              max={100}
              className="h-11"
            />
          </Field>

          <Field id="gender" label="Gender" required error={errors.gender}>
            <Select name="gender" required>
              <SelectTrigger id="gender" className="h-11 w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <Separator />

      <FormSection
        title="Measurements"
        description="Optional. Weight helps BCJ suggest the right diet plan; an organiser can also assign one for you later."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="weightKg" label="Weight (kg)" error={errors.weightKg}>
            <Input
              id="weightKg"
              name="weightKg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={20}
              max={300}
              className="h-11"
            />
          </Field>
        </div>
      </FormSection>

      <Separator />

      <FormSection
        title="Health baseline"
        description="Every field here is optional. It is seen only by BCJ organisers, never by other participants, and never appears on the leaderboard or in any export you receive."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="bloodGroup" label="Blood group" error={errors.bloodGroup}>
            <Select name="bloodGroup">
              <SelectTrigger id="bloodGroup" className="h-11 w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {bloodGroups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="diabetesStatus"
            label="Diabetes or sugar"
            error={errors.diabetesStatus}
          >
            <Select name="diabetesStatus">
              <SelectTrigger id="diabetesStatus" className="h-11 w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {diabetesOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <Separator />

      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You can start straight away. Your registration ID
          appears on the next screen and is emailed to the address above.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
