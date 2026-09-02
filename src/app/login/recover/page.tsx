import Link from "next/link";
import type { Metadata } from "next";

import { PublicShell } from "@/components/public-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { RecoverForm } from "./recover-form";

export const metadata: Metadata = {
  title: "Recover your registration ID",
  robots: { index: false },
};

/**
 * Dynamically rendered so the per-request CSP nonce from `src/middleware.ts`
 * reaches this page's script tags. A statically prerendered page is generated
 * at build time and cannot carry a per-request nonce, so its scripts would be
 * blocked by the Content-Security-Policy and the page would never hydrate.
 */
export const dynamic = "force-dynamic";

/**
 * `/login/recover` — enter an email address, receive all IDs registered
 * against it (specification sections 2.1 and 5.1).
 */
export default function RecoverPage() {
  return (
    <PublicShell action="none">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-16 sm:py-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Recover your ID</CardTitle>
            <CardDescription>
              Enter the email address you registered with. Every registration ID
              held against it will be sent there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecoverForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign-in
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
