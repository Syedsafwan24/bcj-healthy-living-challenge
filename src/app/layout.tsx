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

  // Without these, a link pasted into WhatsApp or Slack shows nothing but the
  // bare hostname. The <meta name="description"> Next writes from the field
  // above is not what those readers look at — they read og:*.
  //
  // The card itself is src/app/opengraph-image.png, which Next picks up by
  // filename and turns into og:image and its dimensions. Regenerate it with
  // `npm run og:build`.
  openGraph: {
    type: "website",
    siteName: "BCJ Healthy Living Challenge",
    title: "BCJ Healthy Living Challenge",
    description:
      "Twelve weeks of small daily habits, run by Bhatkal Community Jeddah. Fill in your day in under a minute and watch your score build.",
    url: "/",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "BCJ Healthy Living Challenge",
    description:
      "Twelve weeks of small daily habits, run by Bhatkal Community Jeddah.",
  },
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
