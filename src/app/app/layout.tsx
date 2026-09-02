import { ParticipantNav } from "@/components/participant-nav";
import { requireParticipant } from "@/lib/auth/guards";

import { signOut } from "../login/actions";

/**
 * Every participant route is scoped to the signed-in participant
 * (specification section 5.1). The session is derived here from the cookie,
 * and each page re-derives it rather than trusting a prop.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireParticipant();

  return (
    <div className="flex min-h-dvh flex-col">
      <ParticipantNav
        displayName={session.displayName}
        registrationId={session.registrationId}
        signOut={signOut}
      />
      {/* Bottom padding clears the mobile navigation bar. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-6 md:pb-12">
        {children}
      </main>
    </div>
  );
}
