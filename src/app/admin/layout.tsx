import type { Metadata } from "next";

import { AdminShell } from "@/components/admin-shell";
import { getAdminSession, touchAdminSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

import { adminSignOut } from "./login/actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The admin area — build specification section 5.2.
 *
 * The sign-in, invite and recovery routes render their own chrome, so this
 * layout only wraps a signed-in admin. Each page still calls `requireAdmin`
 * itself; a layout is not an authorisation boundary in the App Router,
 * because a page can render without its parent layout re-running on a
 * client-side navigation.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  // Signed out, mid-enrolment, or on /admin/login, /admin/invite,
  // /admin/recovery: the page renders its own layout.
  if (!session || (env.adminRequireTotp && !session.totpEnrolled)) {
    return <>{children}</>;
  }

  await touchAdminSession(session.sessionId);

  return (
    <AdminShell
      name={session.name}
      email={session.email}
      signOut={adminSignOut}
    >
      {children}
    </AdminShell>
  );
}
