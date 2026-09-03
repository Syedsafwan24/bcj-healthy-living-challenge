import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { RegistrationId } from "@/components/registration-id";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { requireParticipant } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { getParticipantProfile } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "My details", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/profile` — the participant's own details (section 5.1).
 *
 * Split in two on purpose. The card below holds what the organisers own: the
 * registration ID they sign in with, the name published on the leaderboard,
 * and the diet category and gender that decide which division a prize is
 * awarded in. The form beneath holds what describes the person, which they
 * can correct themselves.
 */
export default async function ProfilePage() {
  const session = await requireParticipant();
  const settings = await getSettings();
  const profile = await getParticipantProfile(session.participantId);

  if (!profile) return null;

  // Held by the organisers. Each one either identifies the participant, is
  // published, or decides the division a prize is judged in. Full name
  // doubles as the display name everywhere that column is read, so it is
  // listed once.
  const rows: Array<[string, React.ReactNode]> = [
    ["Full name", profile.fullName],
    ["Email", profile.email],
    ["Gender", profile.gender === "male" ? "Male" : "Female"],
    ["Diet category", profile.dietTitle ?? "Not assigned yet"],
    [
      "Registered",
      formatDateTime(profile.registeredAt, settings.timezone),
    ],
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My details
        </h1>
        <p className="text-muted-foreground">
          You can correct your contact details below. For anything else, speak
          to a BCJ organiser.
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg">
              <RegistrationId value={profile.registrationId} size="md" />
            </CardTitle>
            <Badge
              variant={profile.status === "active" ? "default" : "secondary"}
              className="capitalize"
            >
              {profile.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            This is your sign-in code. Keep it private: anyone who has it can
            open your account.
          </p>
        </CardHeader>

        <CardContent>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-right text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your details</CardTitle>
          <p className="text-sm text-muted-foreground">
            Keep these up to date so BCJ can reach you. Every change is
            recorded.
          </p>
        </CardHeader>
        <CardContent>
          <ProfileForm
            profile={{
              mobile: profile.mobile,
              age: profile.age,
              weightKg: profile.weightKg,
            }}
          />
        </CardContent>
      </Card>

      <Alert>
        <ShieldCheck className="size-4" />
        <AlertTitle>Your health information</AlertTitle>
        <AlertDescription>
          Blood group, blood pressure, diabetes status and blood sugar are
          stored separately and are visible only to BCJ organisers. They never
          appear on the leaderboard.
        </AlertDescription>
      </Alert>
    </div>
  );
}
