import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Mail, MailWarning } from "lucide-react";
import type { Metadata } from "next";

import { PublicShell } from "@/components/public-shell";
import { RegistrationIdCard } from "@/components/registration-id";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isRegistrationId } from "@/lib/registration-id";

export const metadata: Metadata = {
  title: "You are registered",
  robots: { index: false },
};

/**
 * `/register/success` — displays the registration ID on screen and confirms
 * it has been emailed (specification section 5.1).
 */
export default async function RegisterSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; emailed?: string }>;
}) {
  const params = await searchParams;
  const registrationId = params.id ?? "";

  // Nothing sensitive is behind this page, but a malformed or absent ID means
  // the visitor arrived by hand rather than from the form.
  if (!isRegistrationId(registrationId)) redirect("/register");

  const emailed = params.emailed === "1";

  return (
    <PublicShell action="login">
      <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
        <div className="mb-8 flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100">
            <CheckCircle2 className="size-6" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            You are registered
          </h1>
        </div>

        <RegistrationIdCard value={registrationId} />

        <Alert className="mt-6">
          {emailed ? (
            <Mail className="size-4" />
          ) : (
            <MailWarning className="size-4" />
          )}
          <AlertTitle>
            {emailed ? "A copy is on its way" : "Write this ID down now"}
          </AlertTitle>
          <AlertDescription>
            {emailed
              ? "We have emailed your registration ID to the address you gave. If it has not arrived in a few minutes, check your spam folder."
              : "The confirmation email could not be sent just now. Save this ID before you leave this page. You can also recover it later from the sign-in screen."}
          </AlertDescription>
        </Alert>

        <div className="mt-8 space-y-4 rounded-xl border bg-muted/40 p-5">
          <h2 className="font-semibold">What happens next</h2>
          <ol className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-3">
              <span className="tabular font-semibold text-foreground">1.</span>
              <span>
                Your account is ready now. Sign in with the registration ID
                above — there is nothing to wait for.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="tabular font-semibold text-foreground">2.</span>
              <span>
                A BCJ organiser confirms your diet plan, which is set from your
                age and weight. You can start filling in your days before then.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="tabular font-semibold text-foreground">3.</span>
              <span>
                Week 1 begins on the official start date. Only water is tracked
                that week, alongside your lunch and dinner.
              </span>
            </li>
          </ol>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-12">
            <Link href="/login">Go to sign-in</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/register">Register someone else</Link>
          </Button>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Registering a family? Each person needs their own registration, and
          each gets their own ID. The same email address can be used for all of
          them.
        </p>
      </div>
    </PublicShell>
  );
}
