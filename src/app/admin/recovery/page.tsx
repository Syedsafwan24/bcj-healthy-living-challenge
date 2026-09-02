import Link from "next/link";
import { KeyRound } from "lucide-react";
import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = {
  title: "Sign in with a recovery code",
  robots: { index: false, follow: false },
};

/**
 * `/admin/recovery` — build specification section 2.3.
 *
 * There is no password-reset link that bypasses TOTP. A locked-out admin is
 * restored by another super admin, or by one of the eight single-use recovery
 * codes issued at enrolment.
 */
export default function AdminRecoveryPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <AuthHeader backHref="/admin/login" backLabel="Sign-in" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
        <Card>
          <CardHeader className="space-y-2">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-green-900 text-green-100">
              <KeyRound className="size-5" />
            </span>
            <CardTitle className="text-2xl">Use a recovery code</CardTitle>
            <CardDescription>
              Your password plus one of the eight codes you saved when you
              enrolled. Each code works once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecoveryForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm leading-relaxed text-muted-foreground">
          Out of codes? Another organiser can disable and re-invite your account
          from the Accounts screen. There is no email-only reset path.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link
            href="/admin/login"
            className="underline-offset-4 hover:underline"
          >
            Back to sign-in
          </Link>
        </p>
      </main>
    </div>
  );
}
