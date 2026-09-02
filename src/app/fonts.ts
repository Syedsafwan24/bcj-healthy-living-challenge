import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Fonts — build specification section 9.4.
 *
 * Both are loaded through next/font/google, which downloads the files at
 * build time and serves them from the application's own origin, so there is
 * no runtime request to Google.
 *
 * Inter has tabular figures, which keeps leaderboard columns aligned and
 * stops the point counter from changing width as digits change. Apply the
 * `.tabular` class to every score, percentage, point counter, rank and step
 * count.
 *
 * JetBrains Mono is used wherever a registration ID appears, so that 0 and O,
 * and 1 and l, are distinguishable when a participant reads the code back
 * over the phone.
 */

export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
