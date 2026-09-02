import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

import { inter, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Without this Next resolves canonical and Open Graph URLs against
  // localhost, so a shared link previews as a broken local address.
  metadataBase: new URL(env.appUrl),
  title: {
    default: "BCJ Healthy Living Challenge",
    template: "%s · BCJ Healthy Living Challenge",
  },
  description:
    "The 12-week healthy lifestyle challenge run by Bhatkal Community Jeddah. Log your day, follow your score and see the leaderboard.",
  applicationName: "BCJ Healthy Living Challenge",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#023223", // BCJ brand colour
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          inter.variable,
          mono.variable,
          "min-h-dvh bg-background text-foreground antialiased",
        )}
      >
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
