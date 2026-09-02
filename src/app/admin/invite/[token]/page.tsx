import { ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { generateTotpSecret, totpUri } from "@/lib/auth/totp";
import { env } from "@/lib/env";

import { lookupInvite } from "./actions";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Accept your invitation",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * `/admin/invite/[token]` — set a password and enrol TOTP in one step
 * (specification section 2.3).
 *
 * The secret is generated here, rendered as a QR code, and travels back with
 * the form so the code the admin types is checked against the same secret.
 * It is encrypted with AES-256-GCM only once enrolment succeeds.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await lookupInvite(token);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <AuthHeader backHref="/" backLabel="Home" />

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-12">
        {!invite ? (
          <Alert variant="destructive">
            <AlertTitle>This invitation is not valid</AlertTitle>
            <AlertDescription>
              Invitations are single use and expire after 48 hours. Ask another
              organiser to send you a new one.
            </AlertDescription>
          </Alert>
        ) : (
          <InviteCard token={token} email={invite.email} name={invite.name} />
        )}
      </main>
    </div>
  );
}

async function InviteCard({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const requireTotp = env.adminRequireTotp;
  const secret = generateTotpSecret();
  const uri = requireTotp ? totpUri(secret, email) : "";
  const qrDataUrl = requireTotp
    ? await QRCode.toDataURL(uri, {
        margin: 1,
        width: 220,
        errorCorrectionLevel: "M",
      })
    : "";

  return (
    <Card>
      <CardHeader className="space-y-2">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-green-900 text-green-100">
          <ShieldCheck className="size-5" />
        </span>
        <CardTitle className="text-2xl">Welcome, {name}</CardTitle>
        <CardDescription>
          You are setting up an organiser account for {email}.{" "}
          {requireTotp
            ? "Choose a password and enrol your authenticator app. Both are required on every sign-in."
            : "Choose a password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm
          token={token}
          secret={secret}
          qrDataUrl={qrDataUrl}
          uri={uri}
          requireTotp={requireTotp}
        />
      </CardContent>
    </Card>
  );
}
