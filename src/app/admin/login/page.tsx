import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/lib/env";

import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Organiser sign-in",
  robots: { index: false, follow: false },
};

/** `/admin/login` — email, password and TOTP (specification section 2.3). */
export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <AuthHeader backHref="/" backLabel="Home" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
        <Card>
          <CardHeader className="space-y-2">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-green-900 text-green-100">
              <ShieldCheck className="size-5" />
            </span>
            <CardTitle className="text-2xl">Organiser sign-in</CardTitle>
            <CardDescription>
              {env.adminRequireTotp
                ? "Email, password and a code from your authenticator app. All three are required every time."
                : "Email and password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-72 w-full" />}>
              <AdminLoginForm requireTotp={env.adminRequireTotp} />
            </Suspense>
          </CardContent>
        </Card>

        {env.adminRequireTotp && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Lost your phone?{" "}
            <Link
              href="/admin/recovery"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Use a recovery code
            </Link>
          </p>
        )}
        <p className="mt-2 text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Participant sign-in
          </Link>
        </p>
      </main>
    </div>
  );
}
