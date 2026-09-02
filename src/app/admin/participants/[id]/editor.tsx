"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { updateParticipant, type ParticipantActionState } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12">
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export interface EditableParticipant {
  id: string;
  fullName: string;
  displayName: string;
  email: string;
  mobile: string;
  age: number;
  gender: string;
  areaOfResidence: string;
  residenceStatus: string;
  heightCm: string | null;
  weightKg: string;
  startingWeightKg: string | null;
  dietCategoryId: number | null;
  status: string;
}

/**
 * Every registration field is editable — registration is self-reported, so a
 * mis-typed name, age or gender has to be correctable without touching the
 * database.
 *
 * None of it changes a score. Scoring reads only the daily entries; age and
 * weight decide which diet category is *suggested* at sign-up, and the
 * category itself is set here. Every change is written to the audit history
 * field by field with the old and new value.
 */
export function ParticipantEditor({
  participant,
  categories,
  registeredAt,
}: {
  participant: EditableParticipant;
  categories: Array<{ id: number; title: string }>;
  registeredAt: string;
}) {
  const [state, action] = useActionState<ParticipantActionState | null, FormData>(
    updateParticipant,
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
        <CardTitle className="text-lg">Participant details</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Registered {registeredAt}. Correcting anything here is recorded in the
          audit history with the old and new value. No field on this screen
          changes a score.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-6">
          <input type="hidden" name="participantId" value={participant.id} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* ---- identity ---- */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="fullName" label="Full name" required error={errors.fullName}>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={participant.fullName}
                maxLength={120}
                required
                className="h-11"
              />
            </Field>

            <Field
              id="displayName"
              label="Display name"
              required
              error={errors.displayName}
              hint="Appears on the leaderboard."
            >
              <Input
                id="displayName"
                name="displayName"
                defaultValue={participant.displayName}
                maxLength={40}
                required
                className="h-11"
              />
            </Field>

            <Field id="email" label="Email" required error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={participant.email}
                required
                className="h-11"
              />
            </Field>

            <Field id="mobile" label="Mobile" required error={errors.mobile}>
              <Input
                id="mobile"
                name="mobile"
                defaultValue={participant.mobile}
                required
                className="h-11"
              />
            </Field>

            <Field id="age" label="Age" required error={errors.age}>
              <Input
                id="age"
                name="age"
                type="number"
                min={10}
                max={100}
                defaultValue={participant.age}
                required
                className="tabular h-11"
              />
            </Field>

            <Field id="gender" label="Gender" required error={errors.gender}>
              <Select name="gender" defaultValue={participant.gender}>
                <SelectTrigger id="gender" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="areaOfResidence"
              label="Area of residence"
              required
              error={errors.areaOfResidence}
            >
              <Input
                id="areaOfResidence"
                name="areaOfResidence"
                defaultValue={participant.areaOfResidence}
                required
                className="h-11"
              />
            </Field>

            <Field
              id="residenceStatus"
              label="Residence status"
              required
              error={errors.residenceStatus}
            >
              <Select
                name="residenceStatus"
                defaultValue={participant.residenceStatus}
              >
                <SelectTrigger id="residenceStatus" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bachelor">Bachelor</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Separator />

          {/* ---- measurements ---- */}
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="heightCm" label="Height (cm)" error={errors.heightCm}>
              <Input
                id="heightCm"
                name="heightCm"
                type="number"
                step="0.1"
                min={50}
                max={250}
                defaultValue={participant.heightCm ?? ""}
                className="tabular h-11"
              />
            </Field>

            <Field
              id="weightKg"
              label="Weight (kg)"
              required
              error={errors.weightKg}
              hint="Decides which diet plan suits them."
            >
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                step="0.1"
                min={20}
                max={300}
                defaultValue={participant.weightKg}
                required
                className="tabular h-11"
              />
            </Field>

            <Field
              id="startingWeightKg"
              label="Starting weight (kg)"
              error={errors.startingWeightKg}
            >
              <Input
                id="startingWeightKg"
                name="startingWeightKg"
                type="number"
                step="0.1"
                min={20}
                max={300}
                defaultValue={participant.startingWeightKg ?? ""}
                className="tabular h-11"
              />
            </Field>
          </div>

          <Separator />

          {/* ---- programme ---- */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="dietCategoryId"
              label="Diet category"
              error={errors.dietCategoryId}
              hint="V5 section 6. Suggested from age and weight, confirmed here."
            >
              <Select
                name="dietCategoryId"
                defaultValue={
                  participant.dietCategoryId
                    ? String(participant.dietCategoryId)
                    : "none"
                }
              >
                <SelectTrigger id="dietCategoryId" className="h-11 w-full">
                  <SelectValue placeholder="Not assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="status"
              label="Status"
              required
              error={errors.status}
              hint="Registrations are active by default. On hold stops someone competing without removing their records; they cannot sign in, log a day or appear on the leaderboard."
            >
              <Select name="status" defaultValue={participant.status}>
                <SelectTrigger id="status" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active — competing</SelectItem>
                  <SelectItem value="pending">On hold — not competing</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            id="reason"
            label="Reason for the change"
            error={errors.reason}
            hint="Recorded in the audit history alongside the old and new values."
          >
            <Textarea id="reason" name="reason" rows={2} maxLength={500} />
          </Field>

          <div className="flex justify-end border-t pt-5">
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
